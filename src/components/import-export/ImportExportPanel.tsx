'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export default function ImportExportPanel() {
  const { filters, search } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<Array<Record<string, unknown>> | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [recordsToImport, setRecordsToImport] = useState<Array<Record<string, unknown>> | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setPreview(null);
    setRecordsToImport(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const json = await res.json();

      if (json.error) {
        setImportResult({ ok: false, msg: json.error });
      } else {
        setPreview(json.preview);
        setPreviewTotal(json.total);
        setRecordsToImport(json.records);
      }
    } catch (err) {
      setImportResult({ ok: false, msg: 'Error al procesar el archivo' });
    }
    setImporting(false);
  };

  const confirmImport = async () => {
    if (!recordsToImport) return;
    setImporting(true);
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recordsToImport[0]),
      });
      if (!res.ok) throw new Error();

      for (let i = 1; i < recordsToImport.length; i++) {
        await fetch('/api/shipments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordsToImport[i]),
        });
      }
      setImportResult({ ok: true, msg: `${recordsToImport.length} registros importados correctamente.` });
      setPreview(null);
      setRecordsToImport(null);
    } catch {
      setImportResult({ ok: false, msg: 'Error al guardar registros.' });
    }
    setImporting(false);
  };

  const handleExport = () => {
    const params = new URLSearchParams({ search, ...filters });
    window.open(`/api/export?${params}`, '_blank');
  };

  return (
    <div className="p-6 space-y-6 max-w-[900px]">
      <h2 className="text-2xl font-bold text-slate-800">Importar / Exportar</h2>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" />Importar Datos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">Subí un archivo Excel (.xlsx) con el mismo formato del sistema para importar nuevos registros de ingreso o egreso.</p>
          <div className="flex gap-3">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              Seleccionar Archivo
            </Button>
          </div>

          {importResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${importResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {importResult.ok ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {importResult.msg}
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Vista previa: {previewTotal} registros encontrados. Mostrando los primeros {preview.length}:</p>
              <div className="overflow-x-auto border rounded-lg max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="px-2 py-2 text-left">Trámite</th>
                      <th className="px-2 py-2 text-left">COTE</th>
                      <th className="px-2 py-2 text-left">Producto</th>
                      <th className="px-2 py-2 text-left">Corte</th>
                      <th className="px-2 py-2 text-right">Peso Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1.5">{r.nroTramite}</td>
                        <td className="px-2 py-1.5">{r.nroCote}</td>
                        <td className="px-2 py-1.5 max-w-[200px] truncate">{r.denominacionMercaderia}</td>
                        <td className="px-2 py-1.5">{r.corte || '-'}</td>
                        <td className="px-2 py-1.5 text-right">{r.pesoNeto || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <Button onClick={confirmImport} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700">
                  {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Confirmar Importación ({previewTotal} registros)
                </Button>
                <Button variant="ghost" onClick={() => { setPreview(null); setRecordsToImport(null); }}>Cancelar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" />Exportar Datos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">Exportá los datos actuales a un archivo Excel. Se aplican los filtros activos de la pestaña Envíos.</p>
          <Button onClick={handleExport} className="bg-emerald-600 hover:bg-emerald-700">
            <Download className="h-4 w-4 mr-2" />
            Exportar a Excel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}