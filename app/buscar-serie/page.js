"use client";

import { useState } from "react";
import {
  buscarNeumaticosPorIdentificador,
  getHistorialNeumatico,
  getUbicacionVigente,
} from "../../lib/traceability";

export default function BuscarSerie() {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  async function buscar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setCargando(true);
    setSeleccionado(null);
    try {
      const data = await buscarNeumaticosPorIdentificador(texto.trim());
      setResultados(data);
    } finally {
      setCargando(false);
    }
  }

  async function seleccionar(item) {
    setSeleccionado(item);
    setCargando(true);
    try {
      const data = await getHistorialNeumatico(item.identificador);
      setFilas(data);
    } finally {
      setCargando(false);
    }
  }

  const vigente = getUbicacionVigente(filas);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Búsqueda por número de serie / DOT</h1>
      <p className="text-sm text-slate-500">
        Útil, por ejemplo, cuando un neumático se rompe y querés saber hace cuánto
        fue colocado, o si tuvo algún recapado o reparación previa.
      </p>

      <form onSubmit={buscar} className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Ingresá parte del número de serie o DOT..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button className="bg-slate-900 text-white px-4 py-2 rounded" type="submit">
          Buscar
        </button>
      </form>

      {cargando && <p className="text-sm text-slate-500">Cargando...</p>}

      {!seleccionado && resultados.length > 0 && (
        <div className="bg-white rounded border divide-y">
          {resultados.map((r) => (
            <button
              key={r.identificador}
              onClick={() => seleccionar(r)}
              className="w-full text-left px-4 py-2 hover:bg-slate-50"
            >
              <span className="font-medium">{r.identificador}</span>{" "}
              <span className="text-sm text-slate-500">
                {r.marca} {r.modelo}
              </span>
            </button>
          ))}
        </div>
      )}

      {seleccionado && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Trayecto de {seleccionado.identificador}
            </h2>
            <button
              className="text-sm underline"
              onClick={() => {
                setSeleccionado(null);
                setResultados([]);
                setTexto("");
              }}
            >
              ← nueva búsqueda
            </button>
          </div>

          {vigente && vigente.instalado && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm">
              <strong>Instalación vigente:</strong> desde el {vigente.fecha} en {vigente.matricula},
              posición {vigente.posicion || "-"}.
            </div>
          )}
          {vigente && !vigente.instalado && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
              <strong>Sin ubicación actual:</strong> salió de {vigente.matricula} posición{" "}
              {vigente.posicion || "-"} el {vigente.fecha}
              {vigente.destino ? ` (destino: ${vigente.destino})` : ""}. No se registró que haya
              vuelto a entrar en ningún vehículo.
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Matrícula</th>
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
        </div>
      )}
    </div>
  );
}
