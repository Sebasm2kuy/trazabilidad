import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q') || ''

  if (!query.trim()) {
    return NextResponse.json({ results: [] })
  }

  // Search by nroTramite or nroCote
  const isNumeric = /^\d+$/.test(query.trim())

  if (isNumeric) {
    const shipments = await db.shipment.findMany({
      where: { nroTramite: parseInt(query.trim()) },
      orderBy: { idLinea: 'asc' },
    })
    if (shipments.length > 0) {
      return NextResponse.json({ results: shipments, searchType: 'tramite' })
    }
  }

  const shipments = await db.shipment.findMany({
    where: { nroCote: { contains: query.trim() } },
    orderBy: { idLinea: 'asc' },
  })

  return NextResponse.json({ results: shipments, searchType: 'cote' })
}