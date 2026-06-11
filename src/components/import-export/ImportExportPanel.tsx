'use client';
import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Trash2, Table2 } from 'lucide-react';
import type { Shipment } from '@/lib/types';

interface ImportedBatch {
  id: string;
  name: string;
  date: string;
  count: number;
  tipo: 'ingreso' | 'exportacion';
  data: Shipment[];
}

const BATCHES_KEY = 'trazabilidad_imported_batches';

function loadBatches(): ImportedBatch[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(BATCHES_KEY) || '[]'); } catch { return []; }
}
function saveBatches(batches: ImportedBatch[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BATCHES_KEY, JSON.stringify(batches));
}

function mapRowToShipment(row: Record<string, unknown>, tipo: 'ingreso' | 'exportacion', idx: number): Shipment | null {
  const nroTramite = Number(row['Nro. Trámite'] || row['nroTramite'] || row['Trámite'] || row['tramite'] || 0);
  const nroCote = String(row['COTE'] || row['nroCote'] || row['cote'] || '').trim().toUpperCase();
  if (!nroTramite && !nroCote) return null;

  const fechaRaw = row['Fecha'] || row['fechaTramite'] || row['fecha'] || '';
  let fechaTramite = '';
  if (fechaRaw) {
    try { fechaTramite = new Date(String(fechaRaw) + (String(fechaRaw).length === 10 ? 'T12:00:00' : '')).toISOString(); }
    catch { fechaTramite = new Date().toISOString(); }
  } else {
    fechaTramite = new Date().toISOString();
  }

  return {
    id: `imp-${tipo}-${Date.now()}-${idx}`,
    nroTramite,
    fechaTramite,
    nroCote,
    nombreEstablecimientoDestino: String(row['Destino'] || row['nombreEstablecimientoDestino'] || row['destino'] || tipo === 'ingreso' ? 'CALIRAL' : ''),
    paisDestino: String(row['País'] || row['Pais'] || row['paisDestino'] || row['pais'] || 'URUGUAY'),
    denominacionMercaderia: String(row['Producto'] || row['denominacionMercaderia'] || row['producto'] || ''),
    corte: String(row['Corte'] || row['corte'] || ''),
    cantidadEnvases: Number(row['Envases'] || row['cantidadEnvases'] || row['envases'] || 0) || null,
    pesoBruto: Number(row['Peso Bruto'] || row['pesoBruto'] || 0) || null,
    pesoNeto: Number(row['Peso Neto'] || row['pesoNeto'] || 0) || null,
    pallets: Number(row['Pallets'] || row['pallets'] || 0) || null,
    tipoTransporte: String(row['Transporte'] || row['tipoTransporte'] || '') || null,
    matriculaCamion: String(row['Matrícula'] || row['Matricula'] || row['matriculaCamion'] || '') || null,
    precinto1: String(row['Precinto'] || row['precinto1'] || row['precinto'] || '') || null,
    contenedorSerieNro: String(row['Contenedor'] || row['contenedorSerieNro'] || '') || null,
    nroCertificadoSanitario: String(row['Cert. Sanitario'] || row['nroCertificadoSanitario'] || '') || null,
    observaciones: String(row['Observaciones'] || row['observaciones'] || '') || null,
    tipo: tipo === 'ingreso' ? 'INGRESO' : 'EXPORTACION',
  };
}

export default function ImportExportPanel() {
  const [batches, setBatches] = useState<ImportedBatch[]>(() => loadBatches());
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: number; fail: number; batchId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewBatch, setPreviewBatch] = useState<ImportedBatch | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setLastResult(null);

    try {
      const XLSX = await import('xlsx');
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]);

      if (rows.length === 0) {
        setLastResult({ ok: 0, fail: rows.length, batchId: '' });
        setImporting(false);
        return;
      }

      // Auto-detect type from data
      const firstRow = rows[0];
      const hasPais = firstRow['País'] || firstRow['paisDestino'] || firstRow['Pais'];
      const hasDestino = firstRow['Destino'] || firstRow['nombreEstablecimientoDestino'];
      const tipo: 'ingreso' | 'exportacion' = (hasPais && hasDestino) ? 'exportacion' : 'ingreso';

      const mapped: Shipment[] = [];
      let fail = 0;
      rows.forEach((row, idx) => {
        const s = mapRowToShipment(row, tipo, idx);
        if (s) mapped.push(s); else fail++;
      });

      const batch: ImportedBatch = {
        id: `batch-${Date.now()}`,
        name: file.name,
        date: new Date().toISOString(),
        count: mapped.length,
        tipo,
        data: mapped,
      };

      const updated = [batch, ...batches];
      setBatches(updated);
      saveBatches(updated);
      setLastResult({ ok: mapped.length, fail, batchId: batch.id });
    } catch (err) {
      console.error(err);
      setLastResult({ ok: 0, fail: -1, batchId: '' });
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const deleteBatch = (id: string) => {
    const updated = batches.filter(b => b.id !== id);
    setBatches(updated);
    saveBatches(updated);
    if (previewBatch?.id === id) setPreviewBatch(null);
  };

  const clearAll = () => {
    setBatches([]);
    saveBatches([]);
    setPreviewBatch(null);
    setLastResult(null);
  };

  const exportAllBatches = async () => {
    const XLSX = await import('xlsx');
    const allData = batches.flatMap(b => b.data.map(s => ({
      'Tipo': s.tipo, 'Nro. Trámite': s.nroTramite,
      'Fecha': s.fechaTramite?.split('T')[0] || '', 'COTE': s.nroCote,
      'País': s.paisDestino, 'Destino': s.nombreEstablecimientoDestino,
      'Producto': s.denominacionMercaderia, 'Corte': s.corte,
      'Envases': s.cantidadEnvases, 'Peso Bruto': s.pesoBruto, 'Peso Neto': s.pesoNeto,
      'Contenedor': s.contenedorSerieNro || '', 'Precinto': s.precinto1 || '',
      'Transporte': s.tipoTransporte || '', 'Observaciones': s.observaciones || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allData), 'Importados');
    XLSX.writeFile(wb, `datos_importados_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportOriginal = () => {
    fetch('data/shipments.json').then(r => r.json()).then(async (shipments) => {
      const XLSX = await import('xlsx');
      const data = (shipments as Record<string, unknown>[]).map(s => ({
        'Nro. Trámite': s.nroTramite, 'Fecha': s.fechaTramite ? new Date(s.fechaTramite as string).toISOString().split('T')[0] : '',
        'COTE': s.nroCote, 'Destino': s.nombreEstablecimientoDestino, 'País': s.paisDestino,
        'Producto': s.denominacionMercaderia, 'Corte': s.corte, 'Envases': s.cantidadEnvases,
        'Peso Bruto': s.pesoBruto, 'Peso Neto': s.pesoNeto, 'Transporte': s.tipoTransporte,
        'Matrícula': s.matriculaCamion, 'Precinto': s.precinto1, 'Tipo': s.tipo,
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Envíos');
      XLSX.writeFile(wb, `trazabilidad_original_${new Date().toISOString().split('T')[0]}.xlsx`);
    });
  };

  const exportExpOriginal = () => {
    fetch('data/exportaciones.json').then(r => r.json()).then(async (exports) => {
      const XLSX = await import('xlsx');
      const data = (exports as Record<string, unknown>[]).map(s => ({
        'Nro. Trámite': s.nroTramite, 'Fecha': s.fechaTramite ? new Date(s.fechaTramite as string).toISOString().split('T')[0] : '',
        'COTE': s.nroCote, 'País': s.paisDestino, 'Destino': s.nombreEstablecimientoDestino,
        'Producto': s.denominacionMercaderia, 'Corte': s.corte, 'Envases': s.cantidadEnvases,
        'Peso Bruto': s.pesoBruto, 'Peso Neto': s.pesoNeto,
        'Contenedor': s.contenedorSerieNro, 'Precinto': s.precinto1,
        'Cert. Sanitario': s.nroCertificadoSanitario, 'Transporte': s.tipoTransporte,
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Exportaciones');
      XLSX.writeFile(wb, `exportaciones_original_${new Date().toISOString().split('T')[0]}.xlsx`);
    });
  };

  const totalImported = batches.reduce((s, b) => s + b.count, 0);

  return (
    <div className="p-6 space-y-4 max-w-[1100px]">
      <h2 className="text-2xl font-bold text-slate-800">Importar / Exportar</h2>

      {/* Import card */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4 text-amber-600" />Importar Datos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">Cargá un archivo Excel (.xlsx) o CSV con los datos de envíos. El sistema detecta automáticamente si son ingresos o exportaciones según las columnas.</p>

          <div className="flex flex-wrap gap-2 items-center">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <Button onClick={() => fileRef.current?.click()} disabled={importing}>
              <Upload className="h-4 w-4 mr-2" />
              {importing ? 'Procesando...' : 'Seleccionar archivo'}
            </Button>
          </div>

          {lastResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${lastResult.fail === -1 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {lastResult.fail === -1 ? (
                <><AlertTriangle className="h-4 w-4 shrink-0" /><span>Error al leer el archivo. Verificá que sea un Excel o CSV válido.</span></>
              ) : (
                <><CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{lastResult.ok} registros importados{lastResult.fail > 0 ? `, ${lastResult.fail} filas ignoradas (sin trámite ni COTE)` : ''}</span></>
              )}
            </div>
          )}

          <div className="text-[11px] text-slate-400 space-y-1">
            <p><b>Columnas reconocidas:</b> Nro. Trámite, Fecha, COTE, País/Destino, Producto, Corte, Envases, Peso Bruto, Peso Neto, Contenedor, Precinto, Transporte, Observaciones</p>
            <p>Si la fila tiene País y Destino se importa como Exportación, si no como Ingreso.</p>
          </div>
        </CardContent>
      </Card>

      {/* Export card */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4 text-emerald-600" />Exportar Datos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">Descargá los datos en formato Excel.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportOriginal} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <FileSpreadsheet className="h-4 w-4 mr-2" />Envíos (Ingresos)
            </Button>
            <Button variant="outline" onClick={exportExpOriginal} className="border-blue-300 text-blue-700 hover:bg-blue-50">
              <FileSpreadsheet className="h-4 w-4 mr-2" />Exportaciones
            </Button>
            {batches.length > 0 && (
              <Button variant="outline" onClick={exportAllBatches} className="border-amber-300 text-amber-700 hover:bg-amber-50">
                <FileSpreadsheet className="h-4 w-4 mr-2" />Datos Importados ({totalImported})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Imported batches */}
      {batches.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Table2 className="h-4 w-4 text-violet-600" />Datos Importados ({totalImported} registros en {batches.length} lotes)</CardTitle>
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={clearAll}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />Borrar todo
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="border-b text-left text-xs text-slate-500 uppercase">
                    <th className="px-3 py-2">Archivo</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2 text-right">Registros</th>
                    <th className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id} className="border-b hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs font-medium">{b.name}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${b.tipo === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          {b.tipo === 'ingreso' ? 'Ingreso' : 'Exportación'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{new Date(b.date).toLocaleString('es-UY')}</td>
                      <td className="px-3 py-2 text-xs text-right font-mono font-bold">{b.count}</td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPreviewBatch(previewBatch?.id === b.id ? null : b)}>
                            {previewBatch?.id === b.id ? 'Ocultar' : 'Ver'}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-[11px] text-red-400 hover:text-red-600" onClick={() => deleteBatch(b.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewBatch && (
              <div className="border-t overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b text-left text-[10px] text-slate-500 uppercase">
                      <th className="px-2 py-1.5">Trámite</th><th className="px-2 py-1.5">Fecha</th><th className="px-2 py-1.5">COTE</th>
                      <th className="px-2 py-1.5">País</th><th className="px-2 py-1.5">Producto</th>
                      <th className="px-2 py-1.5 text-right">Envases</th><th className="px-2 py-1.5 text-right">Kg Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewBatch.data.slice(0, 100).map((s, i) => (
                      <tr key={s.id + i} className="border-b hover:bg-slate-50">
                        <td className="px-2 py-1 font-mono">{s.nroTramite}</td>
                        <td className="px-2 py-1">{s.fechaTramite?.split('T')[0] || ''}</td>
                        <td className="px-2 py-1 font-mono font-medium">{s.nroCote}</td>
                        <td className="px-2 py-1">{s.paisDestino}</td>
                        <td className="px-2 py-1 max-w-[150px] truncate">{s.denominacionMercaderia}</td>
                        <td className="px-2 py-1 text-right font-mono">{s.cantidadEnvases ?? '-'}</td>
                        <td className="px-2 py-1 text-right font-mono">{s.pesoNeto ? s.pesoNeto.toLocaleString('es-UY') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewBatch.data.length > 100 && (
                  <p className="text-[11px] text-slate-400 text-center py-2">Mostrando 100 de {previewBatch.data.length} registros</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}