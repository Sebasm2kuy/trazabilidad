import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 });

  if (rows.length < 17) return NextResponse.json({ error: 'Archivo sin datos suficientes' }, { status: 400 });

  const headers = rows[14] as string[];
  const dataRows = rows.slice(15).filter(r => r[0] && r[0] !== 'Nro. Trámite');

  function parseDate(val: unknown): Date | null {
    if (!val) return null;
    if (typeof val === 'number') {
      const d = XLSX.SSF.parse_date_code(val);
      return d ? new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0) : null;
    }
    const d = new Date(String(val));
    return isNaN(d.getTime()) ? null : d;
  }

  function cleanStr(val: unknown): string | null {
    if (!val) return null;
    const s = String(val).replace(/\n/g, ' ').trim();
    return s === '' || s === 'nan' ? null : s;
  }

  function findCol(headerName: string): number {
    return headers.findIndex(h => String(h).trim() === headerName);
  }

  const colMap: Record<string, number> = {
    nroTramite: findCol('Nro. Trámite'),
    fechaTramite: findCol('Fecha del Trámite'),
    nroCote: findCol('Nro. de C.O.T.E.'),
    medicoVet: findCol('Nombre Médico Veterinario'),
    estabCertif: findCol('Nombre del Establecimiento Certificador'),
    estabProd: findCol('Nombre Establecimiento Productor'),
    nroEstabProd: findCol('Nro. Establecimiento Productor'),
    fechaCote: findCol('Fecha emitido COTE'),
    temperatura: findCol('Temperatura ºC'),
    tipoTransporte: findCol('Tipo de Transporte'),
    contenedor: findCol('Contenedor - Serie y Nro.'),
    matricula: findCol('Matrícula Camión'),
    precinto1: findCol('Precinto 1'),
    destino: findCol('Nombre Establecimiento Destino'),
    tipoMov: findCol('Tipo de Movimiento'),
    observaciones: findCol('Observaciones'),
    paisDestino: findCol('País de Destino'),
    baja: findCol('Baja'),
    idLinea: findCol('Id Linea'),
    codEnvase: findCol('Código Envase'),
    denominacion: findCol('Denominación de Mercadería'),
    corte: findCol('Corte'),
    pallets: findCol('Pallets'),
    cantEnvases: findCol('Cantidad de Envases'),
    pesoBruto: findCol('Peso Bruto'),
    pesoNeto: findCol('Peso Neto'),
    certSanitario: findCol('Nro. Certificado Sanitario'),
    shipping: findCol('Shipping'),
    loteUSA: findCol('Lote USA - Canadá'),
    lotesChina: findCol('Lotes China'),
    fechaInicioFaena: findCol('Fecha Inicio Faena'),
    fechaFinFaena: findCol('Fecha Fin Faena'),
    fechaInicioProd: findCol('Fecha Inicio Producción'),
    fechaFinProd: findCol('Fecha Fin de Producción'),
    fechaInicioCong: findCol('Fecha Inicio Congelación'),
    fechaFinCong: findCol('Fecha Fin Congelación'),
    proceso: findCol('Proceso'),
  };

  const records = dataRows.map(row => {
    const g = (key: string) => colMap[key] >= 0 ? row[colMap[key]] : null;
    return {
      nroTramite: Number(g('nroTramite')) || 0,
      fechaTramite: parseDate(g('fechaTramite')) || new Date(),
      nroCote: cleanStr(g('nroCote')) || '',
      nombreMedicoVeterinario: cleanStr(g('medicoVet')),
      nombreEstablecimientoCertif: cleanStr(g('estabCertif')),
      nombreEstablecimientoProd: cleanStr(g('estabProd')),
      nroEstablecimientoProd: Number(g('nroEstabProd')) || null,
      fechaEmitidoCote: parseDate(g('fechaCote')),
      temperaturaC: Number(g('temperatura')) || null,
      tipoTransporte: cleanStr(g('tipoTransporte')),
      contenedorSerieNro: cleanStr(g('contenedor')),
      matriculaCamion: cleanStr(g('matricula')),
      precinto1: cleanStr(g('precinto1')),
      nombreEstablecimientoDestino: cleanStr(g('destino')) || '',
      tipoMovimiento: cleanStr(g('tipoMov')),
      observaciones: cleanStr(g('observaciones')),
      paisDestino: cleanStr(g('paisDestino')) || '',
      baja: cleanStr(g('baja')),
      idLinea: Number(g('idLinea')) || null,
      codigoEnvase: Number(g('codEnvase')) || null,
      denominacionMercaderia: cleanStr(g('denominacion')) || '',
      corte: cleanStr(g('corte')) || '',
      pallets: Number(g('pallets')) || null,
      cantidadEnvases: Number(g('cantEnvases')) || null,
      pesoBruto: Number(g('pesoBruto')) || null,
      pesoNeto: Number(g('pesoNeto')) || null,
      nroCertificadoSanitario: cleanStr(g('certSanitario')),
      shipping: cleanStr(g('shipping')),
      loteUsaCanada: cleanStr(g('loteUSA')),
      lotesChina: cleanStr(g('lotesChina')),
      fechaInicioFaena: parseDate(g('fechaInicioFaena')),
      fechaFinFaena: parseDate(g('fechaFinFaena')),
      fechaInicioProduccion: parseDate(g('fechaInicioProd')),
      fechaFinProduccion: parseDate(g('fechaFinProd')),
      fechaInicioCongelacion: parseDate(g('fechaInicioCong')),
      fechaFinCongelacion: parseDate(g('fechaFinCong')),
      proceso: cleanStr(g('proceso')),
      tipo: 'ingreso',
    };
  });

  // Return preview first
  return NextResponse.json({
    preview: records.slice(0, 10),
    total: records.length,
    records,
  });
}