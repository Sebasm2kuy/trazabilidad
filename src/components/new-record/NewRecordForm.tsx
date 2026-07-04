'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileDown, CheckCircle2, RotateCcw, PackagePlus, Ship } from 'lucide-react';
import type { Shipment, ExpRecord } from '@/lib/types';
import { toast } from 'sonner';
import { schedulePush } from '@/lib/googleSheets';
import { readStorageJson, STORAGE_KEYS, writeStorageJson } from '@/lib/dataRepository';

// Deposit new records key (matches ShipmentTable)
const DEP_NEW_KEY = STORAGE_KEYS.depNew;
// Export new records key (matches ExportacionesTable)
const EXP_NEW_KEY = STORAGE_KEYS.expNew;

function loadDepRecords(): Shipment[] {
  return readStorageJson<Shipment[]>(DEP_NEW_KEY, []);
}
function loadExpRecords(): ExpRecord[] {
  return readStorageJson<ExpRecord[]>(EXP_NEW_KEY, []);
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export default function NewRecordForm() {
  const [tipo, setTipo] = useState<'ingreso' | 'exportacion'>('ingreso');
  const isIngreso = tipo === 'ingreso';

  const [nroTramite, setNroTramite] = useState('');
  const [fechaTramite, setFechaTramite] = useState('');
  const [nroCote, setNroCote] = useState('');
  const [paisDestino, setPaisDestino] = useState('');
  const [estabDestino, setEstabDestino] = useState('');
  const [estabDestinoIng, setEstabDestinoIng] = useState('');
  const [producto, setProducto] = useState('');
  const [corte, setCorte] = useState('');
  const [envases, setEnvases] = useState('');
  const [pallets, setPallets] = useState('');
  const [pesoBruto, setPesoBruto] = useState('');
  const [pesoNeto, setPesoNeto] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Export-only
  const [contenedor, setContenedor] = useState('');
  const [precinto, setPrecinto] = useState('');
  const [matricula, setMatricula] = useState('');
  const [transporte, setTransporte] = useState('');
  const [certSanitario, setCertSanitario] = useState('');
  const [estabCertif, setEstabCertif] = useState('');
  const [estabProd, setEstabProd] = useState('');
  const [veterinario, setVeterinario] = useState('');
  const [temperatura, setTemperatura] = useState('');

  const [saved, setSaved] = useState(false);
  const [depCount, setDepCount] = useState(0);
  const [expCount, setExpCount] = useState(0);

  // Load counts on mount
  useEffect(() => {
    setDepCount(loadDepRecords().length);
    setExpCount(loadExpRecords().length);
  }, []);

  const resetForm = () => {
    setNroTramite(''); setFechaTramite(''); setNroCote('');
    setPaisDestino(''); setEstabDestino(''); setEstabDestinoIng('');
    setProducto(''); setCorte(''); setEnvases(''); setPallets('');
    setPesoBruto(''); setPesoNeto(''); setObservaciones('');
    setContenedor(''); setPrecinto(''); setMatricula('');
    setTransporte(''); setCertSanitario(''); setEstabCertif('');
    setEstabProd(''); setVeterinario(''); setTemperatura('');
  };

  const handleSave = () => {
    if (!nroTramite || !nroCote) {
      toast.error('Nro. Trámite y COTE son obligatorios');
      return;
    }

    const id = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (isIngreso) {
      // Save to Depositos new records (ShipmentTable reads this)
      const record: Shipment = {
        id,
        nroTramite: parseInt(nroTramite) || 0,
        fechaTramite: fechaTramite ? new Date(fechaTramite + 'T12:00:00').toISOString() : new Date().toISOString(),
        nroCote: nroCote.trim().toUpperCase(),
        paisDestino: 'URUGUAY',
        denominacionMercaderia: producto,
        corte,
        cantidadEnvases: envases ? parseInt(envases) : null,
        pesoBruto: pesoBruto ? parseFloat(pesoBruto) : null,
        pesoNeto: pesoNeto ? parseFloat(pesoNeto) : null,
        pallets: pallets ? parseInt(pallets) : null,
        observaciones: observaciones || null,
        tipo: 'INGRESO',
        nombreEstablecimientoDestino: estabDestinoIng || 'CALIRAL',
      };
      const existing = loadDepRecords();
      const updated = [record, ...existing];
      writeStorageJson(DEP_NEW_KEY, updated);
      setDepCount(updated.length);
      toast.success(`Ingreso ${nroCote} guardado — visible en A Depósitos`);
    } else {
      // Save to Exportaciones new records (ExportacionesTable reads this)
      const record: ExpRecord = {
        id,
        nroTramite: parseInt(nroTramite) || 0,
        fechaTramite: fechaTramite ? new Date(fechaTramite + 'T12:00:00').toISOString() : new Date().toISOString(),
        nroCote: nroCote.trim().toUpperCase(),
        paisDestino: paisDestino,
        denominacionMercaderia: producto,
        corte,
        cantidadEnvases: envases ? parseInt(envases) : null,
        pesoBruto: pesoBruto ? parseFloat(pesoBruto) : null,
        pesoNeto: pesoNeto ? parseFloat(pesoNeto) : null,
        pallets: pallets ? parseInt(pallets) : null,
        observaciones: observaciones || null,
        tipo: 'EXPORTACION',
        nombreEstablecimientoDestino: estabDestino || '',
        contenedorSerieNro: contenedor || null,
        precinto1: precinto || null,
        matriculaCamion: matricula || null,
        tipoTransporte: transporte || null,
        nroCertificadoSanitario: certSanitario || null,
        nombreEstablecimientoCertif: estabCertif || null,
        nombreEstablecimientoProd: estabProd || null,
        nombreMedicoVeterinario: veterinario || null,
        temperaturaC: temperatura ? parseFloat(temperatura) : null,
      };
      const existing = loadExpRecords();
      const updated = [record, ...existing];
      writeStorageJson(EXP_NEW_KEY, updated);
      setExpCount(updated.length);
      toast.success(`Exportación ${nroCote} guardada — visible en Exportaciones`);
    }

    schedulePush();
    setSaved(true);
    setTimeout(() => { setSaved(false); resetForm(); }, 1500);
  };

  const handleExportXLSX = async () => {
    const XLSX = await import('xlsx');
    const depRecs = loadDepRecords();
    const expRecs = loadExpRecords();
    const allRecs = [...depRecs, ...expRecs];
    if (allRecs.length === 0) { toast.error('No hay registros para exportar'); return; }
    const rows = allRecs.map(r => ({
      'Tipo': r.tipo, 'Trámite': r.nroTramite, 'Fecha': r.fechaTramite?.split('T')[0] || '',
      'COTE': r.nroCote, 'País': r.paisDestino, 'Destino': r.nombreEstablecimientoDestino,
      'Producto': r.denominacionMercaderia, 'Corte': r.corte, 'Envases': r.cantidadEnvases,
      'Peso Bruto': r.pesoBruto, 'Peso Neto': r.pesoNeto, 'Pallets': r.pallets,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registros');
    XLSX.writeFile(wb, `registros_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleClearAll = () => {
    if (!confirm('¿Borrar todos los registros creados? (no afecta los datos importados)')) return;
    localStorage.removeItem(DEP_NEW_KEY);
    localStorage.removeItem(EXP_NEW_KEY);
    setDepCount(0);
    setExpCount(0);
    toast.success('Todos los registros nuevos fueron eliminados');
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[900px] mx-auto">
      {/* Header */}
      <Card><CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-100">
              <Plus className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Nuevo Registro</h2>
              <p className="text-xs text-slate-500">Crear ingresos o exportaciones manualmente</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-medium">{depCount} ingresos</span>
            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">{expCount} export.</span>
            <Button variant="outline" size="sm" onClick={handleExportXLSX} className="h-7 text-xs">
              <FileDown className="h-3 w-3 mr-1" />Exportar
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearAll} className="h-7 text-xs text-red-600 hover:text-red-700">
              <RotateCcw className="h-3 w-3 mr-1" />Limpiar
            </Button>
          </div>
        </div>
      </CardContent></Card>

      {/* Type selector */}
      <Card><CardContent className="p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tipo de Registro</p>
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
            <CheckCircle2 className="h-4 w-4" /> Registro guardado — {isIngreso ? 'visible en A Depósitos' : 'visible en Exportaciones'}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Nro. Trámite *">
            <Input type="number" placeholder="Ej: 250123456789" value={nroTramite} onChange={e => setNroTramite(e.target.value)} />
          </Field>
          <Field label="Fecha de Trámite">
            <Input type="date" value={fechaTramite} onChange={e => setFechaTramite(e.target.value)} />
          </Field>
          <Field label="COTE *">
            <Input placeholder="Ej: P12345 o DDI100" value={nroCote} onChange={e => setNroCote(e.target.value.toUpperCase())} className="font-mono" />
          </Field>

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

          <Field label="Corte">
            <Input placeholder="Ej: Trozos, Medallones" value={corte} onChange={e => setCorte(e.target.value)} />
          </Field>
          <Field label="Envases (Cajas)">
            <Input type="number" placeholder="0" value={envases} onChange={e => setEnvases(e.target.value)} />
          </Field>
          <Field label="Pallets">
            <Input type="number" placeholder="0" value={pallets} onChange={e => setPallets(e.target.value)} />
          </Field>

          <Field label="Peso Bruto (kg)">
            <Input type="number" step="0.01" placeholder="0.00" value={pesoBruto} onChange={e => setPesoBruto(e.target.value)} />
          </Field>
          <Field label="Peso Neto (kg)">
            <Input type="number" step="0.01" placeholder="0.00" value={pesoNeto} onChange={e => setPesoNeto(e.target.value)} />
          </Field>
          <Field label="Observaciones">
            <Input placeholder="COTEs de ingreso, notas..." value={observaciones} onChange={e => setObservaciones(e.target.value)} className="font-mono" />
          </Field>
        </div>

        {/* Export-only fields */}
        {!isIngreso && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-3">Datos de Embarque</p>
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
              <Field label="Certificado Sanitario">
                <Input placeholder="Nro." value={certSanitario} onChange={e => setCertSanitario(e.target.value)} />
              </Field>
              <Field label="Establecimiento Certificador">
                <Input placeholder="Nombre" value={estabCertif} onChange={e => setEstabCertif(e.target.value)} />
              </Field>
              <Field label="Establecimiento Productor">
                <Input placeholder="Nombre" value={estabProd} onChange={e => setEstabProd(e.target.value)} />
              </Field>
              <Field label="Médico Veterinario">
                <Input placeholder="Nombre" value={veterinario} onChange={e => setVeterinario(e.target.value)} />
              </Field>
              <Field label="Temperatura (°C)">
                <Input type="number" step="0.1" placeholder="0.0" value={temperatura} onChange={e => setTemperatura(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleSave} className={isIngreso ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}>
            <Plus className="h-4 w-4 mr-2" />
            {isIngreso ? 'Guardar Ingreso' : 'Guardar Exportación'}
          </Button>
          <Button variant="outline" onClick={resetForm}>Limpiar formulario</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}
