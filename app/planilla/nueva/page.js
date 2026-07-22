"use client";

import { useState } from "react";
import {
  getOrCrearVehiculo,
  getEstadoActual,
  guardarPlanilla,
  subirAdjunto,
} from "../../../lib/traceability";

const ACCIONES = [
  { value: "permanece", label: "Permanece" },
  { value: "entra", label: "Entra" },
  { value: "sale", label: "Sale" },
];

function filaVacia(posicion = "") {
  return {
    posicion,
    accion: "permanece",
    marca: "",
    modelo: "",
    medida: "",
    numero_serie: "",
    dot: "",
    estado: "",
    porcentaje_desgaste: "",
    recapado: false,
    reparacion: "",
    procedencia: "",
    destino: "",
  };
}

export default function NuevaPlanilla() {
  const [matriculaInput, setMatriculaInput] = useState("");
  const [vehiculo, setVehiculo] = useState(null);
  const [numPosiciones, setNumPosiciones] = useState(4);
  const [tipo, setTipo] = useState("relevamiento");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [chofer, setChofer] = useState("");
  const [tipoVehiculo, setTipoVehiculo] = useState("");
  const [km, setKm] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [filas, setFilas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null); // { planilla, avisos }
  const [archivos, setArchivos] = useState([]);

  async function buscarOCrearVehiculo() {
    if (!matriculaInput.trim()) return;
    const v = await getOrCrearVehiculo(matriculaInput, tipoVehiculo, numPosiciones);
    setVehiculo(v);
    setTipoVehiculo(v.tipo_vehiculo || "");
    setNumPosiciones(v.num_posiciones || 4);
  }

  async function cargarPosicionesDesdeEstadoActual() {
    if (!vehiculo) return;
    const estado = await getEstadoActual(vehiculo.id);
    const nuevasFilas = [];
    for (let i = 1; i <= numPosiciones; i++) {
      const actual = estado.find((e) => String(e.posicion) === String(i));
      if (actual) {
        nuevasFilas.push({
          posicion: String(i),
          accion: "permanece",
          marca: actual.marca || "",
          modelo: actual.modelo || "",
          medida: actual.medida || "",
          numero_serie: actual.numero_serie || "",
          dot: actual.dot || "",
          estado: actual.estado || "",
          porcentaje_desgaste: actual.porcentaje_desgaste ?? "",
          recapado: actual.recapado || false,
          reparacion: "",
          procedencia: "",
          destino: "",
        });
      } else {
        nuevasFilas.push(filaVacia(String(i)));
      }
    }
    setFilas(nuevasFilas);
  }

  function agregarFila() {
    setFilas([...filas, filaVacia()]);
  }

  function quitarFila(idx) {
    setFilas(filas.filter((_, i) => i !== idx));
  }

  function actualizarFila(idx, campo, valor) {
    const nuevas = [...filas];
    nuevas[idx] = { ...nuevas[idx], [campo]: valor };
    setFilas(nuevas);
  }

  async function guardar() {
    if (!vehiculo) {
      alert("Primero cargá / buscá la matrícula.");
      return;
    }
    if (filas.length === 0) {
      alert("Agregá al menos una fila de neumático.");
      return;
    }
    setGuardando(true);
    setResultado(null);
    try {
      const filasLimpias = filas.map((f) => ({
        ...f,
        porcentaje_desgaste: f.porcentaje_desgaste === "" ? null : Number(f.porcentaje_desgaste),
      }));
      const res = await guardarPlanilla({
        vehiculo,
        tipo,
        fecha,
        chofer,
        tipo_vehiculo: tipoVehiculo,
        km: km === "" ? null : Number(km),
        modo_carga: filas.length >= numPosiciones ? "completa" : "parcial",
        observaciones,
        filas: filasLimpias,
      });

      // subir adjuntos si hay
      for (const file of archivos) {
        await subirAdjunto(res.planilla.id, file);
      }

      setResultado(res);
      setFilas([]);
      setArchivos([]);
    } catch (err) {
      alert("Error al guardar: " + err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Nueva planilla</h1>

      {/* CABECERA */}
      <section className="bg-white border rounded p-4 grid md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Matrícula *</label>
          <div className="flex gap-2">
            <input
              className="border rounded px-2 py-1 flex-1"
              value={matriculaInput}
              onChange={(e) => setMatriculaInput(e.target.value)}
              disabled={!!vehiculo}
            />
            {!vehiculo && (
              <button
                className="bg-slate-900 text-white text-sm px-3 py-1 rounded"
                onClick={buscarOCrearVehiculo}
              >
                Cargar
              </button>
            )}
            {vehiculo && (
              <button
                className="text-sm underline"
                onClick={() => {
                  setVehiculo(null);
                  setFilas([]);
                }}
              >
                cambiar
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Fecha *</label>
          <input
            type="date"
            className="border rounded px-2 py-1 w-full"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tipo de planilla *</label>
          <select
            className="border rounded px-2 py-1 w-full"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="relevamiento">Relevamiento</option>
            <option value="movimiento">Movimiento</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Chofer (opcional)</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={chofer}
            onChange={(e) => setChofer(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tipo de vehículo (opcional)</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={tipoVehiculo}
            onChange={(e) => setTipoVehiculo(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Km (opcional)</label>
          <input
            type="number"
            className="border rounded px-2 py-1 w-full"
            value={km}
            onChange={(e) => setKm(e.target.value)}
          />
        </div>

        {vehiculo && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Cantidad de posiciones del vehículo
            </label>
            <input
              type="number"
              min={1}
              className="border rounded px-2 py-1 w-full"
              value={numPosiciones}
              onChange={(e) => setNumPosiciones(Number(e.target.value))}
            />
          </div>
        )}
      </section>

      {vehiculo && (
        <>
          {/* ACCIONES SOBRE FILAS */}
          <div className="flex gap-3 flex-wrap">
            <button
              className="bg-white border px-3 py-1.5 rounded text-sm"
              onClick={cargarPosicionesDesdeEstadoActual}
            >
              Cargar las {numPosiciones} posiciones (con estado actual precargado)
            </button>
            <button className="bg-white border px-3 py-1.5 rounded text-sm" onClick={agregarFila}>
              + Agregar fila suelta
            </button>
            <span className="text-xs text-slate-500 self-center">
              Para un movimiento parcial: agregá una fila con acción "Sale" (neumático que se
              retira, indicando destino) y otra fila con la misma posición y acción "Entra"
              (neumático nuevo, indicando procedencia).
            </span>
          </div>

          {/* TABLA DE FILAS */}
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Acción</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Medida</th>
                  <th>N° Serie</th>
                  <th>DOT</th>
                  <th>Estado</th>
                  <th>% Desg.</th>
                  <th>Recap.</th>
                  <th>Reparación</th>
                  <th>Procedencia (si entra)</th>
                  <th>Destino (si sale)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        className="border rounded px-1 w-14"
                        value={f.posicion}
                        onChange={(e) => actualizarFila(idx, "posicion", e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="border rounded px-1"
                        value={f.accion}
                        onChange={(e) => actualizarFila(idx, "accion", e.target.value)}
                      >
                        {ACCIONES.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-20"
                        value={f.marca}
                        onChange={(e) => actualizarFila(idx, "marca", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-20"
                        value={f.modelo}
                        onChange={(e) => actualizarFila(idx, "modelo", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-20"
                        value={f.medida}
                        onChange={(e) => actualizarFila(idx, "medida", e.target.value)}
                      />
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
                      <input
                        type="number"
                        className="border rounded px-1 w-16"
                        value={f.porcentaje_desgaste}
                        onChange={(e) => actualizarFila(idx, "porcentaje_desgaste", e.target.value)}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={f.recapado}
                        onChange={(e) => actualizarFila(idx, "recapado", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-24"
                        value={f.reparacion}
                        onChange={(e) => actualizarFila(idx, "reparacion", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-32"
                        placeholder="Nuevo / Comprado usado / Vehículo X pos.2"
                        value={f.procedencia}
                        onChange={(e) => actualizarFila(idx, "procedencia", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="border rounded px-1 w-32"
                        placeholder="Depósito / Descarte / Vehículo Y pos.3"
                        value={f.destino}
                        onChange={(e) => actualizarFila(idx, "destino", e.target.value)}
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

          {/* OBSERVACIONES */}
          <section>
            <label className="block text-sm font-medium mb-1">Observaciones (texto libre)</label>
            <textarea
              className="border rounded px-3 py-2 w-full"
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </section>

          {/* ADJUNTOS */}
          <section>
            <label className="block text-sm font-medium mb-1">
              Archivos adjuntos (PDF, Excel, foto)
            </label>
            <input
              type="file"
              multiple
              accept=".pdf,.xls,.xlsx,image/*"
              onChange={(e) => setArchivos(Array.from(e.target.files))}
            />
          </section>

          <button
            disabled={guardando}
            onClick={guardar}
            className="bg-emerald-600 text-white px-5 py-2 rounded disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar planilla"}
          </button>

          {resultado && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-4 space-y-2">
              <p className="font-medium">Planilla guardada correctamente ✅</p>
              {resultado.planilla.informe_automatico && (
                <div className="text-sm whitespace-pre-line">
                  <strong>Informe automático:</strong>
                  {"\n" + resultado.planilla.informe_automatico}
                </div>
              )}
              {resultado.avisos && resultado.avisos.length > 0 && (
                <div className="text-sm text-amber-700 whitespace-pre-line">
                  <strong>Avisos de consistencia:</strong>
                  {"\n" + resultado.avisos.join("\n")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
