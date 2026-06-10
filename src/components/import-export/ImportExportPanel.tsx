'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, Info } from 'lucide-react';

export default function ImportExportPanel() {
  const handleExport = () => {
    fetch('/data/shipments.json').then(r=>r.json()).then(async (shipments) => {
      const XLSX = await import('xlsx');
      const data = shipments.map((s:Record<string,unknown>) => ({
        'Nro. Trámite':s.nroTramite,'Fecha':s.fechaTramite?new Date(s.fechaTramite).toISOString().split('T')[0]:'',
        'COTE':s.nroCote,'Destino':s.nombreEstablecimientoDestino,'País':s.paisDestino,
        'Producto':s.denominacionMercaderia,'Corte':s.corte,'Envases':s.cantidadEnvases,
        'Peso Bruto':s.pesoBruto,'Peso Neto':s.pesoNeto,'Transporte':s.tipoTransporte,
        'Matrícula':s.matriculaCamion,'Precinto':s.precinto1,'Tipo':s.tipo,
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Envíos');
      XLSX.writeFile(wb, `trazabilidad_${new Date().toISOString().split('T')[0]}.xlsx`);
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-[900px]">
      <h2 className="text-2xl font-bold text-slate-800">Importar / Exportar</h2>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4"/>Importar Datos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-700 text-sm"><Info className="h-4 w-4 shrink-0"/>
            <div><p className="font-medium">Disponible solo en modo local</p><p className="text-amber-600 mt-1">Ejecutá <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">bun run dev</code> para importar nuevos datos.</p></div>
          </div>
        </CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4"/>Exportar Datos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">Exportá los 3,461 registros a Excel directamente desde el navegador.</p>
          <Button onClick={handleExport} className="bg-emerald-600 hover:bg-emerald-700"><Download className="h-4 w-4 mr-2"/>Exportar a Excel</Button>
        </CardContent></Card>
    </div>
  );
}
