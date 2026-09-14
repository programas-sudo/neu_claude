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
// Busca la instancia más alta ya usada para este código (marca+medida+
// serie/DOT), mirando tanto lo que ya pasó por planillas como lo que
// ya está en stock. Se usa para numerar automáticamente unidades
// nuevas que comparten código con algo que ya existe.
async function getMaxInstanciaExistente({ marca, medida, numero_serie, dot }) {
  if (!numero_serie && !dot) return 0;

  let queryHist = supabase.from("vw_historial_neumatico").select("instancia");
  queryHist = marca ? queryHist.eq("marca", marca) : queryHist.is("marca", null);
  queryHist = medida ? queryHist.eq("medida", medida) : queryHist.is("medida", null);
  queryHist = numero_serie ? queryHist.eq("numero_serie", numero_serie) : queryHist.eq("dot", dot);
  const { data: hist, error: errHist } = await queryHist;
  if (errHist) throw errHist;

  let queryStock = supabase.from("stock_neumaticos").select("instancia");
  queryStock = marca ? queryStock.eq("marca", marca) : queryStock.is("marca", null);
  queryStock = medida ? queryStock.eq("medida", medida) : queryStock.is("medida", null);
  queryStock = numero_serie ? queryStock.eq("numero_serie", numero_serie) : queryStock.eq("dot", dot);
  const { data: stock, error: errStock } = await queryStock;
  if (errStock) throw errStock;

  const todas = [...(hist || []), ...(stock || [])].map((r) => r.instancia || 1);
  return todas.length > 0 ? Math.max(...todas) : 0;
}

// Al comprar neumáticos nuevos, cada fila es por definición una unidad
// física distinta (nunca hace falta preguntar "¿es la misma?" como en
// las planillas). Si el código (marca+medida+serie/DOT) ya existe en
// algún lado — otra compra anterior, o incluso otra fila de esta misma
// carga — se le asigna automáticamente el siguiente número de
// instancia, sin interrumpir la carga.
export async function agregarStock(filas) {
  const usadasEnEsteLote = new Map(); // "marca|medida|codigo" -> instancia más alta asignada acá

  const paraInsertar = [];
  const avisos = [];
  for (const f of filas) {
    let instancia = 1;
    if (f.numero_serie || f.dot) {
      const clave = `${f.marca || ""}|${f.medida || ""}|${f.numero_serie || f.dot || ""}`;
      const maxExistente = await getMaxInstanciaExistente({
        marca: f.marca,
        medida: f.medida,
        numero_serie: f.numero_serie,
        dot: f.dot,
      });
      const maxEnLote = usadasEnEsteLote.get(clave) || 0;
      instancia = Math.max(maxExistente, maxEnLote) + 1;
      usadasEnEsteLote.set(clave, instancia);
      if (instancia > 1) {
        avisos.push(
          `${f.marca || ""} ${f.numero_serie || f.dot} se registró como unidad ${instancia} (ya había otra con ese código).`
        );
      }
    }
    paraInsertar.push({
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
      instancia,
    });
  }
  const { error } = await supabase.from("stock_neumaticos").insert(paraInsertar);
  if (error) throw error;
  return { avisos };
}

// Busca en el stock VIGENTE (todavía no retirado) un neumático con esta
// identidad exacta (marca+medida+serie/DOT). Si hay varios iguales sin
// serie/DOT, no se puede distinguir cuál es cuál — no se autoconecta
// (queda para retirar a mano desde la pantalla de Stock).
export async function buscarEnStock({ marca, medida, numero_serie, dot, instancia }) {
  if (!numero_serie && !dot) return null;
  let query = supabase.from("stock_neumaticos").select("*").is("fecha_salida", null);
  query = marca ? query.eq("marca", marca) : query.is("marca", null);
  query = medida ? query.eq("medida", medida) : query.is("medida", null);
  query = numero_serie ? query.eq("numero_serie", numero_serie) : query.eq("dot", dot);
  query = query.eq("instancia", instancia || 1);
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
      instancia: fila.instancia,
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
