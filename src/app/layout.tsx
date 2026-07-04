import type { Metadata } from "next";
import "./globals.css";
import { Toaster as SonnerToaster } from "sonner";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Trazabilidad Frimaral - Caliral S.A.",
  description: "Sistema de trazabilidad y control de envíos de carne",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <Script src="/trazabilidad/scripts/init.js?v=2" strategy="beforeInteractive" />
        <Script src="https://js.puter.com/v2/" strategy="afterInteractive" />
        <Script id="puter-fallback" strategy="afterInteractive">{'try { window.puter = window.puter || {}; } catch(e) {}'}</Script>
      </head>
      <body
        className="antialiased bg-background text-foreground"
      >
        {children}
        <SonnerToaster position="top-right" richColors closeButton duration={3000} />
      </body>
    </html>
  );
}