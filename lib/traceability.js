import { supabase } from "./supabaseClient";

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
    .eq("vehiculo_id", vehiculoId)
    .order("posicion");
  if (error) throw error;
  return data;
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
   BÚSQUEDA POR NÚMERO DE SERIE / DOT (coincidencia parcial)
   ========================================================= */
export async function buscarNeumaticosPorIdentificador(texto) {
  const { data, error } = await supabase
    .from("vw_historial_neumatico")
    .select("identificador, numero_serie, dot, marca, modelo")
    .or(`numero_serie.ilike.%${texto}%,dot.ilike.%${texto}%`)
    .limit(500);
  if (error) throw error;

  const vistos = new Map();
  for (const row of data) {
    if (!vistos.has(row.identificador)) {
      vistos.set(row.identificador, {
        identificador: row.identificador,
        numero_serie: row.numero_serie,
        dot: row.dot,
        marca: row.marca,
        modelo: row.modelo,
      });
    }
  }
  return Array.from(vistos.values());
}

// Trayecto completo de un neumático (solo eventos con cambios reales)
export async function getHistorialNeumatico(identificador) {
  const { data, error } = await supabase
    .from("vw_historial_neumatico")
    .select("*")
    .or(`numero_serie.eq.${identificador},dot.eq.${identificador}`)
    .order("fecha", { ascending: true });
  if (error) throw error;
  return data;
}

// Determina la ubicación VIGENTE de un neumático a partir de su trayecto.
// Corrige el bug donde un neumático que salió y no volvió a entrar en
// ningún lado seguía figurando como instalado en el vehículo del que salió.
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
  return {
    instalado: true,
    fecha: ultima.fecha,
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
    for (const fila of p.planilla_neumaticos) {
      if (!fila.posicion) continue;
      porPosicion.set(String(fila.posicion), { ...fila, fecha: p.fecha });
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
   SALIDA IMPLÍCITA: si en la planilla se registra que un
   neumático "entra" a una posición pero no se escribió una fila
   "sale" para esa misma posición, el sistema da de baja
   automáticamente al que estaba antes (según el estado previo),
   para que la trazabilidad nunca quede rota. Si el usuario SÍ
   cargó la fila "sale" con sus motivos, esto no la reemplaza:
   solo actúa cuando falta.
   ========================================================= */
function completarSalidasImplicitas(filas, estadoAnterior) {
  const completas = [...filas];

  const posicionesConEntra = new Set(
    filas.filter((f) => f.accion === "entra" && f.posicion).map((f) => String(f.posicion))
  );
  const posicionesConSaleExplicita = new Set(
    filas.filter((f) => f.accion === "sale" && f.posicion).map((f) => String(f.posicion))
  );

  for (const pos of posicionesConEntra) {
    if (posicionesConSaleExplicita.has(pos)) continue; // el usuario ya la especificó

    const prev = estadoAnterior.find((e) => String(e.posicion) === pos);
    const habiaNeumatico = prev && prev.tiene_neumatico !== false && (prev.marca || prev.numero_serie || prev.dot);
    if (!habiaNeumatico) continue; // la posición ya estaba vacía, no hay nada que sacar

    completas.push({
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
      destino: "Salida registrada automáticamente (reemplazado, sin motivo especificado)",
    });
  }

  return completas;
}

/* =========================================================
   INFORME AUTOMÁTICO
   ========================================================= */
export function generarInformeAutomatico(estadoAnterior, filasNuevas) {
  const anteriorPorPosicion = new Map(estadoAnterior.map((f) => [String(f.posicion), f]));
  const lineas = [];

  for (const fila of filasNuevas) {
    if (!fila.posicion) continue;
    const prev = anteriorPorPosicion.get(String(fila.posicion));

    if (!prev) {
      lineas.push(
        `Posición ${fila.posicion}: primer registro para esta posición (${fila.marca || "s/marca"} ${fila.modelo || ""}, serie ${fila.numero_serie || fila.dot || "s/identificación"}).`
      );
      continue;
    }

    const mismoSerial =
      (prev.numero_serie && fila.numero_serie && prev.numero_serie === fila.numero_serie) ||
      (prev.dot && fila.dot && prev.dot === fila.dot) ||
      (!prev.numero_serie && !prev.dot && !fila.numero_serie && !fila.dot);

    if (!mismoSerial) {
      lineas.push(
        `Posición ${fila.posicion}: CAMBIO DE NEUMÁTICO. Salió serie ${prev.numero_serie || prev.dot || "s/identificación"} (${prev.marca || ""} ${prev.modelo || ""}) → entró serie ${fila.numero_serie || fila.dot || "s/identificación"} (${fila.marca || ""} ${fila.modelo || ""}).`
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
      lineas.push(`Posición ${fila.posicion}: mismo neumático, ${cambios.join("; ")}.`);
    } else {
      lineas.push(`Posición ${fila.posicion}: sin cambios respecto al reporte anterior.`);
    }
  }

  // posiciones donde la última acción cargada en ESTA planilla es "sale"
  // y no se cargó una fila "entra" para la misma posición
  const ultimaAccionPorPosicion = new Map();
  for (const f of filasNuevas) {
    if (!f.posicion) continue;
    ultimaAccionPorPosicion.set(String(f.posicion), f.accion);
  }
  for (const [pos, accion] of ultimaAccionPorPosicion) {
    if (accion === "sale") {
      lineas.push(`Posición ${pos}: no se cargó neumático de reemplazo. Queda SIN NEUMÁTICO.`);
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

  const mismoSerial =
    (prev.numero_serie && fila.numero_serie && prev.numero_serie === fila.numero_serie) ||
    (prev.dot && fila.dot && prev.dot === fila.dot) ||
    (!prev.numero_serie && !prev.dot && !fila.numero_serie && !fila.dot);
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
   VALIDACIONES COMUNES (duplicados + consistencia entre vehículos)
   ========================================================= */
async function validarFilas(filas, vehiculoId) {
  const seriesEnPlanilla = filas.filter((f) => f.numero_serie).map((f) => f.numero_serie);
  const duplicadosLocal = seriesEnPlanilla.filter((s, i) => seriesEnPlanilla.indexOf(s) !== i);
  if (duplicadosLocal.length > 0) {
    throw new Error(
      `Número(s) de serie repetido(s) dentro de la misma planilla: ${[...new Set(duplicadosLocal)].join(", ")}`
    );
  }

  const avisos = [];
  for (const fila of filas) {
    if (fila.accion === "entra" && fila.numero_serie) {
      const { data: activasEnOtroLado } = await supabase
        .from("vw_estado_actual")
        .select("matricula, posicion")
        .eq("numero_serie", fila.numero_serie)
        .eq("tiene_neumatico", true)
        .neq("vehiculo_id", vehiculoId);
      if (activasEnOtroLado && activasEnOtroLado.length > 0) {
        avisos.push(
          `El neumático serie ${fila.numero_serie} figura vigente en ${activasEnOtroLado
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
    })
    .select()
    .single();
  if (errPlanilla) throw errPlanilla;

  const filasParaInsertar = filasCompletas.map((f) => ({
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
  }));

  const { error: errDetalle } = await supabase.from("planilla_neumaticos").insert(filasParaInsertar);
  if (errDetalle) throw errDetalle;

  return { planilla: { ...planilla, planilla_neumaticos: filasParaInsertar }, vehiculo, avisos };
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
    .select("created_at")
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

  const { error: errDelete } = await supabase.from("planilla_neumaticos").delete().eq("planilla_id", planillaId);
  if (errDelete) throw errDelete;

  const filasParaInsertar = filasCompletas.map((f) => ({
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
  }));

  const { error: errInsert } = await supabase.from("planilla_neumaticos").insert(filasParaInsertar);
  if (errInsert) throw errInsert;

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
    throw new Error(
      `No se pudo subir "${file.name}": ${errUpload.message || errUpload.error || "error desconocido"}`
    );
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
