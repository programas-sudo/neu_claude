import "./globals.css";

export const metadata = {
  title: "Trazabilidad de Neumáticos",
  description: "Sistema interno de trazabilidad de neumáticos",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-semibold text-lg">
            🛞 Trazabilidad de Neumáticos
          </a>
          <nav className="flex gap-4 text-sm">
            <a href="/buscar-matricula" className="hover:underline">
              Buscar por matrícula
            </a>
            <a href="/buscar-serie" className="hover:underline">
              Buscar por N° de serie
            </a>
            <a href="/planilla/nueva" className="hover:underline">
              Nueva planilla
            </a>
          </nav>
        </header>
        <main className="p-6 max-w-6xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
