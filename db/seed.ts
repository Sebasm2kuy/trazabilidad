import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface Row {
  'Nro. Trámite'?: number;
  'Fecha del Trámite'?: string | null;
  'Nro. de C.O.T.E.'?: string | null;
  'Nombre Médico Veterinario'?: string | null;
  'Nombre del Establecimiento Certificador'?: string | null;
  'Nombre Establecimiento Productor'?: string | null;
  'Nro. Establecimiento Productor'?: number | null;
  'Fecha emitido COTE'?: string | null;
  'Temperatura ºC'?: number | null;
  'Tipo de Transporte'?: string | null;
  'Contenedor - Serie y Nro.'?: string | null;
  'Matrícula Camión'?: string | null;
  'Precinto 1'?: string | null;
  'Nombre Establecimiento Destino'?: string | null;
  'Tipo de Movimiento'?: string | null;
  'Observaciones'?: string | null;
  'País de Destino'?: string | null;
  'Baja'?: string | null;
  'Id Linea'?: number | null;
  'Código Envase'?: number | null;
  'Denominación de Mercadería'?: string | null;
  'Corte'?: string | null;
  'Pallets'?: number | null;
  'Cantidad de Envases'?: number | null;
  'Peso Bruto'?: number | null;
  'Peso Neto'?: number | null;
  'Nro. Certificado Sanitario'?: string | null;
  'Shipping'?: string | null;
  'Lote USA - Canadá'?: string | null;
  'Lotes China'?: string | null;
  'Fecha Inicio Faena'?: string | null;
  'Fecha Fin Faena'?: string | null;
  'Fecha Inicio Producción'?: string | null;
  'Fecha Fin de Producción'?: string | null;
  'Fecha Inicio Congelación'?: string | null;
  'Fecha Fin Congelación'?: string | null;
  'Proceso'?: string | null;
}

function parseDate(val: string | null | undefined): Date | null {
  if (!val || val === 'NaT' || val === 'None' || val === '') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function cleanStr(val: string | null | undefined): string | null {
  if (!val || val === 'nan' || val === 'None' || val === '') return null;
  return val.replace(/\n/g, ' ').trim() || null;
}

async function main() {
  const dataPath = path.join(process.cwd(), 'db', 'seed_data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('No se encontró db/seed_data.json');
    process.exit(1);
  }

  const records: Row[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Seeding ${records.length} registros...`);

  await prisma.shipment.deleteMany({});

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const data = batch.map((r) => ({
      nroTramite: r['Nro. Trámite'] || 0,
      fechaTramite: parseDate(r['Fecha del Trámite']) || new Date(),
      nroCote: cleanStr(r['Nro. de C.O.T.E.']) || '',
      nombreMedicoVeterinario: cleanStr(r['Nombre Médico Veterinario']),
      nombreEstablecimientoCertif: cleanStr(r['Nombre del Establecimiento Certificador']),
      nombreEstablecimientoProd: cleanStr(r['Nombre Establecimiento Productor']),
      nroEstablecimientoProd: r['Nro. Establecimiento Productor'] ?? null,
      fechaEmitidoCote: parseDate(r['Fecha emitido COTE']),
      temperaturaC: r['Temperatura ºC'] ?? null,
      tipoTransporte: cleanStr(r['Tipo de Transporte']),
      contenedorSerieNro: cleanStr(r['Contenedor - Serie y Nro.']),
      matriculaCamion: cleanStr(r['Matrícula Camión']),
      precinto1: cleanStr(r['Precinto 1']),
      nombreEstablecimientoDestino: cleanStr(r['Nombre Establecimiento Destino']) || '',
      tipoMovimiento: cleanStr(r['Tipo de Movimiento']),
      observaciones: cleanStr(r['Observaciones']),
      paisDestino: cleanStr(r['País de Destino']) || '',
      baja: cleanStr(r['Baja']),
      idLinea: r['Id Linea'] ?? null,
      codigoEnvase: r['Código Envase'] ?? null,
      denominacionMercaderia: cleanStr(r['Denominación de Mercadería']) || '',
      corte: cleanStr(r['Corte']) || '',
      pallets: r['Pallets'] ?? null,
      cantidadEnvases: r['Cantidad de Envases'] ?? null,
      pesoBruto: r['Peso Bruto'] ?? null,
      pesoNeto: r['Peso Neto'] ?? null,
      nroCertificadoSanitario: cleanStr(r['Nro. Certificado Sanitario']),
      shipping: cleanStr(r['Shipping']),
      loteUsaCanada: cleanStr(r['Lote USA - Canadá']),
      lotesChina: cleanStr(r['Lotes China']),
      fechaInicioFaena: parseDate(r['Fecha Inicio Faena']),
      fechaFinFaena: parseDate(r['Fecha Fin Faena']),
      fechaInicioProduccion: parseDate(r['Fecha Inicio Producción']),
      fechaFinProduccion: parseDate(r['Fecha Fin de Producción']),
      fechaInicioCongelacion: parseDate(r['Fecha Inicio Congelación']),
      fechaFinCongelacion: parseDate(r['Fecha Fin Congelación']),
      proceso: cleanStr(r['Proceso']),
      tipo: 'ingreso',
    }));
    await prisma.shipment.createMany({ data });
    inserted += data.length;
    console.log(`  ${inserted}/${records.length}`);
  }
  console.log(`Listo! ${inserted} registros insertados.`);
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());