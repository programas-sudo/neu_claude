"use client";

export default function ConfirmarInstanciaModal({ fila, candidatos, onResolver }) {
  function describirUbicacion(c) {
    if (c.enStock) return `en stock (comprado el ${c.fechaCompra})`;
    if (!c.vigente) return "sin ubicación registrada";
    if (c.vigente.instalado) return `instalado en ${c.vigente.matricula}, posición ${c.vigente.posicion}`;
    return `sin asignar (salió de ${c.vigente.matricula} el ${c.vigente.fecha})`;
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow p-6 w-full max-w-md space-y-4">
        <h3 className="font-semibold">Este número ya está cargado</h3>
        <p className="text-sm text-slate-600">
          Ya existe {candidatos.length > 1 ? "más de un neumático" : "un neumático"} con marca{" "}
          <strong>{fila.marca}</strong>, medida <strong>{fila.medida}</strong> y{" "}
          {fila.numero_serie ? "N° de serie" : "DOT"}{" "}
          <strong>{fila.numero_serie || fila.dot}</strong>. ¿Es alguno de estos, o es un neumático
          físicamente distinto que por casualidad comparte el mismo código?
        </p>

        <div className="space-y-2">
          {candidatos.map((c) => (
            <button
              key={c.instancia}
              className="w-full text-left border rounded px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => onResolver({ instancia: c.instancia })}
            >
              Es el mismo que está {describirUbicacion(c)}.
            </button>
          ))}
          <button
            className="w-full text-left border border-orange-300 rounded px-3 py-2 text-sm hover:bg-orange-50"
            onClick={() => {
              const maxInstancia = Math.max(0, ...candidatos.map((c) => c.instancia));
              onResolver({ instancia: maxInstancia + 1 });
            }}
          >
            Es un neumático distinto (mismo código, otra unidad física).
          </button>
        </div>
      </div>
    </div>
  );
}
