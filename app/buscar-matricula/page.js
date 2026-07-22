"use client";

import { useState } from "react";
import {
  buscarVehiculosPorMatricula,
  getEstadoActual,
  getHistorialPlanillas,
  getHistorialNeumatico,
} from "../../lib/traceability";
import { exportarPlanillaPDF } from "../../lib/pdf";

export default function BuscarMatricula() {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState([]);
  const [vehiculo, setVehiculo] = useState(null);
  const [estadoActual, setEstadoActual] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [trayecto, setTrayecto] = useState(null); // { identificador, filas }
  const [cargando, setCargando] = useState(false);

  async function buscar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setCargando(true);
    setVehiculo(null);
    try {
      const data = await buscarVehiculosPorMatricula(texto.trim());
      setResultados(data);
    } finally {
      setCargando(false);
    }
  }

  async function seleccionarVehiculo(v) {
    setVehiculo(v);
    setTrayecto(null);
    setCargando(true);
    try {
      const [estado, hist] = await Promise.all([
        getEstadoActual(v.id),
        getHistorialPlanillas(v.id),
      ]);
      setEstadoActual(estado);
      setHistorial(hist);
    } finally {
      setCargando(false);
    }
  }

  async function verTrayecto(fila) {
    const id = fila.numero_serie || fila.dot;
    if (!id) {
      alert(
        "Este neumático no tiene número de serie ni DOT registrado: no es posible trazarlo. Solo se conservan sus datos (marca, modelo, medida, estado) en el momento consultado."
      );
      return;
    }
    setCargando(true);
    try {
      const filas = await getHistorialNeumatico(id);
      setTrayecto({ identificador: id, filas });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Búsqueda por matrícula</h1>

      <form onSubmit={buscar} className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Ingresá parte de la matrícula..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button className="bg-slate-900 text-white px-4 py-2 rounded" type="submit">
          Buscar
        </button>
      </form>

      {cargando && <p className="text-sm text-slate-500">Cargando...</p>}

      {!vehiculo && resultados.length > 0 && (
        <div className="bg-white rounded border divide-y">
          {resultados.map((v) => (
            <button
              key={v.id}
              onClick={() => seleccionarVehiculo(v)}
              className="w-full text-left px-4 py-2 hover:bg-slate-50"
            >
              <span className="font-medium">{v.matricula}</span>{" "}
              <span className="text-slate-500 text-sm">{v.tipo_vehiculo}</span>
            </button>
          ))}
        </div>
      )}

      {vehiculo && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {vehiculo.matricula}{" "}
              <span className="text-sm text-slate-500 font-normal">
                {vehiculo.tipo_vehiculo}
              </span>
            </h2>
            <button
              className="text-sm underline"
              onClick={() => {
                setVehiculo(null);
                setResultados([]);
                setTexto("");
              }}
            >
              ← nueva búsqueda
            </button>
          </div>

          {/* ESTADO ACTUAL */}
          <section>
            <h3 className="font-medium mb-2">Estado actual</h3>
            <table>
              <thead>
                <tr>
                  <th>Posición</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Medida</th>
                  <th>N° Serie / DOT</th>
                  <th>Estado</th>
                  <th>% Desgaste</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {estadoActual.map((f) => (
                  <tr key={f.posicion}>
                    <td>{f.posicion}</td>
                    <td>{f.marca}</td>
                    <td>{f.modelo}</td>
                    <td>{f.medida}</td>
                    <td>
                      {f.numero_serie || f.dot || (
                        <span className="text-slate-400">s/identificación</span>
                      )}
                    </td>
                    <td>{f.estado}</td>
                    <td>{f.porcentaje_desgaste != null ? `${f.porcentaje_desgaste}%` : "-"}</td>
                    <td>
                      <button className="text-blue-600 text-xs underline" onClick={() => verTrayecto(f)}>
                        ver trayecto
                      </button>
                    </td>
                  </tr>
                ))}
                {estadoActual.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-slate-400">
                      Sin datos cargados todavía para este vehículo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* TRAYECTO DE UN NEUMÁTICO SELECCIONADO */}
          {trayecto && (
            <section className="bg-amber-50 border border-amber-200 rounded p-4">
              <h3 className="font-medium mb-2">
                Trayecto del neumático {trayecto.identificador}
              </h3>
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
                  {trayecto.filas.map((f) => (
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
            </section>
          )}

          {/* HISTORIAL CRONOLÓGICO DE PLANILLAS */}
          <section>
            <h3 className="font-medium mb-2">Historial de planillas cargadas</h3>
            <div className="space-y-4">
              {historial.map((p) => (
                <div key={p.id} className="bg-white border rounded p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-medium">{p.fecha}</span> —{" "}
                      <span className="uppercase text-xs bg-slate-200 px-2 py-0.5 rounded">
                        {p.tipo}
                      </span>{" "}
                      <span className="text-sm text-slate-500">
                        {p.modo_carga === "parcial" ? "(carga parcial)" : "(carga completa)"}
                      </span>
                      <div className="text-sm text-slate-500 mt-1">
                        Chofer: {p.chofer || "-"} · Vehículo: {p.tipo_vehiculo || "-"} · Km: {p.km ?? "-"}
                      </div>
                    </div>
                    <button
                      className="text-xs bg-slate-900 text-white px-3 py-1 rounded"
                      onClick={() => exportarPlanillaPDF(p)}
                    >
                      Descargar PDF
                    </button>
                  </div>

                  <table className="mt-3">
                    <thead>
                      <tr>
                        <th>Pos.</th>
                        <th>Acción</th>
                        <th>Marca</th>
                        <th>Modelo</th>
                        <th>Medida</th>
                        <th>Serie/DOT</th>
                        <th>Estado</th>
                        <th>% Desg.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.planilla_neumaticos.map((f) => (
                        <tr key={f.id}>
                          <td>{f.posicion || "-"}</td>
                          <td>{f.accion}</td>
                          <td>{f.marca}</td>
                          <td>{f.modelo}</td>
                          <td>{f.medida}</td>
                          <td>{f.numero_serie || f.dot || "s/id"}</td>
                          <td>{f.estado}</td>
                          <td>{f.porcentaje_desgaste != null ? `${f.porcentaje_desgaste}%` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {p.informe_automatico && (
                    <div className="mt-3 text-sm bg-blue-50 border border-blue-100 rounded p-3 whitespace-pre-line">
                      <strong>Informe automático:</strong>
                      {"\n" + p.informe_automatico}
                    </div>
                  )}

                  {p.observaciones && (
                    <div className="mt-2 text-sm bg-slate-50 border rounded p-3 whitespace-pre-line">
                      <strong>Observaciones:</strong>
                      {"\n" + p.observaciones}
                    </div>
                  )}

                  {p.adjuntos && p.adjuntos.length > 0 && (
                    <div className="mt-2 text-sm">
                      <strong>Adjuntos:</strong>{" "}
                      {p.adjuntos.map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline text-blue-600 mr-2"
                        >
                          {a.nombre_archivo}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {historial.length === 0 && (
                <p className="text-sm text-slate-400">Sin planillas cargadas todavía.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
