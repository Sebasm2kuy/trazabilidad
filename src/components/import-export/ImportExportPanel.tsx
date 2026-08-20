'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { previewStockFile, type StockFilePreview } from '@/lib/import/stockPreview';
import { fmt } from '@/lib/utils';

export default function ImportExportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<StockFilePreview | null>(null);
  const [error, setError] = useState('');

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      setPreview(await previewStockFile(file));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'No se pudo analizar el archivo.');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-[1200px]">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Importar stock</h2>
        <p className="text-sm text-slate-500 mt-1">Vista previa segura: esta etapa no modifica Supabase.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Seleccionar fotografía de stock
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={inputRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFile} />
          <Button onClick={() => inputRef.current?.click()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {loading ? 'Analizando…' : 'Elegir XLS/XLSX'}
          </Button>
          <p className="text-xs text-slate-500">Máximo 10 MB. Se calcula SHA-256 y se validan encabezados, fechas, números, duplicados y totales.</p>
          {error && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-5 w-5 shrink-0" /> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <>
          <Card className="border-emerald-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="h-5 w-5" /> Archivo validado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Stat label="Archivo" value={preview.fileName} />
                <Stat label="Fecha de stock" value={preview.stockDate || 'No detectada'} />
                <Stat label="Hoja / encabezado" value={`${preview.sheetName} / fila ${preview.headerRow}`} />
                <Stat label="Tamaño" value={`${(preview.sourceBytes / 1024).toFixed(1)} KB`} />
                <Stat label="Líneas válidas" value={fmt(preview.validRows)} />
                <Stat label="Duplicadas omitidas" value={fmt(preview.duplicateRows)} />
                <Stat label="Rechazadas" value={fmt(preview.rejectedRows.length)} />
                <Stat label="Pallets" value={fmt(preview.totalPallets)} />
                <Stat label="Cajas" value={fmt(preview.totalPackages)} />
                <Stat label="Kilos" value={preview.totalKilos.toLocaleString('es-UY', { maximumFractionDigits: 3 })} />
              </dl>
              <div className="rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-600 break-all">
                SHA-256: {preview.sourceHash}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Muestra de las primeras {preview.lines.length} líneas</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs">
                <thead><tr className="border-b bg-slate-50 text-left text-slate-500">
                  <th className="p-2">Fila</th><th className="p-2">Cliente</th><th className="p-2">Contenedor</th>
                  <th className="p-2">Lote</th><th className="p-2">Contenido</th><th className="p-2 text-right">Pallets</th>
                  <th className="p-2 text-right">Cajas</th><th className="p-2 text-right">Kilos</th><th className="p-2">COTE/Pase</th>
                </tr></thead>
                <tbody>{preview.lines.map(line => (
                  <tr key={`${line.sourceRow}-${line.dedupKey}`} className="border-b last:border-0">
                    <td className="p-2">{line.sourceRow}</td><td className="p-2">{line.customerCode} {line.customerName}</td>
                    <td className="p-2">{line.containerNumber}</td><td className="p-2">{line.lot}</td>
                    <td className="p-2 max-w-[300px] truncate" title={line.productDescription}>{line.productDescription}</td>
                    <td className="p-2 text-right">{line.pallets}</td><td className="p-2 text-right">{line.packages}</td>
                    <td className="p-2 text-right">{line.kilos.toLocaleString('es-UY')}</td><td className="p-2">{line.cote || line.sanitaryPass || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-2 text-sm text-amber-800">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              La confirmación seguirá bloqueada hasta desplegar y probar la Edge Function transaccional.
            </div>
            <Button disabled>Confirmar importación</Button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border bg-white p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="font-semibold mt-1 break-words">{value}</dd></div>;
}
