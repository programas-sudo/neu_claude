"use client";

import { useState } from "react";
import VolverAtras from "../../components/VolverAtras";
import {
  buscarNeumaticosAvanzado,
  getHistorialNeumaticoExacto,
  getUbicacionVigente,
  getProveedorNeumatico,
  getRegistroStock,
} from "../../lib/traceability";

export default function BuscarSerie() {
  const [marca, setMarca] = useState("");
  const [medida, setMedida] = useState("");
  const [numeroSerie, setNumeroSerie] = useState("");
  const [dot, setDot] = useState("");
  const [resultados, setResultados] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [filas, setFilas] = useState([]);
  const [proveedor, setProveedor] = useState(null);
  const [registroStock, setRegistroStock] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [busco, setBusco] = useState(false);

  async function buscar(e) {
    e.preventDefault();
    if (!marca.trim() && !medida.trim() && !numeroSerie.trim() && !dot.trim()) {
      alert("Completá al menos un campo para buscar.");
      return;
    }
    setCargando(true);
    setSeleccionado(null);
    setBusco(true);
    try {
      const data = await buscarNeumaticosAvanzado({
        marca,
        medida,
        numero_serie: numeroSerie,
        dot,
      });
      setResultados(data);
    } finally {
      setCargando(false);
    }
  }

  async function seleccionar(item) {
    setSeleccionado(item);
    setCargando(true);
    try {
      const [data, prov, stock] = await Promise.all([
        getHistorialNeumaticoExacto({
          marca: item.marca,
          medida: item.medida,
          numero_serie: item.numero_serie,
          dot: item.dot,
        }),
        getProveedorNeumatico({
          marca: item.marca,
          medida: item.medida,
          numero_serie: item.numero_serie,
          dot: item.dot,
        }),
        getRegistroStock({
          marca: item.marca,
          medida: item.medida,
          numero_serie: item.numero_serie,
          dot: item.dot,
        }),
      ]);
      setFilas(data);
      setProveedor(prov);
      setRegistroStock(stock);
    } finally {
      setCargando(false);
    }
  }

  function nuevaBusqueda() {
    setSeleccionado(null);
    setResultados([]);
    setBusco(false);
    setProveedor(null);
    setRegistroStock(null);
    setMarca("");
    setMedida("");
    setNumeroSerie("");
    setDot("");
  }

  const vigente = filas.length > 0 ? getUbicacionVigente(filas) : null;

  return (
    <div className="space-y-6">
      <VolverAtras />
      <h1 className="text-xl font-semibold">Búsqueda por neumático</h1>
      <p className="text-sm text-slate-500">
        Un neumático se identifica por la combinación de <strong>marca + medida + (número de
        serie o DOT)</strong> — puede haber dos neumáticos con el mismo número de serie pero de
        marcas distintas, así que cuantos más campos completes, más precisa la búsqueda.
      </p>

      <form onSubmit={buscar} className="bg-white border rounded p-4 grid md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Marca</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Medida</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={medida}
            onChange={(e) => setMedida(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">N° de Serie</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={numeroSerie}
            onChange={(e) => setNumeroSerie(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">DOT</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={dot}
            onChange={(e) => setDot(e.target.value)}
          />
        </div>
        <div className="md:col-span-4">
          <button className="bg-slate-900 text-white px-4 py-2 rounded" type="submit">
            Buscar
          </button>
        </div>
      </form>

      {cargando && <p className="text-sm text-slate-500">Cargando...</p>}

      {!seleccionado && busco && (
        <div className="bg-white rounded border divide-y">
          {resultados.map((r) => (
            <button
              key={r.identificador}
              onClick={() => seleccionar(r)}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 flex justify-between"
            >
              <span>
                <span className="font-medium">{r.marca || "s/marca"}</span>{" "}
                <span className="text-slate-500 text-sm">{r.modelo}</span>
                {r.soloEnStock && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                    en stock
                  </span>
                )}
              </span>
              <span className="text-sm text-slate-500">
                {r.medida ? `${r.medida} · ` : ""}
                {r.numero_serie ? `Serie ${r.numero_serie}` : r.dot ? `DOT ${r.dot}` : "s/identificación"}
              </span>
            </button>
          ))}
          {resultados.length === 0 && (
            <p className="text-sm text-slate-400 px-4 py-2">
              No se encontró ningún neumático con esos datos.
            </p>
          )}
        </div>
      )}

      {seleccionado && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Trayecto de {seleccionado.marca || "s/marca"}{" "}
              {seleccionado.numero_serie ? `— serie ${seleccionado.numero_serie}` : seleccionado.dot ? `— DOT ${seleccionado.dot}` : ""}
              {seleccionado.medida ? ` (${seleccionado.medida})` : ""}
            </h2>
            <button className="text-sm underline" onClick={nuevaBusqueda}>
              ← nueva búsqueda
            </button>
          </div>

          {proveedor && (
            <p className="text-sm">
              <strong>Proveedor:</strong> {proveedor}
              <span className="text-slate-500">
                {" "}
                (dato del neumático, no implica que se haya comprado en la fecha en que se cargó)
              </span>
            </p>
          )}

          {registroStock && (
            <div className="border rounded p-3 text-sm bg-orange-50 border-orange-200">
              <strong>En stock</strong> desde el {registroStock.fecha_compra}
              {registroStock.proveedor ? ` — proveedor: ${registroStock.proveedor}` : ""}
              {registroStock.estado ? ` — estado: ${registroStock.estado}` : ""}. Todavía no se
              instaló en ningún equipo.
            </div>
          )}

          {vigente && (
            <div
              className={`border rounded p-3 text-sm ${
                vigente.instalado ? "bg-orange-50 border-orange-200" : "bg-red-50 border-red-200"
              }`}
            >
              {vigente.instalado ? (
                <>
                  <strong>Instalación vigente:</strong> desde el {vigente.fecha} en{" "}
                  {vigente.matricula}, posición {vigente.posicion}.
                </>
              ) : (
                <>
                  <strong>NO está instalado en ningún vehículo.</strong> Salió de {vigente.matricula}{" "}
                  pos.{vigente.posicion} el {vigente.fecha}
                  {vigente.destino ? ` (destino: ${vigente.destino})` : ""}.
                </>
              )}
            </div>
          )}

          {filas.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Patente</th>
                  <th>Posición</th>
                  <th>Acción</th>
                  <th>Procedencia</th>
                  <th>Destino</th>
                  <th>Recapado</th>
                  <th>Reparación</th>
                  <th>Estado</th>
                  <th>% Desgaste</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td>{f.fecha}</td>
                    <td>{f.matricula}</td>
                    <td>{f.posicion || "-"}</td>
                    <td>{f.accion}</td>
                    <td>{f.procedencia || "-"}</td>
                    <td>{f.destino || "-"}</td>
                    <td>{f.recapado ? "Sí" : "No"}</td>
                    <td>{f.reparacion || "-"}</td>
                    <td>{f.estado || "-"}</td>
                    <td>{f.porcentaje_desgaste != null ? `${f.porcentaje_desgaste}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
