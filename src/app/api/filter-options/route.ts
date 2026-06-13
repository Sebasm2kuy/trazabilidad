import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const [paises, productos, destinos] = await Promise.all([
    db.shipment.groupBy({
      by: ['paisDestino'],
      where: { paisDestino: { not: '' } },
      orderBy: { paisDestino: 'asc' },
    }),
    db.shipment.groupBy({
      by: ['denominacionMercaderia'],
      where: { denominacionMercaderia: { not: '' } },
      orderBy: { denominacionMercaderia: 'asc' },
    }),
    db.shipment.groupBy({
      by: ['nombreEstablecimientoDestino'],
      where: { nombreEstablecimientoDestino: { not: '' } },
      orderBy: { nombreEstablecimientoDestino: 'asc' },
    }),
  ])

  return NextResponse.json({
    paises: paises.map((p) => p.paisDestino),
    productos: productos.map((p) => p.denominacionMercaderia),
    destinos: destinos.map((d) => d.nombreEstablecimientoDestino),
  })
}