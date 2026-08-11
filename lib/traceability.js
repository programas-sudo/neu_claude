import { supabase } from "./supabaseClient";
import { conectarEntradasConStock, reingresarStockPorFilas } from "./stock";

/* =========================================================
   ORDEN DE FILAS PARA MOSTRAR (sale antes que entra, agrupado
   por posición) — se usa en pantalla y en el PDF
   ========================================================= */
export function ordenarFilas(filas) {
  const ordenAccion = { sale: 0, entra: 1, permanece: 2 };
  return [...filas].sort((a, b) => {
    const pa = String(a.posicion || "");
    const pb = String(b.posicion || "");
    if (pa !== pb) return pa.localeCompare(pb, undefined, { numeric: true });
    return (ordenAccion[a.accion] ?? 9) - (ordenAccion[b.accion] ?? 9);
  });
}

/* =========================================================
   BÚSQUEDA POR MATRÍCULA (coincidencia parcial) — solo lectura,
   NUNCA crea vehículos
   ========================================================= */
export async function buscarVehiculosPorMatricula(texto) {
  const { data, error } = await supabase
    .from("vehiculos")
    .select("*")
    .ilike("matricula", `%${texto}%`)
    .order("matricula");
  if (error) throw error;
  return data;
}

// Búsqueda EXACTA (para la pantalla de carga: solo busca, no crea)
// Listado completo de patentes cargadas (para el desplegable).
// Renombra la patente de un vehículo ya creado (para corregir un typo
// viejo). No crea uno nuevo ni mueve nada: solo corrige el dato.
export async function renombrarPatente(vehiculoId, patenteNueva) {
  const nueva = patenteNueva.trim().toUpperCase();
  const { error: errVehiculo } = await supabase
    .from("vehiculos")
    .update({ matricula: nueva })
    .eq("id", vehiculoId);
  if (errVehiculo) throw errVehiculo;

  // las planillas guardan la patente duplicada para búsquedas rápidas
  const { error: errPlanillas } = await supabase
    .from("planillas")
    .update({ matricula: nueva })
    .eq("vehiculo_id", vehiculoId);
  if (errPlanillas) throw errPlanillas;
}

export async function getTodasLasPatentes() {
  const { data, error } = await supabase.from("vehiculos").select("id, matricula").order("matricula");
  if (error) throw error;
  return data;
}

export async function buscarVehiculoExacto(matricula) {
  const { data, error } = await supabase
    .from("vehiculos")
    .select("*")
    .eq("matricula", matricula.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data; // null si no existe
}

// Estado actual (una fila por posición) de un vehículo.
// tiene_neumatico = false significa que la última acción registrada
// en esa posición fue "sale" y no se cargó reemplazo todavía.
export async function getEstadoActual(vehiculoId) {
  const { data, error } = await supabase
    .from("vw_estado_actual")
    .select("*")
    .eq("vehiculo_id", vehiculoId);
  if (error) throw error;
  // Se ordena acá (no en la base): "posicion" es texto, y ordenar como
  // texto da 1, 10, 11, 12, 2, 3... En vez de eso, se ordena numérico.
  return [...data].sort((a, b) =>
    String(a.posicion || "").localeCompare(String(b.posicion || ""), undefined, { numeric: true })
  );
}

// Historial cronológico de TODAS las planillas de un vehículo,
// de MÁS RECIENTE A MÁS ANTIGUA.
export async function getHistorialPlanillas(vehiculoId) {
  const { data: planillas, error } = await supabase
    .from("planillas")
    .select("*, planilla_neumaticos(*), adjuntos(*)")
    .eq("vehiculo_id", vehiculoId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return planillas.map((p) => ({
    ...p,
    planilla_neumaticos: ordenarFilas(p.planilla_neumaticos),
  }));
}

// Historial de TODAS las planillas cargadas (cualquier matrícula),
// de más reciente a más antigua. Se usa en la pantalla de búsqueda
// por matrícula, antes de que el usuario busque nada.
export async function getHistorialGlobal(limite = 40) {
  const { data, error } = await supabase
    .from("planillas")
    .select("id, matricula, vehiculo_id, tipo, fecha, chofer, created_at")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data;
}

export async function getVehiculoPorId(id) {
  const { data, error } = await supabase.from("vehiculos").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

/* =========================================================
   BÚSQUEDA AVANZADA DE NEUMÁTICOS: marca + medida + (número de
   serie O dot) — esa combinación es la que identifica a un
   neumático. Todos los campos admiten coincidencia parcial; no
   hace falta completar los 3 para buscar, pero cuantos más
   completes, más preciso el resultado (esto es lo que evita que
   se mezclen dos neumáticos distintos que comparten un mismo
   número por casualidad).
   ========================================================= */
export async function buscarNeumaticosAvanzado({ marca, medida, numero_serie, dot, recapado, conReparacion }) {
  let query = supabase
    .from("vw_historial_neumatico")
    .select("identificador, marca, medida, numero_serie, dot, modelo");

  if (marca && marca.trim()) query = query.ilike("marca", `%${marca.trim()}%`);
  if (medida && medida.trim()) query = query.ilike("medida", `%${medida.trim()}%`);
  if (numero_serie && numero_serie.trim()) query = query.ilike("numero_serie", `%${numero_serie.trim()}%`);
  if (dot && dot.trim()) query = query.ilike("dot", `%${dot.trim()}%`);
  // "en algún momento tuvo..." — busca en todo el historial, no solo el estado actual
  if (recapado === true) query = query.eq("recapado", true);
  if (recapado === false) query = query.eq("recapado", false);
  if (conReparacion) query = query.not("reparacion", "is", null);

  const { data, error } = await query.limit(500);
  if (error) throw error;

  const vistos = new Map();
  for (const row of data) {
    if (!vistos.has(row.identificador)) {
      vistos.set(row.identificador, {
        identificador: row.identificador,
        marca: row.marca,
        medida: row.medida,
        numero_serie: row.numero_serie,
        dot: row.dot,
        modelo: row.modelo,
      });
    }
  }

  // también busca en el stock (neumáticos comprados, todavía sin instalar)
  let queryStock = supabase
    .from("stock_neumaticos")
    .select("marca, medida, numero_serie, dot, modelo")
    .is("fecha_salida", null);
  if (marca && marca.trim()) queryStock = queryStock.ilike("marca", `%${marca.trim()}%`);
  if (medida && medida.trim()) queryStock = queryStock.ilike("medida", `%${medida.trim()}%`);
  if (numero_serie && numero_serie.trim())
    queryStock = queryStock.ilike("numero_serie", `%${numero_serie.trim()}%`);
  if (dot && dot.trim()) queryStock = queryStock.ilike("dot", `%${dot.trim()}%`);

  const { data: stock, error: errStock } = await queryStock.limit(500);
  if (errStock) throw errStock;

  for (const item of stock) {
    const identificador = `${item.marca || ""}|${item.medida || ""}|${
      item.numero_serie ? "S:" + item.numero_serie : "D:" + (item.dot || "")
    }`;
    if (!vistos.has(identificador)) {
      vistos.set(identificador, {
        identificador,
        marca: item.marca,
        medida: item.medida,
        numero_serie: item.numero_serie,
        dot: item.dot,
        modelo: item.modelo,
        soloEnStock: true,
      });
    }
  }

  return Array.from(vistos.values());
}

// Registro de stock de un neumático puntual (para cuando el resultado
// de la búsqueda es algo que todavía no se instaló en ningún equipo).
export async function getRegistroStock({ marca, medida, numero_serie, dot }) {
  let query = supabase.from("stock_neumaticos").select("*").is("fecha_salida", null);
  query = marca ? query.eq("marca", marca) : query.is("marca", null);
  query = medida ? query.eq("medida", medida) : query.is("medida", null);
  query = numero_serie ? query.eq("numero_serie", numero_serie) : query.eq("dot", dot);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

// Trayecto EXACTO de un neumático puntual: se filtra por marca + medida
// + el campo que corresponda (serie o dot), todos con igualdad exacta,
// para no mezclarlo con otro neumático que comparta el mismo valor.
export async function getHistorialNeumaticoExacto({ marca, medida, numero_serie, dot }) {
  let query = supabase.from("vw_historial_neumatico").select("*");

  query = marca ? query.eq("marca", marca) : query.is("marca", null);
  query = medida ? query.eq("medida", medida) : query.is("medida", null);
  query = numero_serie ? query.eq("numero_serie", numero_serie) : query.eq("dot", dot);

  const { data, error } = await query.order("fecha", { ascending: true });
  if (error) throw error;
  return data;
}

// Determina la ubicación VIGENTE de un neumático a partir de su trayecto.
// Corrige el bug donde un neumático que salió y no volvió a entrar en
// ningún lado seguía figurando como instalado en el vehículo del que salió.
// Proveedor de un neumático: es un atributo del neumático (su origen),
// no de una fila puntual. Se busca en cualquier momento de su historia,
// sin importar cuándo se haya cargado ese dato.
export async function getProveedorNeumatico({ marca, medida, numero_serie, dot }) {
  let query = supabase.from("vw_proveedor_neumatico").select("proveedor");
  query = marca ? query.eq("marca", marca) : query.is("marca", null);
  query = medida ? query.eq("medida", medida) : query.is("medida", null);
  query = numero_serie ? query.eq("numero_serie", numero_serie) : query.eq("dot", dot);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? data.proveedor : null;
}

export function getUbicacionVigente(filasTrayecto) {
  if (!filasTrayecto || filasTrayecto.length === 0) return null;
  const ultima = filasTrayecto[filasTrayecto.length - 1];
  if (ultima.accion === "sale") {
    return {
      instalado: false,
      fecha: ultima.fecha,
      matricula: ultima.matricula,
      posicion: ultima.posicion,
      destino: ultima.destino,
    };
  }

  // La fecha de "vigente desde" es la del comienzo REAL de esta estadía en
  // la posición, no la de la última fila. Retrocedemos mientras sea el
  // mismo vehículo/posición y no haya un "sale" en el medio: eso evita que
  // una fila de "permanece" que solo actualiza el estado (un recapado, un
  // cambio de desgaste) se muestre como si fuera una instalación nueva.
  let inicio = filasTrayecto.length - 1;
  for (let i = filasTrayecto.length - 2; i >= 0; i--) {
    const fila = filasTrayecto[i];
    const mismaUbicacion =
      fila.matricula === ultima.matricula && String(fila.posicion) === String(ultima.posicion);
    if (!mismaUbicacion || fila.accion === "sale") break;
    inicio = i;
    if (fila.accion === "entra") break; // "entra" marca el comienzo de esta estadía
  }

  return {
    instalado: true,
    fecha: filasTrayecto[inicio].fecha,
    matricula: ultima.matricula,
    posicion: ultima.posicion,
  };
}

/* =========================================================
   ESTADO DE UN VEHÍCULO EN UN MOMENTO ESPECÍFICO (antes de
   una planilla dada). Se usa para el informe automático y
   para no dejar "huecos": si guardás/editás una planilla con
   fecha anterior a otras, compara contra lo que correspondía
   en ESE momento, no contra el estado global más reciente.
   ========================================================= */
// Dentro de UNA planilla, si una posición tiene más de una fila (por
// ejemplo "sale" + "entra"), la que manda es la que se cargó MÁS ABAJO
// en el formulario (orden_en_planilla más alto) — así se respeta el
// orden real en que se completó la planilla, de arriba hacia abajo.
function filaVigentePorPosicion(filasPlanilla) {
  const mapa = new Map();
  for (const fila of filasPlanilla) {
    if (!fila.posicion) continue;
    const pos = String(fila.posicion);
    const actual = mapa.get(pos);
    const ordenFila = fila.orden_en_planilla ?? 0;
    const ordenActual = actual ? actual.orden_en_planilla ?? 0 : -Infinity;
    if (!actual || ordenFila >= ordenActual) {
      mapa.set(pos, fila);
    }
  }
  return mapa;
}

export async function getEstadoAntesDe(vehiculoId, fechaReferencia, createdAtReferencia, excluirPlanillaId) {
  const { data: planillas, error } = await supabase
    .from("planillas")
    .select("id, fecha, created_at, planilla_neumaticos(*)")
    .eq("vehiculo_id", vehiculoId)
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const anteriores = planillas.filter((p) => {
    if (excluirPlanillaId && p.id === excluirPlanillaId) return false;
    if (p.fecha < fechaReferencia) return true;
    if (p.fecha === fechaReferencia && p.created_at < createdAtReferencia) return true;
    return false;
  });

  const porPosicion = new Map();
  for (const p of anteriores) {
    const vigentesDeEstaPlanilla = filaVigentePorPosicion(p.planilla_neumaticos);
    for (const [pos, fila] of vigentesDeEstaPlanilla) {
      porPosicion.set(pos, { ...fila, fecha: p.fecha });
    }
  }
  return Array.from(porPosicion.values());
}

/* =========================================================
   VEHÍCULO: obtener o crear. SOLO se llama desde guardarPlanilla,
   nunca desde la búsqueda/carga inicial — así no quedan
   vehículos "fantasma" sin ninguna planilla si se cancela la carga.
   ========================================================= */
async function getOrCrearVehiculo(matricula, tipo_vehiculo, num_posiciones) {
  const existente = await buscarVehiculoExacto(matricula);
  if (existente) return existente;

  const { data: nuevo, error } = await supabase
    .from("vehiculos")
    .insert({
      matricula: matricula.trim().toUpperCase(),
      tipo_vehiculo: tipo_vehiculo || null,
      num_posiciones: num_posiciones || 4,
    })
    .select()
    .single();
  if (error) throw error;
  return nuevo;
}

/* =========================================================
   SALIDA IMPLÍCITA: dar de baja automáticamente al neumático que
   estaba antes en una posición, cuando la fila nueva de esa
   posición corresponde a un neumático DISTINTO y no se cargó una
   fila "sale" explícita. Cubre dos casos:
   1) Movimiento con fila "entra" sin su "sale" correspondiente.
   2) Relevamiento (fila "permanece") donde la goma cargada ahora
      es distinta a la del relevamiento/movimiento anterior — pasa
      seguido si entre dos relevamientos no se cargó un movimiento
      explícito. No se completa un "destino": eso solo se sabe si
      se carga una planilla de movimiento.
   Si el usuario SÍ cargó la fila "sale" con sus motivos, esto no
   la reemplaza: solo actúa cuando falta.
   ========================================================= */
function completarSalidasImplicitas(filas, estadoAnterior) {
  const posicionesConSaleExplicita = new Set(
    filas.filter((f) => f.accion === "sale" && f.posicion).map((f) => String(f.posicion))
  );
  const yaCompletadas = new Set();
  const resultado = [];

  for (const fila of filas) {
    const pos = fila.posicion ? String(fila.posicion) : null;
    const esCandidata =
      pos &&
      (fila.accion === "entra" || fila.accion === "permanece") &&
      !posicionesConSaleExplicita.has(pos) &&
      !yaCompletadas.has(pos);

    if (esCandidata) {
      const prev = estadoAnterior.find((e) => String(e.posicion) === pos);
      const habiaNeumatico = prev && prev.tiene_neumatico !== false && (prev.marca || prev.numero_serie || prev.dot);

      let esReemplazo = fila.accion === "entra"; // "entra" siempre reemplaza a lo que hubiera
      if (fila.accion === "permanece" && habiaNeumatico) {
        const claveAnterior = claveIdentidad(prev);
        const claveNueva = claveIdentidad(fila);
        const esElMismo = claveAnterior && claveNueva ? claveAnterior === claveNueva : !claveAnterior && !claveNueva;
        esReemplazo = !esElMismo;
      }

      if (esReemplazo && habiaNeumatico) {
        // se agrega ANTES de la fila actual, respetando el orden real:
        // primero sale el que estaba, después queda registrado el nuevo.
        resultado.push({
          posicion: pos,
          accion: "sale",
          marca: prev.marca || "",
          modelo: prev.modelo || "",
          medida: prev.medida || "",
          numero_serie: prev.numero_serie || "",
          dot: prev.dot || "",
          estado: prev.estado || "",
          porcentaje_desgaste: prev.porcentaje_desgaste ?? "",
          recapado: prev.recapado || false,
          reparacion: "",
          procedencia: "",
          destino:
            fila.accion === "entra"
              ? "Salida registrada automáticamente (reemplazado, sin motivo especificado)"
              : "Salida detectada automáticamente: en el siguiente relevamiento figura otro neumático en esta posición, sin movimiento registrado en el medio",
          generado_automaticamente: true,
        });
        yaCompletadas.add(pos);
      }
    }
    resultado.push(fila);
  }

  return resultado;
}

/* =========================================================
   INFORME AUTOMÁTICO
   ========================================================= */
/* =========================================================
   INFORME AUTOMÁTICO
   Agrupa las filas por posición ANTES de comparar, para que una
   posición con fila "sale" + fila "entra" (lo más común en un
   movimiento) genere UNA sola línea coherente, en vez de que cada
   fila se compare por separado contra el estado anterior y se
   pisen entre sí.
   ========================================================= */
export function generarInformeAutomatico(estadoAnterior, filasNuevas) {
  const anteriorPorPosicion = new Map(estadoAnterior.map((f) => [String(f.posicion), f]));

  const porPosicion = new Map();
  for (const fila of filasNuevas) {
    if (!fila.posicion) continue;
    const pos = String(fila.posicion);
    if (!porPosicion.has(pos)) porPosicion.set(pos, []);
    porPosicion.get(pos).push(fila);
  }

  const lineas = [];

  for (const [pos, filasPos] of porPosicion) {
    const prev = anteriorPorPosicion.get(pos);
    const filaEntra = filasPos.find((f) => f.accion === "entra");
    const filaSale = filasPos.find((f) => f.accion === "sale");
    const filaPermanece = filasPos.find((f) => f.accion === "permanece") || filasPos[0];

    // Caso 1: entró un neumático a esta posición (con o sin fila "sale" explícita)
    if (filaEntra) {
      const salida = filaSale || prev;
      const habiaAlgo = salida && (salida.numero_serie || salida.dot || salida.marca);
      if (!habiaAlgo) {
        lineas.push(
          `Posición ${pos}: primer registro para esta posición (${filaEntra.marca || "s/marca"} ${filaEntra.modelo || ""}, serie ${filaEntra.numero_serie || filaEntra.dot || "s/identificación"}).`
        );
      } else {
        lineas.push(
          `Posición ${pos}: CAMBIO DE NEUMÁTICO. Salió serie ${salida.numero_serie || salida.dot || "s/identificación"} (${salida.marca || ""} ${salida.modelo || ""}) → entró serie ${filaEntra.numero_serie || filaEntra.dot || "s/identificación"} (${filaEntra.marca || ""} ${filaEntra.modelo || ""}).`
        );
      }
      continue;
    }

    // Caso 2: hay "sale" + "permanece" de un neumático DISTINTO (típico de un
    // relevamiento donde cambió la goma sin pasar por una planilla de
    // movimiento) — es un reemplazo, no una posición vacía.
    if (filaSale && filaPermanece) {
      lineas.push(
        `Posición ${pos}: CAMBIO DE NEUMÁTICO (detectado en relevamiento, sin movimiento registrado). Salió serie ${filaSale.numero_serie || filaSale.dot || "s/identificación"} (${filaSale.marca || ""} ${filaSale.modelo || ""}) → entró serie ${filaPermanece.numero_serie || filaPermanece.dot || "s/identificación"} (${filaPermanece.marca || ""} ${filaPermanece.modelo || ""}).`
      );
      continue;
    }

    // Caso 3: solo salió, sin reemplazo cargado en esta misma planilla
    if (filaSale) {
      lineas.push(
        `Posición ${pos}: salió el neumático serie ${filaSale.numero_serie || filaSale.dot || "s/identificación"}. No se cargó reemplazo: queda SIN NEUMÁTICO.`
      );
      continue;
    }

    // Caso 4: "permanece" (mismo neumático que antes) — comparar contra el estado anterior
    const fila = filaPermanece;
    if (!prev) {
      lineas.push(
        `Posición ${pos}: primer registro para esta posición (${fila.marca || "s/marca"} ${fila.modelo || ""}, serie ${fila.numero_serie || fila.dot || "s/identificación"}).`
      );
      continue;
    }

    const claveAnterior = claveIdentidad(prev);
    const claveNueva = claveIdentidad(fila);
    const mismoSerial = claveAnterior && claveNueva ? claveAnterior === claveNueva : !claveAnterior && !claveNueva;

    if (!mismoSerial) {
      lineas.push(
        `Posición ${pos}: CAMBIO DE NEUMÁTICO. Salió serie ${prev.numero_serie || prev.dot || "s/identificación"} (${prev.marca || ""} ${prev.modelo || ""}) → entró serie ${fila.numero_serie || fila.dot || "s/identificación"} (${fila.marca || ""} ${fila.modelo || ""}).`
      );
      continue;
    }

    const cambios = [];
    if (
      prev.porcentaje_desgaste != null &&
      fila.porcentaje_desgaste != null &&
      Number(prev.porcentaje_desgaste) !== Number(fila.porcentaje_desgaste)
    ) {
      cambios.push(`desgaste ${prev.porcentaje_desgaste}% → ${fila.porcentaje_desgaste}%`);
    }
    if (prev.estado && fila.estado && prev.estado !== fila.estado) {
      cambios.push(`estado "${prev.estado}" → "${fila.estado}"`);
    }
    if (!prev.recapado && fila.recapado) cambios.push("se registró recapado");
    if (fila.reparacion) cambios.push(`reparación registrada: ${fila.reparacion}`);

    if (cambios.length > 0) {
      lineas.push(`Posición ${pos}: mismo neumático, ${cambios.join("; ")}.`);
    } else {
      lineas.push(`Posición ${pos}: sin cambios respecto al reporte anterior.`);
    }
  }

  return lineas.join("\n");
}

// Determina, fila por fila, si hubo un cambio real respecto al estado
// anterior (para no ensuciar el trayecto de un neumático con controles
// de rutina donde no pasó nada).
function calcularHuboCambio(fila, estadoAnterior) {
  if (fila.accion === "entra" || fila.accion === "sale") return true;

  const prev = estadoAnterior.find((e) => String(e.posicion) === String(fila.posicion));
  if (!prev) return true; // primer registro de esa posición

  const claveAnterior = claveIdentidad(prev);
  const claveNueva = claveIdentidad(fila);
  const mismoSerial = claveAnterior && claveNueva ? claveAnterior === claveNueva : !claveAnterior && !claveNueva;
  if (!mismoSerial) return true;

  if (
    prev.porcentaje_desgaste != null &&
    fila.porcentaje_desgaste != null &&
    Number(prev.porcentaje_desgaste) !== Number(fila.porcentaje_desgaste)
  )
    return true;
  if (prev.estado && fila.estado && prev.estado !== fila.estado) return true;
  if (!prev.recapado && fila.recapado) return true;
  if (fila.reparacion) return true;

  return false;
}

/* =========================================================
   IDENTIDAD DE UN NEUMÁTICO = marca + medida + (número de serie
   O dot). Dos neumáticos pueden compartir número de serie si son
   de marcas distintas — eso NO es un duplicado.
   ========================================================= */
function claveIdentidad(fila) {
  const marca = (fila.marca || "").trim();
  const medida = (fila.medida || "").trim();
  if (fila.numero_serie && fila.numero_serie.trim()) {
    return `${marca}|${medida}|S:${fila.numero_serie.trim()}`;
  }
  if (fila.dot && fila.dot.trim()) {
    return `${marca}|${medida}|D:${fila.dot.trim()}`;
  }
  return null;
}

/* =========================================================
   RECÁLCULO RETROACTIVO: si guardás o editás una planilla con una
   fecha ANTERIOR a otra que ya existía para el mismo vehículo (por
   ejemplo, cargás con atraso un relevamiento de papel), la planilla
   POSTERIOR puede necesitar ahora una salida automática que antes no
   hacía falta (porque en ese momento no había nada previo con qué
   comparar). Esto la recalcula: descarta sus salidas automáticas
   viejas y las vuelve a generar desde cero con el estado actualizado.
   Las filas que cargó el usuario a mano nunca se tocan.
   ========================================================= */
async function recalcularPlanilla(planillaId) {
  const { data: planilla, error } = await supabase
    .from("planillas")
    .select("id, vehiculo_id, matricula, fecha, created_at, planilla_neumaticos(*)")
    .eq("id", planillaId)
    .single();
  if (error) throw error;

  const filasReales = planilla.planilla_neumaticos.filter((f) => !f.generado_automaticamente);

  const estadoAnterior = await getEstadoAntesDe(
    planilla.vehiculo_id,
    planilla.fecha,
    planilla.created_at,
    planillaId
  );

  const filasCompletas = completarSalidasImplicitas(filasReales, estadoAnterior);
  const informe_automatico = generarInformeAutomatico(estadoAnterior, filasCompletas);

  const idsFilasViejas = planilla.planilla_neumaticos.map((f) => f.id);

  const { error: errDelete } = await supabase
    .from("planilla_neumaticos")
    .delete()
    .eq("planilla_id", planillaId);
  if (errDelete) throw errDelete;

  // deshace cualquier retiro de stock que hubiera quedado ligado a las
  // filas viejas, antes de reinsertar (se vuelve a calcular de cero)
  await reingresarStockPorFilas(idsFilasViejas);

  const filasParaInsertar = filasCompletas.map((f, idx) => ({
    planilla_id: planillaId,
    posicion: f.posicion || null,
    accion: f.accion,
    marca: f.marca || null,
    modelo: f.modelo || null,
    medida: f.medida || null,
    numero_serie: f.numero_serie || null,
    dot: f.dot || null,
    sin_identificacion: !f.numero_serie && !f.dot,
    estado: f.estado || null,
    porcentaje_desgaste: f.porcentaje_desgaste || null,
    recapado: !!f.recapado,
    reparacion: f.reparacion || null,
    procedencia: f.procedencia || null,
    destino: f.destino || null,
    hubo_cambio: calcularHuboCambio(f, estadoAnterior),
    orden_en_planilla: idx,
    generado_automaticamente: !!f.generado_automaticamente,
    proveedor: f.proveedor || null,
  }));

  const { data: filasInsertadas, error: errInsert } = await supabase
    .from("planilla_neumaticos")
    .insert(filasParaInsertar)
    .select();
  if (errInsert) throw errInsert;

  await conectarEntradasConStock(filasInsertadas, planilla.matricula || "", planilla.fecha);

  const { error: errUpdate } = await supabase
    .from("planillas")
    .update({ informe_automatico })
    .eq("id", planillaId);
  if (errUpdate) throw errUpdate;
}

// Busca la planilla siguiente en el tiempo (mismo vehículo) y, si existe,
// la recalcula. No hace falta ir más allá de esa: lo que una planilla deja
// como estado "vigente" de cada posición depende solo de sus propias filas
// reales (no de las salidas automáticas que le agreguemos), así que el
// recálculo nunca necesita encadenarse más de un paso hacia adelante.
async function recalcularSiguientePlanillaSiExiste(vehiculoId, fecha, createdAt, planillaIdExcluir) {
  const { data: planillas, error } = await supabase
    .from("planillas")
    .select("id, fecha, created_at")
    .eq("vehiculo_id", vehiculoId)
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const siguiente = planillas.find((p) => {
    if (p.id === planillaIdExcluir) return false;
    if (p.fecha > fecha) return true;
    if (p.fecha === fecha && p.created_at > createdAt) return true;
    return false;
  });

  if (siguiente) {
    await recalcularPlanilla(siguiente.id);
  }
}

/* =========================================================
   VALIDACIONES COMUNES (duplicados + consistencia entre vehículos)
   ========================================================= */
async function validarFilas(filas, vehiculoId) {
  // Agrupamos por identidad (marca+medida+serie/DOT) y por acción. Que una
  // goma aparezca una vez como "sale" y una vez como "entra" en la misma
  // planilla es válido y esperado: es un movimiento interno (cambio de
  // posición dentro del mismo equipo). Lo que NO es válido es que la misma
  // acción se repita para la misma goma (dos "entra", o dos "sale").
  const conteoPorClaveYAccion = new Map(); // "clave|accion" -> cantidad
  for (const fila of filas) {
    const clave = claveIdentidad(fila);
    if (!clave) continue;
    const llave = `${clave}|${fila.accion}`;
    conteoPorClaveYAccion.set(llave, (conteoPorClaveYAccion.get(llave) || 0) + 1);
  }
  const repetidos = [...conteoPorClaveYAccion.entries()].filter(([, cant]) => cant > 1);
  if (repetidos.length > 0) {
    const ejemplos = repetidos.map(([llave, cant]) => {
      const [marca, medida, idParte, accion] = llave.split("|");
      return `${marca} / ${medida} / ${idParte} (${accion} x${cant})`;
    });
    throw new Error(
      `Hay fila(s) repetidas para el mismo neumático con la misma acción dentro de la planilla: ${ejemplos.join(", ")}`
    );
  }

  const avisos = [];
  for (const fila of filas) {
    if (fila.accion === "entra" && (fila.numero_serie || fila.dot)) {
      let query = supabase
        .from("vw_estado_actual")
        .select("matricula, posicion")
        .eq("tiene_neumatico", true)
        .neq("vehiculo_id", vehiculoId);
      if (fila.numero_serie) query = query.eq("numero_serie", fila.numero_serie);
      else query = query.eq("dot", fila.dot);
      if (fila.marca) query = query.eq("marca", fila.marca);
      if (fila.medida) query = query.eq("medida", fila.medida);

      const { data: activasEnOtroLado } = await query;
      if (activasEnOtroLado && activasEnOtroLado.length > 0) {
        avisos.push(
          `El neumático ${fila.marca || ""} serie/DOT ${fila.numero_serie || fila.dot} figura vigente en ${activasEnOtroLado
            .map((a) => `${a.matricula} pos.${a.posicion}`)
            .join(", ")}. Verificá que se haya registrado su salida allí.`
        );
      }
    }
  }
  return avisos;
}

/* =========================================================
   GUARDAR PLANILLA NUEVA
   El vehículo se crea recién acá (si no existía) — así nunca
   queda un vehículo cargado sin ninguna planilla.
   ========================================================= */
export async function guardarPlanilla({
  matricula,
  tipo,
  fecha,
  chofer,
  tipo_vehiculo,
  km,
  modo_carga,
  observaciones,
  filas,
  usuario,
}) {
  const vehiculo = await getOrCrearVehiculo(matricula, tipo_vehiculo, undefined);

  const ahora = new Date().toISOString();
  const estadoAnterior = await getEstadoAntesDe(vehiculo.id, fecha, ahora, undefined);

  const filasCompletas = completarSalidasImplicitas(filas, estadoAnterior);

  const avisos = await validarFilas(filasCompletas, vehiculo.id);

  const informe_automatico = generarInformeAutomatico(estadoAnterior, filasCompletas);

  const { data: planilla, error: errPlanilla } = await supabase
    .from("planillas")
    .insert({
      vehiculo_id: vehiculo.id,
      matricula: vehiculo.matricula,
      tipo,
      fecha,
      chofer: chofer || null,
      tipo_vehiculo: tipo_vehiculo || null,
      km: km || null,
      modo_carga: modo_carga || "completa",
      observaciones: observaciones || null,
      informe_automatico,
      creado_por_usuario_id: usuario?.id || null,
      creado_por_usuario_nombre: usuario?.nombre || null,
    })
    .select()
    .single();
  if (errPlanilla) throw errPlanilla;

  const filasParaInsertar = filasCompletas.map((f, idx) => ({
    planilla_id: planilla.id,
    posicion: f.posicion || null,
    accion: f.accion,
    marca: f.marca || null,
    modelo: f.modelo || null,
    medida: f.medida || null,
    numero_serie: f.numero_serie || null,
    dot: f.dot || null,
    sin_identificacion: !f.numero_serie && !f.dot,
    estado: f.estado || null,
    porcentaje_desgaste: f.porcentaje_desgaste || null,
    recapado: !!f.recapado,
    reparacion: f.reparacion || null,
    procedencia: f.procedencia || null,
    destino: f.destino || null,
    hubo_cambio: calcularHuboCambio(f, estadoAnterior),
    orden_en_planilla: idx,
    generado_automaticamente: !!f.generado_automaticamente,
    proveedor: f.proveedor || null,
  }));

  const { data: filasInsertadas, error: errDetalle } = await supabase
    .from("planilla_neumaticos")
    .insert(filasParaInsertar)
    .select();
  if (errDetalle) throw errDetalle;

  await conectarEntradasConStock(filasInsertadas, vehiculo.matricula, fecha);

  // si había una planilla posterior para este vehículo, se recalcula
  // (puede pasar a necesitar una salida automática que antes no hacía falta)
  await recalcularSiguientePlanillaSiExiste(vehiculo.id, fecha, planilla.created_at, planilla.id);

  return { planilla: { ...planilla, planilla_neumaticos: filasInsertadas }, vehiculo, avisos };
}

/* =========================================================
   BORRAR PLANILLA (con auditoría y reingreso de stock si corresponde)
   ========================================================= */
export async function borrarPlanilla(planillaId, usuario) {
  const { data: planilla, error } = await supabase
    .from("planillas")
    .select("*, planilla_neumaticos(*)")
    .eq("id", planillaId)
    .single();
  if (error) throw error;

  // deshace cualquier retiro de stock ligado a esta planilla
  await reingresarStockPorFilas(planilla.planilla_neumaticos.map((f) => f.id));

  // guarda una copia completa antes de borrar (auditoría)
  const { error: errAuditoria } = await supabase.from("planillas_borradas").insert({
    planilla_id_original: planilla.id,
    matricula: planilla.matricula,
    tipo: planilla.tipo,
    fecha: planilla.fecha,
    chofer: planilla.chofer,
    tipo_vehiculo: planilla.tipo_vehiculo,
    km: planilla.km,
    observaciones: planilla.observaciones,
    detalle: planilla.planilla_neumaticos,
    creado_por_usuario_nombre: planilla.creado_por_usuario_nombre || null,
    borrado_por_usuario_id: usuario.id,
    borrado_por_usuario_nombre: usuario.nombre,
  });
  if (errAuditoria) throw errAuditoria;

  const { error: errDelete } = await supabase.from("planillas").delete().eq("id", planillaId);
  if (errDelete) throw errDelete;

  // si había una planilla posterior, se recalcula sin esta
  await recalcularSiguientePlanillaSiExiste(
    planilla.vehiculo_id,
    planilla.fecha,
    planilla.created_at,
    planillaId
  );
}

/* =========================================================
   EDITAR PLANILLA EXISTENTE
   ========================================================= */
export async function getPlanillaCompleta(planillaId) {
  const { data, error } = await supabase
    .from("planillas")
    .select("*, planilla_neumaticos(*), adjuntos(*)")
    .eq("id", planillaId)
    .single();
  if (error) throw error;
  return { ...data, planilla_neumaticos: ordenarFilas(data.planilla_neumaticos) };
}

export async function actualizarPlanilla(planillaId, {
  vehiculoId,
  tipo,
  fecha,
  chofer,
  tipo_vehiculo,
  km,
  modo_carga,
  observaciones,
  filas,
}) {
  const { data: original, error: errOriginal } = await supabase
    .from("planillas")
    .select("created_at, matricula")
    .eq("id", planillaId)
    .single();
  if (errOriginal) throw errOriginal;

  const estadoAnterior = await getEstadoAntesDe(vehiculoId, fecha, original.created_at, planillaId);
  const filasCompletas = completarSalidasImplicitas(filas, estadoAnterior);
  const avisos = await validarFilas(filasCompletas, vehiculoId);
  const informe_automatico = generarInformeAutomatico(estadoAnterior, filasCompletas);

  const { error: errUpdate } = await supabase
    .from("planillas")
    .update({
      tipo,
      fecha,
      chofer: chofer || null,
      tipo_vehiculo: tipo_vehiculo || null,
      km: km || null,
      modo_carga: modo_carga || "completa",
      observaciones: observaciones || null,
      informe_automatico,
    })
    .eq("id", planillaId);
  if (errUpdate) throw errUpdate;

  const { data: filasViejas, error: errFilasViejas } = await supabase
    .from("planilla_neumaticos")
    .select("id")
    .eq("planilla_id", planillaId);
  if (errFilasViejas) throw errFilasViejas;

  const { error: errDelete } = await supabase.from("planilla_neumaticos").delete().eq("planilla_id", planillaId);
  if (errDelete) throw errDelete;

  // deshace cualquier retiro de stock ligado a las filas viejas, antes
  // de reinsertar (se vuelve a calcular de cero con los datos editados)
  await reingresarStockPorFilas((filasViejas || []).map((f) => f.id));

  const filasParaInsertar = filasCompletas.map((f, idx) => ({
    planilla_id: planillaId,
    posicion: f.posicion || null,
    accion: f.accion,
    marca: f.marca || null,
    modelo: f.modelo || null,
    medida: f.medida || null,
    numero_serie: f.numero_serie || null,
    dot: f.dot || null,
    sin_identificacion: !f.numero_serie && !f.dot,
    estado: f.estado || null,
    porcentaje_desgaste: f.porcentaje_desgaste || null,
    recapado: !!f.recapado,
    reparacion: f.reparacion || null,
    procedencia: f.procedencia || null,
    destino: f.destino || null,
    hubo_cambio: calcularHuboCambio(f, estadoAnterior),
    orden_en_planilla: idx,
    generado_automaticamente: !!f.generado_automaticamente,
    proveedor: f.proveedor || null,
  }));

  const { data: filasInsertadas, error: errInsert } = await supabase
    .from("planilla_neumaticos")
    .insert(filasParaInsertar)
    .select();
  if (errInsert) throw errInsert;

  await conectarEntradasConStock(filasInsertadas, original.matricula, fecha);

  // si había (o pasa a haber) una planilla posterior para este vehículo,
  // se recalcula con el estado ya actualizado
  await recalcularSiguientePlanillaSiExiste(vehiculoId, fecha, original.created_at, planillaId);

  return { avisos };
}

/* =========================================================
   ADJUNTOS
   ========================================================= */
export async function subirAdjunto(planillaId, file) {
  const nombreSeguro = file.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca acentos
    .replace(/[^a-zA-Z0-9._-]/g, "_"); // saca espacios y símbolos raros
  const path = `${planillaId}/${Date.now()}_${nombreSeguro}`;

  const { error: errUpload } = await supabase.storage.from("adjuntos").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (errUpload) {
    const detalle = errUpload.message || errUpload.error || "error desconocido";
    const pistaBucket = /bucket|not.?found/i.test(detalle)
      ? ' Revisá en Supabase > Storage que exista un bucket llamado exactamente "adjuntos" (público), y que hayas corrido supabase/migrations/003_correcciones2.sql.'
      : "";
    throw new Error(`No se pudo subir "${file.name}": ${detalle}.${pistaBucket}`);
  }

  const { data: pub } = supabase.storage.from("adjuntos").getPublicUrl(path);

  const { data: fila, error: errRow } = await supabase
    .from("adjuntos")
    .insert({
      planilla_id: planillaId,
      nombre_archivo: file.name,
      storage_path: path,
      url: pub.publicUrl,
      tipo_archivo: file.type,
    })
    .select()
    .single();
  if (errRow) throw errRow;

  return fila;
}

// Permite sacar un adjunto ya subido mientras se edita una planilla
export async function eliminarAdjunto(adjunto) {
  await supabase.storage.from("adjuntos").remove([adjunto.storage_path]);
  const { error } = await supabase.from("adjuntos").delete().eq("id", adjunto.id);
  if (error) throw error;
}
