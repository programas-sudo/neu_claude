export default function Home() {
  const opciones = [
    {
      href: "/buscar-matricula",
      titulo: "Buscar por matrícula",
      texto:
        "Ver el estado actual de los neumáticos de un vehículo y el historial completo de planillas cargadas.",
    },
    {
      href: "/buscar-serie",
      titulo: "Buscar por N° de serie",
      texto:
        "Ver el trayecto completo de un neumático específico: en qué vehículos y posiciones estuvo, recapados, reparaciones.",
    },
    {
      href: "/planilla/nueva",
      titulo: "Nueva planilla",
      texto: "Cargar un relevamiento o un movimiento de neumáticos.",
    },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {opciones.map((o) => (
        <a
          key={o.href}
          href={o.href}
          className="block bg-white rounded-lg shadow p-5 hover:shadow-md transition border"
        >
          <h2 className="font-semibold text-lg mb-2">{o.titulo}</h2>
          <p className="text-sm text-slate-600">{o.texto}</p>
        </a>
      ))}
    </div>
  );
}
