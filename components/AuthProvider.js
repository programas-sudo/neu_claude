"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getUsuarios, verificarPin } from "../lib/auth";

const SesionContext = createContext(null);

export function useSesion() {
  return useContext(SesionContext);
}

const CLAVE_STORAGE = "neu_usuario_actual";

export default function AuthProvider({ children }) {
  const [usuarios, setUsuarios] = useState([]);
  const [usuarioActual, setUsuarioActual] = useState(undefined); // undefined = todavía no se sabe
  const [usuarioParaPin, setUsuarioParaPin] = useState(null);
  const [pinIngresado, setPinIngresado] = useState("");
  const [error, setError] = useState("");
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    cargarUsuarios();
    const guardado = typeof window !== "undefined" ? localStorage.getItem(CLAVE_STORAGE) : null;
    setUsuarioActual(guardado ? JSON.parse(guardado) : null);
  }, []);

  async function cargarUsuarios() {
    try {
      const lista = await getUsuarios();
      setUsuarios(lista.filter((u) => u.activo));
    } catch {
      setUsuarios([]);
    }
  }

  async function confirmarPin(e) {
    e.preventDefault();
    setError("");
    setVerificando(true);
    try {
      const ok = await verificarPin(usuarioParaPin.id, pinIngresado);
      if (!ok) {
        setError("PIN incorrecto.");
        return;
      }
      const sesion = { id: usuarioParaPin.id, nombre: usuarioParaPin.nombre, es_admin: usuarioParaPin.es_admin };
      localStorage.setItem(CLAVE_STORAGE, JSON.stringify(sesion));
      setUsuarioActual(sesion);
      setUsuarioParaPin(null);
      setPinIngresado("");
    } catch (err) {
      setError("Error al verificar el PIN: " + err.message);
    } finally {
      setVerificando(false);
    }
  }

  function cerrarSesion() {
    localStorage.removeItem(CLAVE_STORAGE);
    setUsuarioActual(null);
  }

  if (usuarioActual === undefined) {
    return null; // todavía cargando desde localStorage, evita parpadeo
  }

  if (!usuarioActual) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white border rounded-lg shadow p-6 w-full max-w-sm space-y-4">
          <h1 className="text-lg font-semibold text-center">¿Quién sos?</h1>

          {!usuarioParaPin ? (
            <div className="divide-y border rounded">
              {usuarios.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setUsuarioParaPin(u);
                    setError("");
                    setPinIngresado("");
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50"
                >
                  {u.nombre}
                </button>
              ))}
              {usuarios.length === 0 && (
                <p className="text-sm text-slate-400 px-4 py-3">
                  Todavía no hay usuarios cargados. Pedile a un administrador que te dé de alta.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={confirmarPin} className="space-y-3">
              <p className="text-sm text-slate-600">
                Hola, <strong>{usuarioParaPin.nombre}</strong>. Ingresá tu PIN.
              </p>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                className="border rounded px-3 py-2 w-full text-center text-lg tracking-widest"
                value={pinIngresado}
                onChange={(e) => setPinIngresado(e.target.value)}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 border rounded py-2 text-sm"
                  onClick={() => setUsuarioParaPin(null)}
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={verificando}
                  className="flex-1 bg-slate-900 text-white rounded py-2 text-sm disabled:opacity-50"
                >
                  {verificando ? "Verificando..." : "Entrar"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <SesionContext.Provider value={{ usuarioActual, cerrarSesion }}>
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between flex-wrap gap-2">
        <a href="/" className="font-semibold text-lg">
          🛞 Trazabilidad de Neumáticos
        </a>
        <nav className="flex gap-4 text-sm items-center flex-wrap">
          <a href="/buscar-patente" className="hover:underline">
            Buscar por patente
          </a>
          <a href="/buscar-serie" className="hover:underline">
            Buscar por N° de serie
          </a>
          <a href="/planilla/nueva" className="hover:underline">
            Nueva planilla
          </a>
          <a href="/stock" className="hover:underline">
            Stock
          </a>
          {usuarioActual.es_admin && (
            <a href="/ajustes" className="hover:underline">
              Ajustes
            </a>
          )}
          <span className="text-slate-300 text-xs border-l border-slate-600 pl-4 ml-1">
            {usuarioActual.nombre}
          </span>
          <button onClick={cerrarSesion} className="text-slate-300 hover:text-white text-xs underline">
            cambiar de usuario
          </button>
        </nav>
      </header>
      <main className="p-6 max-w-6xl mx-auto">{children}</main>
    </SesionContext.Provider>
  );
}
