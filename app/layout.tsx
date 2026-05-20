import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GGMAX Control",
  description: "Controle GGMAX com Supabase, FIFO e webhook"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR" className="dark"><body>{children}</body></html>;
}
