"use client";

import { useEffect, useRef, useState } from "react";
import { normalizarTexto, normalizarMedida } from "../lib/traceability";

// tipo: "medida" compara solo por números (para que separadores/letras
// distintos no lo traten como algo diferente). "texto" es para marca y
// modelo: ignora mayúsculas/minúsculas y acentos.
export default function CampoConSugerencias({
  value,
  onChange,
  opciones,
  tipo = "texto",
  className,
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function alHacerClickFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClickFuera);
    return () => document.removeEventListener("mousedown", alHacerClickFuera);
  }, []);

  const normalizar = tipo === "medida" ? normalizarMedida : normalizarTexto;
  const valorNormalizado = normalizar(value);
  const sugerencias = valorNormalizado
    ? (opciones || [])
        .filter((o) => o !== value && normalizar(o).includes(valorNormalizado))
        .slice(0, 6)
    : [];

  return (
    <div ref={ref} className="relative">
      <input
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        autoComplete="off"
      />
      {abierto && sugerencias.length > 0 && (
        <div className="absolute z-30 bg-white border rounded shadow mt-0.5 max-h-40 overflow-y-auto min-w-max">
          {sugerencias.map((s) => (
            <button
              key={s}
              type="button"
              className="block w-full text-left px-2 py-1 text-xs hover:bg-slate-100 whitespace-nowrap"
              onClick={() => {
                onChange(s);
                setAbierto(false);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
