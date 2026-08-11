"use client";

import { useEffect, useState } from "react";
import { useSesion } from "../../components/AuthProvider";
import { getUsuarios, crearUsuario, actualizarUsuario, cambiarPin, eliminarUsuario } from "../../lib/auth";
import { getTodasLasPatentes, renombrarPatente } from "../../lib/traceability";
import VolverAtras from "../../components/VolverAtras";

export default function Ajustes() {
  const { usuarioActual } = useSesion();
  const [usuarios, setUsuarios] = useState([]);
  const [patentes, setPatentes] = useState([]);
  const [patentesEditadas, setPatentesEditadas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [esAdminNuevo, setEsAdminNuevo] = useState(false);
  const [pinesEditados, setPinesEditados] = useState({});

  async function cargar() {
    setCargando(true);
    try {
      setUsuarios(await getUsuarios());
      setPatentes(await getTodasLasPatentes());
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  if (!usuarioActual.es_admin) {
    return (
      <div className="space-y-4">
        <VolverAtras />
        <p className="text-sm text-slate-500">No tenés permiso para ver esta sección.</p>
      </div>
    );
  }

  async function agregarUsuario(e) {
    e.preventDefault();
    if (!nombreNuevo.trim() || !pinNuevo.trim()) {
      alert("Completá nombre y PIN.");
      return;
    }
    try {
      await crearUsuario(nombreNuevo, pinNuevo, esAdminNuevo);
      setNombreNuevo("");
      setPinNuevo("");
      setEsAdminNuevo(false);
      await cargar();
    } catch (err) {
      alert("Error al crear el usuario: " + err.message);
    }
  }

  async function toggleAdmin(u) {
    try {
      await actualizarUsuario(u.id, { es_admin: !u.es_admin });
      await cargar();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function toggleActivo(u) {
    try {
      await actualizarUsuario(u.id, { activo: !u.activo });
      await cargar();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function guardarPin(u) {
    const nuevo = pinesEditados[u.id];
    if (!nuevo || !nuevo.trim()) return;
    try {
      await cambiarPin(u.id, nuevo.trim());
      setPinesEditados((prev) => ({ ...prev, [u.id]: "" }));
      alert(`PIN actualizado para ${u.nombre}.`);
    } catch (err) {
      alert("Error al cambiar el PIN: " + err.message);
    }
  }

  async function borrarUsuario(u) {
    if (!window.confirm(`¿Borrar al usuario "${u.nombre}"? Esto no se puede deshacer.`)) return;
    try {
      await eliminarUsuario(u.id);
      await cargar();
    } catch (err) {
      alert("Error al borrar: " + err.message);
    }
  }

  async function guardarPatente(v) {
    const nueva = patentesEditadas[v.id];
    if (!nueva || !nueva.trim()) return;
    if (!window.confirm(`¿Cambiar la patente "${v.matricula}" por "${nueva.trim().toUpperCase()}"?`)) return;
    try {
      await renombrarPatente(v.id, nueva);
      setPatentesEditadas((prev) => ({ ...prev, [v.id]: "" }));
      await cargar();
    } catch (err) {
      alert("Error al renombrar: " + err.message);
    }
  }

  return (
    <div className="space-y-6">
      <VolverAtras />
      <h1 className="text-xl font-semibold">Ajustes — Usuarios</h1>

      <section className="bg-white border rounded p-4">
        <h3 className="font-medium mb-3">Nuevo usuario</h3>
        <form onSubmit={agregarUsuario} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              className="border rounded px-2 py-1"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              className="border rounded px-2 py-1"
              value={pinNuevo}
              onChange={(e) => setPinNuevo(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={esAdminNuevo} onChange={(e) => setEsAdminNuevo(e.target.checked)} />
            Administrador
          </label>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded text-sm" type="submit">
            Agregar
          </button>
        </form>
      </section>

      {cargando && <p className="text-sm text-slate-500">Cargando...</p>}

      <section>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Administrador</th>
              <th>Activo</th>
              <th>Nuevo PIN</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.nombre}</td>
                <td>
                  <input type="checkbox" checked={u.es_admin} onChange={() => toggleAdmin(u)} />
                </td>
                <td>
                  <input type="checkbox" checked={u.activo} onChange={() => toggleActivo(u)} />
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <input
                      type="password"
                      inputMode="numeric"
                      className="border rounded px-1 w-20"
                      value={pinesEditados[u.id] || ""}
                      onChange={(e) => setPinesEditados((prev) => ({ ...prev, [u.id]: e.target.value }))}
                    />
                    <button className="text-xs underline" onClick={() => guardarPin(u)}>
                      guardar
                    </button>
                  </div>
                </td>
                <td>
                  <button className="text-red-600 text-xs" onClick={() => borrarUsuario(u)}>
                    borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-medium mb-3">Corregir una patente mal escrita</h3>
        <table>
          <thead>
            <tr>
              <th>Patente actual</th>
              <th>Corregir a</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patentes.map((v) => (
              <tr key={v.id}>
                <td>{v.matricula}</td>
                <td>
                  <input
                    className="border rounded px-1 w-32"
                    value={patentesEditadas[v.id] || ""}
                    onChange={(e) => setPatentesEditadas((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  />
                </td>
                <td>
                  <button className="text-xs underline" onClick={() => guardarPatente(v)}>
                    guardar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
