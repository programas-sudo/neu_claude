"use client";

import { useState } from "react";
import { verificarPin } from "../lib/auth";

// Uso: <ConfirmarPinModal usuario={usuarioActual} titulo="..." onConfirmar={async () => {...}} onCancelar={() => {...}} />
export default function ConfirmarPinModal({ usuario, titulo, mensaje, onConfirmar, onCancelar }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [verificando, setVerificando] = useState(false);

  async function confirmar(e) {
    e.preventDefault();
    setError("");
    setVerificando(true);
    try {
      const ok = await verificarPin(usuario.id, pin);
      if (!ok) {
        setError("PIN incorrecto.");
        return;
      }
      await onConfirmar();
    } catch (err) {
      setError("Error: " + err.message);
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow p-6 w-full max-w-sm space-y-3">
        <h3 className="font-semibold">{titulo}</h3>
        {mensaje && <p className="text-sm text-slate-600">{mensaje}</p>}
        <form onSubmit={confirmar} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder={`PIN de ${usuario.nombre}`}
            className="border rounded px-3 py-2 w-full text-center text-lg tracking-widest"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="flex-1 border rounded py-2 text-sm" onClick={onCancelar}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={verificando}
              className="flex-1 bg-red-600 text-white rounded py-2 text-sm disabled:opacity-50"
            >
              {verificando ? "Verificando..." : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
