import "./globals.css";
import AuthProvider from "../components/AuthProvider";

export const metadata = {
  title: "Trazabilidad de Neumáticos",
  description: "Sistema interno de trazabilidad de neumáticos",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
