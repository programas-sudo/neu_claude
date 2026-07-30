import { supabase } from "./supabaseClient";

// Resumen agrupado por tipo (marca+modelo+medida) de lo que hay
// actualmente en stock (fecha_salida = null).
export async function getResumenStock() {
  const { data, error } = await supabase
    .from("stock_neumaticos")
    .select("marca, modelo, medida")
    .is("fecha_salida", null);
  if (error) throw error;

  const mapa = new Map();
  for (const item of data) {
    const clave = `${item.marca || "s/marca"}|${item.modelo || ""}|${item.medida || "s/medida"}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, { marca: item.marca, modelo: item.modelo, medida: item.medida, cantidad: 0 });
    }
    mapa.get(clave).cantidad += 1;
  }
  return Array.from(mapa.values()).sort((a, b) => (a.marca || "").localeCompare(b.marca || ""));
}

// Listado detallado de lo que hay en stock ahora mismo.
export async function getStockVigente() {
  const { data, error } = await supabase
    .from("stock_neumaticos")
    .select("*")
    .is("fecha_salida", null)
    .order("fecha_compra", { ascending: false });
  if (error) throw error;
  return data;
}

// Historial de lo que ya salió del stock (para referencia).
export async function getStockRetirado(limite = 50) {
  const { data, error } = await supabase
    .from("stock_neumaticos")
    .select("*")
    .not("fecha_salida", "is", null)
    .order("fecha_salida", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data;
}

// Carga uno o varios neumáticos comprados (batch, como una planilla).
export async function agregarStock(filas) {
  const paraInsertar = filas.map((f) => ({
    marca: f.marca || null,
    modelo: f.modelo || null,
    medida: f.medida || null,
    numero_serie: f.numero_serie || null,
    dot: f.dot || null,
    sin_identificacion: !f.numero_serie && !f.dot,
    estado: f.estado || null,
    proveedor: f.proveedor || null,
    fecha_compra: f.fecha_compra,
    observaciones: f.observaciones || null,
  }));
  const { error } = await supabase.from("stock_neumaticos").insert(paraInsertar);
  if (error) throw error;
}

// Busca en el stock VIGENTE (todavía no retirado) un neumático con esta
// identidad exacta (marca+medida+serie/DOT). Si hay varios iguales sin
// serie/DOT, no se puede distinguir cuál es cuál — no se autoconecta
// (queda para retirar a mano desde la pantalla de Stock).
export async function buscarEnStock({ marca, medida, numero_serie, dot }) {
  if (!numero_serie && !dot) return null;
  let query = supabase.from("stock_neumaticos").select("*").is("fecha_salida", null);
  query = marca ? query.eq("marca", marca) : query.is("marca", null);
  query = medida ? query.eq("medida", medida) : query.is("medida", null);
  query = numero_serie ? query.eq("numero_serie", numero_serie) : query.eq("dot", dot);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

// Retira del stock por una conexión automática con una fila de planilla.
export async function retirarDeStockPorPlanilla(stockId, fecha, destinoSalida, planillaNeumaticoId) {
  const { error } = await supabase
    .from("stock_neumaticos")
    .update({
      fecha_salida: fecha,
      destino_salida: destinoSalida,
      retirado_por_planilla_neumatico_id: planillaNeumaticoId,
    })
    .eq("id", stockId);
  if (error) throw error;
}

// Deshace los retiros automáticos que hayan quedado ligados a estas
// filas de planilla (se usa antes de reemplazar el detalle de una
// planilla editada, para no dejar un retiro "huérfano").
export async function reingresarStockPorFilas(planillaNeumaticoIds) {
  if (!planillaNeumaticoIds || planillaNeumaticoIds.length === 0) return;
  const { error } = await supabase
    .from("stock_neumaticos")
    .update({ fecha_salida: null, destino_salida: null, retirado_por_planilla_neumatico_id: null })
    .in("retirado_por_planilla_neumatico_id", planillaNeumaticoIds);
  if (error) throw error;
}

// Revisa las filas "entra" recién guardadas de una planilla y, para
// cada una que coincida con algo vigente en stock, lo retira solo.
export async function conectarEntradasConStock(filasInsertadas, matricula, fecha) {
  for (const fila of filasInsertadas) {
    if (fila.accion !== "entra") continue;
    const enStock = await buscarEnStock({
      marca: fila.marca,
      medida: fila.medida,
      numero_serie: fila.numero_serie,
      dot: fila.dot,
    });
    if (enStock) {
      await retirarDeStockPorPlanilla(
        enStock.id,
        fecha,
        `Instalado en ${matricula}${fila.posicion ? ` pos.${fila.posicion}` : ""} (automático)`,
        fila.id
      );
    }
  }
}


// Retira un neumático del stock a mano (por si se instala sin pasar por
// una planilla, o para corregir algo). El vínculo automático usa
// retirarDeStockPorPlanilla en cambio.
export async function retirarDeStock(id, destinoSalida) {
  const { error } = await supabase
    .from("stock_neumaticos")
    .update({ fecha_salida: new Date().toISOString().slice(0, 10), destino_salida: destinoSalida || null })
    .eq("id", id);
  if (error) throw error;
}

// Deshace un retiro (por si fue un error).
export async function reingresarAStock(id) {
  const { error } = await supabase
    .from("stock_neumaticos")
    .update({ fecha_salida: null, destino_salida: null })
    .eq("id", id);
  if (error) throw error;
}
