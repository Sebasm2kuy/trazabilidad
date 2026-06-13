import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const search = url.searchParams.get('search') || '';
  const pais = url.searchParams.get('pais') || '';
  const producto = url.searchParams.get('producto') || '';
  const destino = url.searchParams.get('destino') || '';
  const tipo = url.searchParams.get('tipo') || '';
  const fechaDesde = url.searchParams.get('fechaDesde') || '';
  const fechaHasta = url.searchParams.get('fechaHasta') || '';

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { nroTramite: { equals: isNaN(Number(search)) ? 0 : Number(search) } },
      { nroCote: { contains: search } },
      { nombreEstablecimientoDestino: { contains: search } },
      { denominacionMercaderia: { contains: search } },
    ];
  }
  if (pais) where.paisDestino = { contains: pais };
  if (producto) where.denominacionMercaderia = { contains: producto };
  if (destino) where.nombreEstablecimientoDestino = { contains: destino };
  if (tipo) where.tipo = tipo;
  if (fechaDesde || fechaHasta) {
    const f: Record<string, unknown> = {};
    if (fechaDesde) f.gte = new Date(fechaDesde);
    if (fechaHasta) f.lte = new Date(fechaHasta + 'T23:59:59');
    where.fechaTramite = f;
  }

  const shipments = await db.shipment.findMany({
    where,
    orderBy: { fechaTramite: 'desc' },
    select: {
      nroTramite: true, fechaTramite: true, nroCote: true,
      nombreEstablecimientoDestino: true, paisDestino: true,
      denominacionMercaderia: true, corte: true, cantidadEnvases: true,
      pesoBruto: true, pesoNeto: true, tipo: true, matriculaCamion: true,
      precinto1: true, tipoTransporte: true,
    },
  });

  const data = shipments.map(s => ({
    'Nro. Trámite': s.nroTramite,
    'Fecha Trámite': s.fechaTramite.toISOString().split('T')[0],
    'Nro. COTE': s.nroCote,
    'Destino': s.nombreEstablecimientoDestino,
    'País Destino': s.paisDestino,
    'Producto': s.denominacionMercaderia,
    'Corte': s.corte,
    'Envases': s.cantidadEnvases,
    'Peso Bruto (kg)': s.pesoBruto,
    'Peso Neto (kg)': s.pesoNeto,
    'Transporte': s.tipoTransporte,
    'Matrícula': s.matriculaCamion,
    'Precinto': s.precinto1,
    'Tipo': s.tipo,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Envíos');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="trazabilidad_export_${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  });
}