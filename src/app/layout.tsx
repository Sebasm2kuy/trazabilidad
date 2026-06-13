import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trazabilidad - Frigorífico San Jacinto",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var p = new URLSearchParams(window.location.search);
                if (p.get('reset') === '1') {
                  var keys = [
                    'trazabilidad_new_records','trazabilidad_exp_edits','trazabilidad_exp_deleted',
                    'trazabilidad_exp_ingresos','trazabilidad_dep_edits','trazabilidad_dep_new_records',
                    'trazabilidad_dep_deleted','cruce_caliral_edits','trazabilidad_stock_data',
                    'trazabilidad_imported_batches','trazabilidad_recent_searches',
                    'trazabilidad_dep_imported','trazabilidad_exp_imported'
                  ];
                  keys.forEach(function(k){ localStorage.removeItem(k); });

                  var sheetUrl = localStorage.getItem('trazabilidad_sheets_url') || '';
                  if (sheetUrl) {
                    var done = 0;
                    var total = keys.length;
                    keys.forEach(function(k){
                      fetch(sheetUrl, {
                        method: 'POST',
                        headers: {'Content-Type':'text/plain;charset=utf-8'},
                        body: JSON.stringify({action:'delete',key:k})
                      }).then(function(){
                        done++;
                        if (done >= total) {
                          localStorage.setItem('trazabilidad_sheets_last_sync', new Date().toISOString());
                          window.history.replaceState({}, '', window.location.pathname);
                          window.location.reload();
                        }
                      }).catch(function(){
                        done++;
                        if (done >= total) {
                          localStorage.setItem('trazabilidad_sheets_last_sync', new Date().toISOString());
                          window.history.replaceState({}, '', window.location.pathname);
                          window.location.reload();
                        }
                      });
                    });
                  } else {
                    window.history.replaceState({}, '', window.location.pathname);
                    window.location.reload();
                  }
                }
              } catch(e) {}
            })();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if(new URLSearchParams(window.location.search).get('reset')==='1'){window.__TRZ_RESET=1;}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-right" richColors closeButton duration={3000} />
      </body>
    </html>
  );
}