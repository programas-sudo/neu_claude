"use client";

import { useEffect, useState } from "react";
import VolverAtras from "../../components/VolverAtras";
import {
  getResumenStock,
  getStockVigente,
  getStockRetirado,
  agregarStock,
  retirarDeStock,
  reingresarAStock,
} from "../../lib/stock";

function filaVacia() {
  return {
    marca: "",
    modelo: "",
    medida: "",
    numero_serie: "",
    dot: "",
    estado: "",
    proveedor: "",
    observaciones: "",
  };
}

export default function Stock() {
  const [resumen, setResumen] = useState([]);
  const [detalle, setDetalle] = useState([]);
  const [retirados, setRetirados] = useState([]);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);
  const [mostrarRetirados, setMostrarRetirados] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [fechaCompra, setFechaCompra] = useState(() => new Date().toISOString().slice(0, 10));
  const [filas, setFilas] = useState([filaVacia()]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [retirando, setRetirando] = useState({}); // { [id]: texto del destino }

  async function cargarTodo() {
    setCargando(true);
    try {
      const [r, d, ret] = await Promise.all([getResumenStock(), getStockVigente(), getStockRetirado()]);
      setResumen(r);
      setDetalle(d);
      setRetirados(ret);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  function actualizarFila(idx, campo, valor) {
    const nuevas = [...filas];
    nuevas[idx] = { ...nuevas[idx], [campo]: valor };
    setFilas(nuevas);
  }

  function copiarHaciaAbajo(idx, campo) {
    const valor = filas[idx][campo];
    setFilas((prev) => prev.map((f, i) => (i > idx ? { ...f, [campo]: valor } : f)));
  }

  function agregarFila() {
    const ultima = filas[filas.length - 1];
    const base = filaVacia();
    if (ultima) {
      base.marca = ultima.marca;
      base.modelo = ultima.modelo;
      base.medida = ultima.medida;
      base.proveedor = ultima.proveedor;
    }
    setFilas([...filas, base]);
  }

  function quitarFila(idx) {
    setFilas(filas.filter((_, i) => i !== idx));
  }

  async function guardar() {
    const filasValidas = filas.filter((f) => f.marca || f.numero_serie || f.dot);
    if (filasValidas.length === 0) {
      alert("Cargá al menos un neumático (con marca, número de serie o DOT).");
      return;
    }
    setGuardando(true);
    try {
      await agregarStock(filasValidas.map((f) => ({ ...f, fecha_compra: fechaCompra })));
      setFilas([filaVacia()]);
      setMostrarFormulario(false);
      await cargarTodo();
    } catch (err) {
      alert("Error al guardar: " + err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarRetiro(id) {
    const destino = retirando[id] || "";
    try {
      await retirarDeStock(id, destino);
      setRetirando((prev) => {
        const copia = { ...prev };
        delete copia[id];
        return copia;
      });
      await cargarTodo();
    } catch (err) {
      alert("Error al retirar del stock: " + err.message);
    }
  }

  async function deshacerRetiro(id) {
    try {
      await reingresarAStock(id);
      await cargarTodo();
    } catch (err) {
      alert("Error al deshacer el retiro: " + err.message);
    }
  }

  return (
    <div className="space-y-6">
      <VolverAtras />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Stock de neumáticos en almacén</h1>
        <button
          className="bg-emerald-600 text-white px-4 py-2 rounded text-sm"
          onClick={() => setMostrarFormulario((v) => !v)}
        >
          {mostrarFormulario ? "Cancelar" : "+ Agregar neumáticos comprados"}
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Neumáticos comprados que todavía no están instalados en ningún equipo.
      </p>

      {mostrarFormulario && (
        <section className="bg-white border rounded p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Fecha de compra</label>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={fechaCompra}
              onChange={(e) => setFechaCompra(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Medida</th>
                  <th>N° Serie</th>
                  <th>DOT</th>
                  <th>Estado</th>
                  <th>Proveedor</th>
                  <th>Observaciones</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, idx) => (
                  <tr key={idx}>
                    <td>
                      <div className="flex items-center gap-1">
                        <input
                          className="border rounded px-1 w-20"
                          value={f.marca}
                          onChange={(e) => actualizarFila(idx, "marca", e.target.value)}
                        />
                        {idx < filas.length - 1 && f.marca && (
                          <button
                            type="button"
                            title="Copiar a las filas de abajo"
                            className="text-slate-400 hover:text-slate-700"
                            onClick={() => copiarHaciaAbajo(idx, "marca")}
                          >
                            ↓
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-20"
                        value={f.modelo}
                        onChange={(e) => actualizarFila(idx, "modelo", e.target.value)}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <input
                          className="border rounded px-1 w-20"
                          value={f.medida}
                          onChange={(e) => actualizarFila(idx, "medida", e.target.value)}
                        />
                        {idx < filas.length - 1 && f.medida && (
                          <button
                            type="button"
                            title="Copiar a las filas de abajo"
                            className="text-slate-400 hover:text-slate-700"
                            onClick={() => copiarHaciaAbajo(idx, "medida")}
                          >
                            ↓
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-24"
                        value={f.numero_serie}
                        onChange={(e) => actualizarFila(idx, "numero_serie", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-20"
                        value={f.dot}
                        onChange={(e) => actualizarFila(idx, "dot", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-20"
                        value={f.estado}
                        onChange={(e) => actualizarFila(idx, "estado", e.target.value)}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <input
                          className="border rounded px-1 w-24"
                          value={f.proveedor}
                          onChange={(e) => actualizarFila(idx, "proveedor", e.target.value)}
                        />
                        {idx < filas.length - 1 && f.proveedor && (
                          <button
                            type="button"
                            title="Copiar a las filas de abajo"
                            className="text-slate-400 hover:text-slate-700"
                            onClick={() => copiarHaciaAbajo(idx, "proveedor")}
                          >
                            ↓
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-32"
                        value={f.observaciones}
                        onChange={(e) => actualizarFila(idx, "observaciones", e.target.value)}
                      />
                    </td>
                    <td>
                      <button className="text-red-600 text-xs" onClick={() => quitarFila(idx)}>
                        quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button className="bg-white border px-3 py-1.5 rounded text-sm" onClick={agregarFila}>
              + Agregar fila
            </button>
            <button
              className="bg-emerald-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
              disabled={guardando}
              onClick={guardar}
            >
              {guardando ? "Guardando..." : "Guardar en stock"}
            </button>
          </div>
        </section>
      )}

      {cargando && <p className="text-sm text-slate-500">Cargando...</p>}

      {/* RESUMEN AGRUPADO */}
      <section>
        <h3 className="font-medium mb-2">Resumen actual</h3>
        <table>
          <thead>
            <tr>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Medida</th>
              <th>Cantidad en stock</th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((r, i) => (
              <tr key={i}>
                <td>{r.marca || "s/marca"}</td>
                <td>{r.modelo || "-"}</td>
                <td>{r.medida || "s/medida"}</td>
                <td className="font-medium">{r.cantidad}</td>
              </tr>
            ))}
            {resumen.length === 0 && !cargando && (
              <tr>
                <td colSpan={4} className="text-center text-slate-400">
                  No hay neumáticos en stock todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* DETALLE */}
      <section>
        <button className="text-sm underline" onClick={() => setMostrarDetalle((v) => !v)}>
          {mostrarDetalle ? "Ocultar detalle" : "Ver detalle unidad por unidad"}
        </button>

        {mostrarDetalle && (
          <table className="mt-2">
            <thead>
              <tr>
                <th>Fecha compra</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Medida</th>
                <th>N° Serie/DOT</th>
                <th>Estado</th>
                <th>Proveedor</th>
                <th>Observaciones</th>
                <th>Retirar del stock</th>
              </tr>
            </thead>
            <tbody>
              {detalle.map((item) => (
                <tr key={item.id}>
                  <td>{item.fecha_compra}</td>
                  <td>{item.marca || "-"}</td>
                  <td>{item.modelo || "-"}</td>
                  <td>{item.medida || "-"}</td>
                  <td>{item.numero_serie || item.dot || "s/id"}</td>
                  <td>{item.estado || "-"}</td>
                  <td>{item.proveedor || "-"}</td>
                  <td>{item.observaciones || "-"}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <input
                        className="border rounded px-1 w-32 text-xs"
                        placeholder="Dónde se instaló"
                        value={retirando[item.id] || ""}
                        onChange={(e) =>
                          setRetirando((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                      />
                      <button
                        className="text-xs bg-slate-900 text-white px-2 py-1 rounded"
                        onClick={() => confirmarRetiro(item.id)}
                      >
                        Retirar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* HISTORIAL DE RETIROS */}
      <section>
        <button className="text-sm underline" onClick={() => setMostrarRetirados((v) => !v)}>
          {mostrarRetirados ? "Ocultar historial de retiros" : "Ver historial de retiros del stock"}
        </button>

        {mostrarRetirados && (
          <table className="mt-2">
            <thead>
              <tr>
                <th>Fecha retiro</th>
                <th>Marca</th>
                <th>Medida</th>
                <th>N° Serie/DOT</th>
                <th>Destino</th>
                <th>Origen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {retirados.map((item) => (
                <tr key={item.id}>
                  <td>{item.fecha_salida}</td>
                  <td>{item.marca || "-"}</td>
                  <td>{item.medida || "-"}</td>
                  <td>{item.numero_serie || item.dot || "s/id"}</td>
                  <td>{item.destino_salida || "-"}</td>
                  <td>
                    {item.retirado_por_planilla_neumatico_id ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                        automático
                      </span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">manual</span>
                    )}
                  </td>
                  <td>
                    <button className="text-xs underline text-slate-500" onClick={() => deshacerRetiro(item.id)}>
                      deshacer
                    </button>
                  </td>
                </tr>
              ))}
              {retirados.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400">
                    Todavía no se retiró nada del stock.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
