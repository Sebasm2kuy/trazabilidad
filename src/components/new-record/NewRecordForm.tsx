'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileDown, CheckCircle2, RotateCcw, PackagePlus, Ship } from 'lucide-react';
import type { Shipment } from '@/lib/types';

const STORAGE_KEY = 'trazabilidad_new_records';

function loadRecords(): Shipment[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveRecords(records: Shipment[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

const PAISES = [
  'BRASIL','CHINA','CHILE','ARGENTINA','PARAGUAY','URUGUAY','MEXICO',
  'COLOMBIA','PERU','ECUADOR','VENEZUELA','BOLIVIA','ESTADOS UNIDOS',
  'CANADA','UNION EUROPEA','REINO UNIDO','RUSIA','SUDAFRICA','ISRAEL',
  'JAPON','COREA DEL SUR','ARABIA SAUDITA','EMIRATOS ARABES UNIDOS',
  'EGIPTO','MARRUECOS','NIGERIA','ANGOLA','MOZAMBIQUE','TANZANIA',
  'CAMERUN','GHANA','SENEGAL','KENIA','FILIPINAS','VIETNAM','TAILANDIA',
  'INDONESIA','MALASIA','SINGAPUR','AUSTRALIA','NUEVA ZELANDA',
  'LIBANO','JORDANIA','IRAN','TURQUIA','UCRANIA','GEORGIA',
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{children}</label>;
}

function Field({ label, children, colSpan }: { label: string; children: React.ReactNode; colSpan?: number }) {
  return <div className={colSpan ? `col-span-${colSpan}` : ''}><FieldLabel>{label}</FieldLabel>{children}</div>;
}

export default function NewRecordForm() {
  const [tipo, setTipo] = useState<'ingreso' | 'exportacion'>('ingreso');
  const [records, setRecords] = useState<Shipment[]>(() => loadRecords());
  const [saved, setSaved] = useState(false);
  const [showList, setShowList] = useState(false);

  // Common fields
  const [nroTramite, setNroTramite] = useState('');
  const [fechaTramite, setFechaTramite] = useState(new Date().toISOString().split('T')[0]);
  const [nroCote, setNroCote] = useState('');
  const [paisDestino, setPaisDestino] = useState('');
  const [producto, setProducto] = useState('');
  const [corte, setCorte] = useState('');
  const [envases, setEnvases] = useState('');
  const [pesoBruto, setPesoBruto] = useState('');
  const [pesoNeto, setPesoNeto] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [pallets, setPallets] = useState('');

  // Export-only fields
  const [contenedor, setContenedor] = useState('');
  const [precinto, setPrecinto] = useState('');
  const [matricula, setMatricula] = useState('');
  const [transporte, setTransporte] = useState('');
  const [certSanitario, setCertSanitario] = useState('');
  const [estabDestino, setEstabDestino] = useState('');
  const [estabCertif, setEstabCertif] = useState('');
  const [estabProd, setEstabProd] = useState('');
  const [veterinario, setVeterinario] = useState('');
  const [temperatura, setTemperatura] = useState('');

  // Ingreso-only
  const [estabDestinoIng, setEstabDestinoIng] = useState('CALIRAL');

  const resetForm = () => {
    setNroTramite(''); setFechaTramite(new Date().toISOString().split('T')[0]);
    setNroCote(''); setPaisDestino(''); setProducto(''); setCorte('');
    setEnvases(''); setPesoBruto(''); setPesoNeto(''); setObservaciones('');
    setPallets(''); setContenedor(''); setPrecinto(''); setMatricula('');
    setTransporte(''); setCertSanitario(''); setEstabDestino('');
    setEstabCertif(''); setEstabProd(''); setVeterinario('');
    setTemperatura(''); setEstabDestinoIng('CALIRAL');
    setSaved(false);
  };

  const handleSave = () => {
    if (!nroTramite || !nroCote) return;

    const base: Shipment = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nroTramite: parseInt(nroTramite) || 0,
      fechaTramite: fechaTramite ? new Date(fechaTramite + 'T12:00:00').toISOString() : new Date().toISOString(),
      nroCote: nroCote.trim().toUpperCase(),
      paisDestino: paisDestino || (tipo === 'ingreso' ? 'URUGUAY' : ''),
      denominacionMercaderia: producto,
      corte,
      cantidadEnvases: envases ? parseInt(envases) : null,
      pesoBruto: pesoBruto ? parseFloat(pesoBruto) : null,
      pesoNeto: pesoNeto ? parseFloat(pesoNeto) : null,
      pallets: pallets ? parseInt(pallets) : null,
      observaciones: observaciones || null,
      tipo: tipo === 'ingreso' ? 'INGRESO' : 'EXPORTACION',
    };

    if (tipo === 'exportacion') {
      Object.assign(base, {
        contenedorSerieNro: contenedor || null,
        precinto1: precinto || null,
        matriculaCamion: matricula || null,
        tipoTransporte: transporte || null,
        nroCertificadoSanitario: certSanitario || null,
        nombreEstablecimientoDestino: estabDestino || '',
        nombreEstablecimientoCertif: estabCertif || null,
        nombreEstablecimientoProd: estabProd || null,
        nombreMedicoVeterinario: veterinario || null,
        temperaturaC: temperatura ? parseFloat(temperatura) : null,
      });
    } else {
      Object.assign(base, {
        nombreEstablecimientoDestino: estabDestinoIng || 'CALIRAL',
      });
    }

    const updated = [base, ...records];
    setRecords(updated);
    saveRecords(updated);
    setSaved(true);
    setTimeout(() => resetForm(), 1200);
  };

  const handleDelete = (id: string) => {
    const updated = records.filter(r => r.id !== id);
    setRecords(updated);
    saveRecords(updated);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `registros_nuevos_${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleExportXLSX = async () => {
    const XLSX = await import('xlsx');
    const rows = records.map(r => ({
      'Tipo': r.tipo, 'Trámite': r.nroTramite, 'Fecha': r.fechaTramite?.split('T')[0] || '',
      'COTE': r.nroCote, 'País': r.paisDestino, 'Destino': r.nombreEstablecimientoDestino,
      'Producto': r.denominacionMercaderia, 'Corte': r.corte, 'Envases': r.cantidadEnvases,
      'Peso Bruto': r.pesoBruto, 'Peso Neto': r.pesoNeto, 'Pallets': r.pallets,
      'Contenedor': r.contenedorSerieNro || '', 'Precinto': r.precinto1 || '',
      'Transporte': r.tipoTransporte || '', 'Cert. Sanitario': r.nroCertificadoSanitario || '',
      'Observaciones': r.observaciones || '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Nuevos Registros');
    XLSX.writeFile(wb, `registros_nuevos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const isIngreso = tipo === 'ingreso';

  return (
    <div className="p-6 space-y-4 max-w-[1100px]">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Nuevo Registro</h2>
        <div className="flex gap-2">
          {records.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowList(!showList)}>
                {showList ? 'Ocultar' : 'Ver'} guardados ({records.length})
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportXLSX}>
                <FileDown className="h-4 w-4 mr-1" />Exportar XLSX
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJSON}>
                <FileDown className="h-4 w-4 mr-1" />Exportar JSON
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Saved records list */}
      {showList && records.length > 0 && (
        <Card><CardContent className="p-0">
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b text-left text-xs text-slate-500 uppercase">
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Trámite</th>
                  <th className="px-3 py-2">COTE</th>
                  <th className="px-3 py-2">País</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Envases</th>
                  <th className="px-3 py-2 text-right">Kg Neto</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.tipo === 'INGRESO' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                        {r.tipo === 'INGRESO' ? 'Ingreso' : 'Export.'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono">{r.nroTramite}</td>
                    <td className="px-3 py-2 text-xs font-mono font-medium">{r.nroCote}</td>
                    <td className="px-3 py-2 text-xs">{r.paisDestino}</td>
                    <td className="px-3 py-2 text-xs max-w-[150px] truncate">{r.denominacionMercaderia}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{r.cantidadEnvases ?? '-'}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{r.pesoNeto ? r.pesoNeto.toLocaleString('es-UY') : '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 text-xs">X</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      )}

      {/* Type selector */}
      <Card><CardContent className="p-4">
        <div className="flex gap-2">
          <Button
            variant={isIngreso ? 'default' : 'outline'}
            className={isIngreso ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            onClick={() => setTipo('ingreso')}
          >
            <PackagePlus className="h-4 w-4 mr-2" />Ingreso (Depósito)
          </Button>
          <Button
            variant={!isIngreso ? 'default' : 'outline'}
            className={!isIngreso ? 'bg-blue-600 hover:bg-blue-700' : ''}
            onClick={() => setTipo('exportacion')}
          >
            <Ship className="h-4 w-4 mr-2" />Exportación
          </Button>
        </div>
      </CardContent></Card>

      {/* Form */}
      <Card><CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {isIngreso ? <PackagePlus className="h-4 w-4 text-emerald-600" /> : <Ship className="h-4 w-4 text-blue-600" />}
          {isIngreso ? 'Datos del Ingreso' : 'Datos de la Exportación'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {saved && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Registro guardado correctamente
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Row 1: Core fields */}
          <Field label="Nro. Trámite *">
            <Input type="number" placeholder="Ej: 250123456789" value={nroTramite} onChange={e => setNroTramite(e.target.value)} />
          </Field>
          <Field label="Fecha de Trámite">
            <Input type="date" value={fechaTramite} onChange={e => setFechaTramite(e.target.value)} />
          </Field>
          <Field label="COTE *">
            <Input placeholder="Ej: P12345 o DDI100" value={nroCote} onChange={e => setNroCote(e.target.value.toUpperCase())} className="font-mono" />
          </Field>

          {/* Row 2: Product details */}
          <Field label="País Destino">
            {isIngreso ? (
              <Input value="URUGUAY" disabled className="bg-slate-100" />
            ) : (
              <Select value={paisDestino} onValueChange={setPaisDestino}>
                <SelectTrigger><SelectValue placeholder="Seleccionar país" /></SelectTrigger>
                <SelectContent>{PAISES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Establecimiento Destino">
            {isIngreso ? (
              <Input placeholder="Ej: CALIRAL" value={estabDestinoIng} onChange={e => setEstabDestinoIng(e.target.value.toUpperCase())} />
            ) : (
              <Input placeholder="Nombre del destino" value={estabDestino} onChange={e => setEstabDestino(e.target.value)} />
            )}
          </Field>
          <Field label="Producto / Denominación">
            <Input placeholder="Ej: Carne bovina" value={producto} onChange={e => setProducto(e.target.value)} />
          </Field>

          {/* Row 3: Cut and quantities */}
          <Field label="Corte">
            <Input placeholder="Ej: Trozos, Medallones" value={corte} onChange={e => setCorte(e.target.value)} />
          </Field>
          <Field label="Envases (Cajas)">
            <Input type="number" placeholder="0" value={envases} onChange={e => setEnvases(e.target.value)} />
          </Field>
          <Field label="Pallets">
            <Input type="number" placeholder="0" value={pallets} onChange={e => setPallets(e.target.value)} />
          </Field>

          {/* Row 4: Weights */}
          <Field label="Peso Bruto (kg)">
            <Input type="number" step="0.01" placeholder="0.00" value={pesoBruto} onChange={e => setPesoBruto(e.target.value)} />
          </Field>
          <Field label="Peso Neto (kg)">
            <Input type="number" step="0.01" placeholder="0.00" value={pesoNeto} onChange={e => setPesoNeto(e.target.value)} />
          </Field>
        </div>

        {/* Export-only fields */}
        {!isIngreso && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-3">Datos de Embarque (Exportación)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Contenedor Serie Nro">
                <Input placeholder="Ej: TRLU1234567" value={contenedor} onChange={e => setContenedor(e.target.value.toUpperCase())} className="font-mono" />
              </Field>
              <Field label="Precinto">
                <Input placeholder="Nro. de precinto" value={precinto} onChange={e => setPrecinto(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Matrícula Camión">
                <Input placeholder="Ej: ABC 1234" value={matricula} onChange={e => setMatricula(e.target.value.toUpperCase())} className="font-mono" />
              </Field>
              <Field label="Tipo de Transporte">
                <Select value={transporte} onValueChange={setTransporte}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARITIMO">Marítimo</SelectItem>
                    <SelectItem value="TERRESTRE">Terrestre</SelectItem>
                    <SelectItem value="AEREO">Aéreo</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Cert. Sanitario">
                <Input placeholder="Nro. certificado" value={certSanitario} onChange={e => setCertSanitario(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Temperatura (°C)">
                <Input type="number" step="0.1" placeholder="-18" value={temperatura} onChange={e => setTemperatura(e.target.value)} />
              </Field>
              <Field label="Estab. Certificador">
                <Input placeholder="Nombre" value={estabCertif} onChange={e => setEstabCertif(e.target.value)} />
              </Field>
              <Field label="Estab. Productor">
                <Input placeholder="Nombre" value={estabProd} onChange={e => setEstabProd(e.target.value)} />
              </Field>
              <Field label="Veterinario">
                <Input placeholder="Nombre" value={veterinario} onChange={e => setVeterinario(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {/* Observaciones */}
        <div className="mt-4">
          <FieldLabel>Observaciones</FieldLabel>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Observaciones adicionales..."
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 pt-4 border-t">
          <Button onClick={handleSave} disabled={!nroTramite || !nroCote}>
            <Plus className="h-4 w-4 mr-2" />
            {isIngreso ? 'Guardar Ingreso' : 'Guardar Exportación'}
          </Button>
          <Button variant="outline" onClick={resetForm}>
            <RotateCcw className="h-4 w-4 mr-2" />Limpiar
          </Button>
        </div>

        <p className="text-[11px] text-slate-400 mt-3">
          Los registros se guardan localmente en el navegador. Para incorporarlos a los datos principales, usá la pestaña "Importar / Exportar".
        </p>
      </CardContent></Card>
    </div>
  );
}