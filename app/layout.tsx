import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Código Abierto 2026 | Door List",
  description: "Registro para Código Abierto 2026 en La Paz.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}