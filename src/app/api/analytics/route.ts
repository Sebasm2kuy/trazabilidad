import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const [total, pesoNeto, pesoBruto, envases, uniquePais, uniqueProducto, lastDate, byMonth, byProducto, byPais, byDestino, byCorte] = await Promise.all([
    db.shipment.count(),
    db.shipment.aggregate({ _sum: { pesoNeto: true } }),
    db.shipment.aggregate({ _sum: { pesoBruto: true } }),
    db.shipment.aggregate({ _sum: { cantidadEnvases: true } }),
    db.shipment.groupBy({ by: ['paisDestino'], _count: true }),
    db.shipment.groupBy({ by: ['denominacionMercaderia'], _count: true }),
    db.shipment.findFirst({ orderBy: { fechaTramite: 'desc' }, select: { fechaTramite: true } }),
    db.shipment.findMany({
      select: {
        fechaTramite: true,
        pesoNeto: true,
        cantidadEnvases: true,
      },
      orderBy: { fechaTramite: 'asc' },
    }),
    db.shipment.groupBy({
      by: ['denominacionMercaderia'],
      _sum: { pesoNeto: true, cantidadEnvases: true },
      orderBy: { _sum: { pesoNeto: 'desc' } },
    }),
    db.shipment.groupBy({
      by: ['paisDestino'],
      _sum: { pesoNeto: true, cantidadEnvases: true },
      orderBy: { _sum: { pesoNeto: 'desc' } },
    }),
    db.shipment.groupBy({
      by: ['nombreEstablecimientoDestino'],
      _sum: { pesoNeto: true, cantidadEnvases: true },
      orderBy: { _sum: { pesoNeto: 'desc' } },
    }),
    db.shipment.groupBy({
      by: ['corte'],
      _sum: { pesoNeto: true, cantidadEnvases: true, pesoBruto: true },
      orderBy: { _sum: { cantidadEnvases: 'desc' } },
      take: 20,
    }),
  ]);

  // Aggregate by month
  const monthMap = new Map<string, { envios: number; pesoNeto: number; envases: number }>();
  for (const r of byMonth) {
    const key = `${r.fechaTramite.getFullYear()}-${String(r.fechaTramite.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthMap.get(key) || { envios: 0, pesoNeto: 0, envases: 0 };
    existing.envios += 1;
    existing.pesoNeto += r.pesoNeto || 0;
    existing.envases += r.cantidadEnvases || 0;
    monthMap.set(key, existing);
  }
  const monthlyData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({ month, ...vals }));

  return NextResponse.json({
    total,
    pesoNetoTotal: pesoNeto._sum.pesoNeto || 0,
    pesoBrutoTotal: pesoBruto._sum.pesoBruto || 0,
    envasesTotal: envases._sum.cantidadEnvases || 0,
    uniquePaisCount: uniquePais.length,
    uniqueProductoCount: uniqueProducto.length,
    lastDate: lastDate?.fechaTramite || null,
    monthlyData,
    byProducto: byProducto.map(p => ({ producto: p.denominacionMercaderia, pesoNeto: p._sum.pesoNeto || 0, envases: p._sum.cantidadEnvases || 0 })),
    byPais: byPais.map(p => ({ pais: p.paisDestino, pesoNeto: p._sum.pesoNeto || 0, envases: p._sum.cantidadEnvases || 0 })),
    byDestino: byDestino.map(d => ({ destino: d.nombreEstablecimientoDestino, pesoNeto: d._sum.pesoNeto || 0, envases: d._sum.cantidadEnvases || 0 })),
    byCorte: byCorte.map(c => ({ corte: c.corte || 'Sin corte', pesoNeto: c._sum.pesoNeto || 0, pesoBruto: c._sum.pesoBruto || 0, envases: c._sum.cantidadEnvases || 0 })),
  });
}