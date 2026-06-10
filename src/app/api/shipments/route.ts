import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
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
      { matriculaCamion: { contains: search } },
      { precinto1: { contains: search } },
    ];
  }
  if (pais) where.paisDestino = { contains: pais };
  if (producto) where.denominacionMercaderia = { contains: producto };
  if (destino) where.nombreEstablecimientoDestino = { contains: destino };
  if (tipo) where.tipo = tipo;
  if (fechaDesde || fechaHasta) {
    const fechaFilter: Record<string, unknown> = {};
    if (fechaDesde) fechaFilter.gte = new Date(fechaDesde);
    if (fechaHasta) fechaFilter.lte = new Date(fechaHasta + 'T23:59:59');
    where.fechaTramite = fechaFilter;
  }

  const [data, total] = await Promise.all([
    db.shipment.findMany({
      where,
      orderBy: { fechaTramite: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.shipment.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const shipment = await db.shipment.create({
    data: {
      nroTramite: body.nroTramite || 0,
      fechaTramite: body.fechaTramite ? new Date(body.fechaTramite) : new Date(),
      nroCote: body.nroCote || '',
      nombreMedicoVeterinario: body.nombreMedicoVeterinario || null,
      nombreEstablecimientoCertif: body.nombreEstablecimientoCertif || null,
      nombreEstablecimientoProd: body.nombreEstablecimientoProd || null,
      nroEstablecimientoProd: body.nroEstablecimientoProd || null,
      fechaEmitidoCote: body.fechaEmitidoCote ? new Date(body.fechaEmitidoCote) : null,
      temperaturaC: body.temperaturaC || null,
      tipoTransporte: body.tipoTransporte || null,
      contenedorSerieNro: body.contenedorSerieNro || null,
      matriculaCamion: body.matriculaCamion || null,
      precinto1: body.precinto1 || null,
      nombreEstablecimientoDestino: body.nombreEstablecimientoDestino || '',
      tipoMovimiento: body.tipoMovimiento || null,
      observaciones: body.observaciones || null,
      paisDestino: body.paisDestino || '',
      baja: body.baja || null,
      idLinea: body.idLinea || null,
      codigoEnvase: body.codigoEnvase || null,
      denominacionMercaderia: body.denominacionMercaderia || '',
      corte: body.corte || '',
      pallets: body.pallets || null,
      cantidadEnvases: body.cantidadEnvases || null,
      pesoBruto: body.pesoBruto || null,
      pesoNeto: body.pesoNeto || null,
      nroCertificadoSanitario: body.nroCertificadoSanitario || null,
      shipping: body.shipping || null,
      loteUsaCanada: body.loteUsaCanada || null,
      lotesChina: body.lotesChina || null,
      fechaInicioFaena: body.fechaInicioFaena ? new Date(body.fechaInicioFaena) : null,
      fechaFinFaena: body.fechaFinFaena ? new Date(body.fechaFinFaena) : null,
      fechaInicioProduccion: body.fechaInicioProduccion ? new Date(body.fechaInicioProduccion) : null,
      fechaFinProduccion: body.fechaFinProduccion ? new Date(body.fechaFinProduccion) : null,
      fechaInicioCongelacion: body.fechaInicioCongelacion ? new Date(body.fechaInicioCongelacion) : null,
      fechaFinCongelacion: body.fechaFinCongelacion ? new Date(body.fechaFinCongelacion) : null,
      proceso: body.proceso || null,
      tipo: body.tipo || 'ingreso',
    },
  });

  return NextResponse.json(shipment, { status: 201 });
}