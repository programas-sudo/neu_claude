import { supabase } from "./supabaseClient";

/* =========================================================
   BÚSQUEDA POR MATRÍCULA (coincidencia parcial)
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

// Estado actual (una fila por posición vigente) de un vehículo
export async function getEstadoActual(vehiculoId) {
  const { data, error } = await supabase
    .from("vw_estado_actual")
    .select("*")
    .eq("vehiculo_id", vehiculoId)
    .order("posicion");
  if (error) throw error;
  return data;
}

// Historial cronológico de TODAS las planillas cargadas para un vehículo,
// con su detalle de neumáticos y adjuntos.
export async function getHistorialPlanillas(vehiculoId) {
  const { data: planillas, error } = await supabase
    .from("planillas")
    .select("*, planilla_neumaticos(*), adjuntos(*)")
    .eq("vehiculo_id", vehiculoId)
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return planillas;
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

  // devolver identificadores únicos (puede matchear muchas filas históricas)
  const vistos = new Map();
  for (const row of data) {
    const key = row.identificador;
    if (!vistos.has(key)) {
      vistos.set(key, {
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

// Trayecto completo de un neumático específico (por serie o DOT exacto)
export async function getHistorialNeumatico(identificador) {
  const { data, error } = await supabase
    .from("vw_historial_neumatico")
    .select("*")
    .or(`numero_serie.eq.${identificador},dot.eq.${identificador}`)
    .order("fecha", { ascending: true });
  if (error) throw error;
  return data;
}

/* =========================================================
   VEHÍCULO: crear si no existe (por matrícula)
   ========================================================= */
export async function getOrCrearVehiculo(matricula, tipo_vehiculo, num_posiciones) {
  const { data: existente, error: e1 } = await supabase
    .from("vehiculos")
    .select("*")
    .eq("matricula", matricula.trim().toUpperCase())
    .maybeSingle();
  if (e1) throw e1;
  if (existente) return existente;

  const { data: nuevo, error: e2 } = await supabase
    .from("vehiculos")
    .insert({
      matricula: matricula.trim().toUpperCase(),
      tipo_vehiculo: tipo_vehiculo || null,
      num_posiciones: num_posiciones || 4,
    })
    .select()
    .single();
  if (e2) throw e2;
  return nuevo;
}

/* =========================================================
   INFORME AUTOMÁTICO: compara la planilla nueva contra el
   estado vigente ANTERIOR (antes de guardar esta planilla)
   ========================================================= */
export function generarInformeAutomatico(estadoAnterior, filasNuevas) {
  // estadoAnterior: array de vw_estado_actual (antes de este guardado)
  // filasNuevas: filas que se están por guardar (misma forma que planilla_neumaticos)
  const anteriorPorPosicion = new Map(
    estadoAnterior.map((f) => [String(f.posicion), f])
  );

  const lineas = [];

  for (const fila of filasNuevas) {
    if (!fila.posicion) continue; // filas "sale" sueltas no comparan por posición
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

    // mismo neumático: comparar desgaste / estado / recapado
    const cambios = [];
    if (
      prev.porcentaje_desgaste != null &&
      fila.porcentaje_desgaste != null &&
      Number(prev.porcentaje_desgaste) !== Number(fila.porcentaje_desgaste)
    ) {
      cambios.push(
        `desgaste ${prev.porcentaje_desgaste}% → ${fila.porcentaje_desgaste}%`
      );
    }
    if (prev.estado && fila.estado && prev.estado !== fila.estado) {
      cambios.push(`estado "${prev.estado}" → "${fila.estado}"`);
    }
    if (!prev.recapado && fila.recapado) {
      cambios.push("se registró recapado");
    }
    if (fila.reparacion) {
      cambios.push(`reparación registrada: ${fila.reparacion}`);
    }

    if (cambios.length > 0) {
      lineas.push(`Posición ${fila.posicion}: mismo neumático, ${cambios.join("; ")}.`);
    } else {
      lineas.push(`Posición ${fila.posicion}: sin cambios respecto al reporte anterior.`);
    }
  }

  // posiciones que existían antes y no vinieron en esta carga (solo aplica en carga completa)
  return lineas.join("\n");
}

/* =========================================================
   GUARDAR PLANILLA (cabecera + detalle)
   ========================================================= */
export async function guardarPlanilla({
  vehiculo,
  tipo, // 'relevamiento' | 'movimiento'
  fecha,
  chofer,
  tipo_vehiculo,
  km,
  modo_carga, // 'completa' | 'parcial'
  observaciones,
  filas, // array de detalle
}) {
  // 1. validar unicidad de número de serie dentro de la MISMA planilla
  const seriesEnPlanilla = filas
    .filter((f) => f.numero_serie)
    .map((f) => f.numero_serie);
  const duplicadosLocal = seriesEnPlanilla.filter(
    (s, i) => seriesEnPlanilla.indexOf(s) !== i
  );
  if (duplicadosLocal.length > 0) {
    throw new Error(
      `Número(s) de serie repetido(s) dentro de la misma planilla: ${[
        ...new Set(duplicadosLocal),
      ].join(", ")}`
    );
  }

  // 2. traer estado vigente ANTES de guardar (para el informe y para chequear consistencia)
  const estadoAnterior = await getEstadoActual(vehiculo.id);

  // 3. chequeo de trazabilidad: un serial que "entra" acá no debería figurar
  //    como vigente en otro vehículo/posición sin haber tenido un "sale" antes.
  const avisos = [];
  for (const fila of filas) {
    if (fila.accion === "entra" && fila.numero_serie) {
      const { data: activasEnOtroLado } = await supabase
        .from("vw_estado_actual")
        .select("matricula, posicion")
        .eq("numero_serie", fila.numero_serie)
        .neq("vehiculo_id", vehiculo.id);
      if (activasEnOtroLado && activasEnOtroLado.length > 0) {
        avisos.push(
          `El neumático serie ${fila.numero_serie} figura vigente en ${activasEnOtroLado
            .map((a) => `${a.matricula} pos.${a.posicion}`)
            .join(", ")}. Verificá que se haya registrado su salida allí.`
        );
      }
    }
  }

  // 4. generar informe automático comparando contra estado anterior
  const informe_automatico = generarInformeAutomatico(estadoAnterior, filas);

  // 5. insertar cabecera
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

  // 6. insertar detalle
  const filasParaInsertar = filas.map((f) => ({
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
  }));

  const { error: errDetalle } = await supabase
    .from("planilla_neumaticos")
    .insert(filasParaInsertar);
  if (errDetalle) throw errDetalle;

  return { planilla, avisos };
}

/* =========================================================
   ADJUNTOS
   ========================================================= */
export async function subirAdjunto(planillaId, file) {
  const path = `${planillaId}/${Date.now()}_${file.name}`;
  const { error: errUpload } = await supabase.storage
    .from("adjuntos")
    .upload(path, file);
  if (errUpload) throw errUpload;

  const { data: pub } = supabase.storage.from("adjuntos").getPublicUrl(path);

  const { error: errRow } = await supabase.from("adjuntos").insert({
    planilla_id: planillaId,
    nombre_archivo: file.name,
    storage_path: path,
    url: pub.publicUrl,
    tipo_archivo: file.type,
  });
  if (errRow) throw errRow;

  return pub.publicUrl;
}
