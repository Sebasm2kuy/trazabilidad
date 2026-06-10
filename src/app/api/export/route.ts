import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const paisDestino = searchParams.get('paisDestino') || ''
  const producto = searchParams.get('producto') || ''
  const destino = searchParams.get('destino') || ''
  const fechaDesde = searchParams.get('fechaDesde') || ''
  const fechaHasta = searchParams.get('fechaHasta') || ''
  const tipo = searchParams.get('tipo') || ''

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { nroTramite: { contains: search } },
      { nroCote: { contains: search } },
      { nombreEstablecimientoDestino: { contains: search } },
      { denominacionMercaderia: { contains: search } },
    ]
  }
  if (paisDestino) where.paisDestino = paisDestino
  if (producto) where.denominacionMercaderia = producto
  if (destino) where.nombreEstablecimientoDestino = destino
  if (tipo) where.tipo = tipo

  if (fechaDesde || fechaHasta) {
    const dateFilter: Record<string, unknown> = {}
    if (fechaDesde) dateFilter.gte = new Date(fechaDesde)
    if (fechaHasta) {
      const end = new Date(fechaHasta)
      end.setHours(23, 59, 59, 999)
      dateFilter.lte = end
    }
    where.fechaTramite = dateFilter
  }

  const shipments = await db.shipment.findMany({
    where,
    orderBy: { fechaTramite: 'desc' },
  })

  const exportData = shipments.map((s) => ({
    'Nro. Trámite': s.nroTramite,
    'Fecha Trámite': s.fechaTramite ? new Date(s.fechaTramite).toLocaleDateString('es-UY') : '',
    'COTE': s.nroCote,
    'Destino': s.nombreEstablecimientoDestino,
    'País': s.paisDestino,
    'Producto': s.denominacionMercaderia,
    'Corte': s.corte,
    'Envases': s.cantidadEnvases || '',
    'Peso Bruto (kg)': s.pesoBruto ? Math.round(s.pesoBruto) : '',
    'Peso Neto (kg)': s.pesoNeto ? Math.round(s.pesoNeto) : '',
    'Pallets': s.pallets || '',
    'Matrícula Camión': s.matriculaCamion || '',
    'Precinto': s.precinto1 || '',
    'Certificado Sanitario': s.nroCertificadoSanitario || '',
    'Tipo': s.tipo,
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(exportData)

  // Set column widths
  ws['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 30 }, { wch: 18 },
    { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 10 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Envíos')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="envios_trazabilidad.xlsx"',
    },
  })
}