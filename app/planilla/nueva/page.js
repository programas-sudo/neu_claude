"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buscarVehiculoExacto,
  getVehiculoPorId,
  getEstadoActual,
  getPlanillaCompleta,
  guardarPlanilla,
  actualizarPlanilla,
  subirAdjunto,
  eliminarAdjunto,
} from "../../../lib/traceability";

const ACCIONES_MOVIMIENTO = [
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

function NuevaPlanillaInner() {
  const searchParams = useSearchParams();
  const planillaIdEdicion = searchParams.get("id");
  const modoEdicion = !!planillaIdEdicion;

  const [cargandoInicial, setCargandoInicial] = useState(modoEdicion);

  const [matriculaInput, setMatriculaInput] = useState("");
  const [matriculaConfirmada, setMatriculaConfirmada] = useState(false);
  const [vehiculo, setVehiculo] = useState(null); // vehículo EXISTENTE (con id)
  const [matriculaPendiente, setMatriculaPendiente] = useState(""); // matrícula nueva, todavía sin crear

  const [numPosiciones, setNumPosiciones] = useState(4);
  const [tipo, setTipo] = useState("relevamiento");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [chofer, setChofer] = useState("");
  const [tipoVehiculo, setTipoVehiculo] = useState("");
  const [km, setKm] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [filas, setFilas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [archivosNuevos, setArchivosNuevos] = useState([]);
  const [adjuntosExistentes, setAdjuntosExistentes] = useState([]);

  const matriculaEfectiva = vehiculo?.matricula || matriculaPendiente;

  // ---------- Carga inicial en modo edición ----------
  useEffect(() => {
    if (!modoEdicion) return;
    (async () => {
      const p = await getPlanillaCompleta(planillaIdEdicion);
      const v = await getVehiculoPorId(p.vehiculo_id);
      setVehiculo(v);
      setMatriculaConfirmada(true);
      setNumPosiciones(v.num_posiciones || 4);
      setTipo(p.tipo);
      setFecha(p.fecha);
      setChofer(p.chofer || "");
      setTipoVehiculo(p.tipo_vehiculo || "");
      setKm(p.km ?? "");
      setObservaciones(p.observaciones || "");
      setAdjuntosExistentes(p.adjuntos || []);
      setFilas(
        p.planilla_neumaticos.map((f) => ({
          posicion: f.posicion || "",
          accion: f.accion,
          marca: f.marca || "",
          modelo: f.modelo || "",
          medida: f.medida || "",
          numero_serie: f.numero_serie || "",
          dot: f.dot || "",
          estado: f.estado || "",
          porcentaje_desgaste: f.porcentaje_desgaste ?? "",
          recapado: f.recapado || false,
          reparacion: f.reparacion || "",
          procedencia: f.procedencia || "",
          destino: f.destino || "",
        }))
      );
      setCargandoInicial(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoEdicion, planillaIdEdicion]);

  async function buscarMatricula() {
    if (!matriculaInput.trim()) return;
    const encontrado = await buscarVehiculoExacto(matriculaInput);
    if (encontrado) {
      setVehiculo(encontrado);
      setTipoVehiculo(encontrado.tipo_vehiculo || "");
      setNumPosiciones(encontrado.num_posiciones || 4);
      setMatriculaPendiente("");
    } else {
      setVehiculo(null);
      setMatriculaPendiente(matriculaInput.trim().toUpperCase());
    }
    setMatriculaConfirmada(true);
  }

  function cambiarMatricula() {
    setMatriculaConfirmada(false);
    setVehiculo(null);
    setMatriculaPendiente("");
    setMatriculaInput("");
    setFilas([]);
  }

  async function cargarPosicionesDesdeEstadoActual() {
    let estado = [];
    if (vehiculo?.id) {
      estado = await getEstadoActual(vehiculo.id);
    }
    const nuevasFilas = [];
    for (let i = 1; i <= numPosiciones; i++) {
      const actual = estado.find((e) => String(e.posicion) === String(i) && e.tiene_neumatico !== false);
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

  // Cambiar de tipo de planilla normaliza las filas: un relevamiento
  // no admite entra/sale ni procedencia/destino (eso es de movimiento).
  function cambiarTipo(nuevoTipo) {
    setTipo(nuevoTipo);
    if (nuevoTipo === "relevamiento") {
      setFilas((prev) =>
        prev.map((f) => ({ ...f, accion: "permanece", procedencia: "", destino: "" }))
      );
    }
  }

  function agregarArchivos(fileList) {
    setArchivosNuevos((prev) => [...prev, ...Array.from(fileList)]);
  }

  function quitarArchivoNuevo(idx) {
    setArchivosNuevos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function quitarArchivoExistente(adjunto) {
    if (!confirm(`¿Sacar el archivo "${adjunto.nombre_archivo}"?`)) return;
    await eliminarAdjunto(adjunto);
    setAdjuntosExistentes((prev) => prev.filter((a) => a.id !== adjunto.id));
  }

  async function guardar() {
    if (!matriculaConfirmada) {
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

      let res;
      let planillaIdParaAdjuntos;

      if (modoEdicion) {
        res = await actualizarPlanilla(planillaIdEdicion, {
          vehiculoId: vehiculo.id,
          tipo,
          fecha,
          chofer,
          tipo_vehiculo: tipoVehiculo,
          km: km === "" ? null : Number(km),
          modo_carga: filas.length >= numPosiciones ? "completa" : "parcial",
          observaciones,
          filas: filasLimpias,
        });
        planillaIdParaAdjuntos = planillaIdEdicion;
      } else {
        res = await guardarPlanilla({
          matricula: matriculaEfectiva,
          tipo,
          fecha,
          chofer,
          tipo_vehiculo: tipoVehiculo,
          km: km === "" ? null : Number(km),
          modo_carga: filas.length >= numPosiciones ? "completa" : "parcial",
          observaciones,
          filas: filasLimpias,
        });
        planillaIdParaAdjuntos = res.planilla.id;
      }

      setResultado(res);
      setFilas(modoEdicion ? filas : []);

      // La subida de adjuntos se intenta APARTE: si falla, no hace parecer
      // que la planilla no se guardó (eso ya pasó, arriba).
      const erroresAdjuntos = [];
      for (const file of archivosNuevos) {
        try {
          await subirAdjunto(planillaIdParaAdjuntos, file);
        } catch (errArchivo) {
          erroresAdjuntos.push(errArchivo.message || String(errArchivo));
        }
      }
      if (erroresAdjuntos.length > 0) {
        alert(
          "La planilla se guardó correctamente, pero hubo un problema al subir " +
            (erroresAdjuntos.length === 1 ? "el archivo" : "algunos archivos") +
            ":\n\n" +
            erroresAdjuntos.join("\n")
        );
      } else {
        setArchivosNuevos([]);
      }

      if (modoEdicion) {
        // recargar adjuntos existentes para reflejar lo recién subido
        const actualizada = await getPlanillaCompleta(planillaIdEdicion);
        setAdjuntosExistentes(actualizada.adjuntos || []);
      }
    } catch (err) {
      alert("Error al guardar la planilla: " + err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargandoInicial) {
    return <p className="text-sm text-slate-500">Cargando planilla...</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {modoEdicion ? "Editar planilla" : "Nueva planilla"}
      </h1>

      {/* CABECERA */}
      <section className="bg-white border rounded p-4 grid md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Matrícula *</label>
          {!matriculaConfirmada ? (
            <div className="flex gap-2">
              <input
                className="border rounded px-2 py-1 flex-1"
                value={matriculaInput}
                onChange={(e) => setMatriculaInput(e.target.value)}
              />
              <button className="bg-slate-900 text-white text-sm px-3 py-1 rounded" onClick={buscarMatricula}>
                Buscar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-medium">{matriculaEfectiva}</span>
              {!vehiculo && (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  vehículo nuevo: se crea al guardar
                </span>
              )}
              {!modoEdicion && (
                <button className="text-xs underline" onClick={cambiarMatricula}>
                  cambiar
                </button>
              )}
            </div>
          )}
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
            onChange={(e) => cambiarTipo(e.target.value)}
            disabled={modoEdicion}
          >
            <option value="relevamiento">Relevamiento</option>
            <option value="movimiento">Movimiento</option>
          </select>
          {modoEdicion && (
            <p className="text-xs text-slate-400 mt-1">El tipo no se puede cambiar al editar.</p>
          )}
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

        {matriculaConfirmada && (
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

      {matriculaConfirmada && (
        <>
          {tipo === "relevamiento" ? (
            <p className="text-xs bg-slate-100 border rounded p-2 text-slate-600">
              Estás en un <strong>relevamiento</strong>: se registra el estado actual de cada
              posición (no hay entradas/salidas ni procedencia/destino — eso es de "Movimiento").
            </p>
          ) : (
            <p className="text-xs bg-slate-100 border rounded p-2 text-slate-600">
              Estás en un <strong>movimiento</strong>: para cambiar una posición agregá una fila
              con acción "Sale" (indicando destino) y otra con la misma posición y acción "Entra"
              (indicando procedencia). Las posiciones que no cambian no hace falta cargarlas.
            </p>
          )}

          {/* ACCIONES SOBRE FILAS */}
          <div className="flex gap-3 flex-wrap">
            <button
              className="bg-white border px-3 py-1.5 rounded text-sm"
              onClick={cargarPosicionesDesdeEstadoActual}
            >
              Cargar las {numPosiciones} posiciones {vehiculo ? "(con estado actual precargado)" : ""}
            </button>
            <button className="bg-white border px-3 py-1.5 rounded text-sm" onClick={agregarFila}>
              + Agregar fila suelta
            </button>
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
                  {tipo === "movimiento" && <th>Procedencia (si entra)</th>}
                  {tipo === "movimiento" && <th>Destino (si sale)</th>}
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
                      {tipo === "movimiento" ? (
                        <select
                          className="border rounded px-1"
                          value={f.accion}
                          onChange={(e) => actualizarFila(idx, "accion", e.target.value)}
                        >
                          {ACCIONES_MOVIMIENTO.map((a) => (
                            <option key={a.value} value={a.value}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-500 text-xs">Permanece</span>
                      )}
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
                    {tipo === "movimiento" && (
                      <td>
                        <input
                          className="border rounded px-1 w-32"
                          placeholder="Nuevo / Comprado usado / Vehículo X pos.2"
                          value={f.procedencia}
                          onChange={(e) => actualizarFila(idx, "procedencia", e.target.value)}
                        />
                      </td>
                    )}
                    {tipo === "movimiento" && (
                      <td>
                        <input
                          className="border rounded px-1 w-32"
                          placeholder="Depósito / Descarte / Vehículo Y pos.3"
                          value={f.destino}
                          onChange={(e) => actualizarFila(idx, "destino", e.target.value)}
                        />
                      </td>
                    )}
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

            {adjuntosExistentes.length > 0 && (
              <ul className="text-sm mb-2 space-y-1">
                {adjuntosExistentes.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <a href={a.url} target="_blank" rel="noreferrer" className="underline text-blue-600">
                      {a.nombre_archivo}
                    </a>
                    <button
                      className="text-red-600 text-xs"
                      onClick={() => quitarArchivoExistente(a)}
                    >
                      quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {archivosNuevos.length > 0 && (
              <ul className="text-sm mb-2 space-y-1">
                {archivosNuevos.map((file, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span>{file.name}</span>
                    <span className="text-xs text-slate-400">(pendiente de subir)</span>
                    <button className="text-red-600 text-xs" onClick={() => quitarArchivoNuevo(idx)}>
                      quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <input
              type="file"
              multiple
              accept=".pdf,.xls,.xlsx,image/*"
              onChange={(e) => {
                agregarArchivos(e.target.files);
                e.target.value = "";
              }}
            />
          </section>

          <button
            disabled={guardando}
            onClick={guardar}
            className="bg-emerald-600 text-white px-5 py-2 rounded disabled:opacity-50"
          >
            {guardando ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Guardar planilla"}
          </button>

          {resultado && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-4 space-y-2">
              <p className="font-medium">
                {modoEdicion ? "Planilla actualizada correctamente ✅" : "Planilla guardada correctamente ✅"}
              </p>
              {resultado.planilla?.informe_automatico && (
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

export default function NuevaPlanilla() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Cargando...</p>}>
      <NuevaPlanillaInner />
    </Suspense>
  );
}
