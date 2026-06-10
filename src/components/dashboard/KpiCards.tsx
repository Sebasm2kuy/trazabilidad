'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Weight, Box, Globe, Beef, CalendarDays } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Kpis {
  total: number
  totalPesoNeto: number
  totalEnvases: number
  paisesCount: number
  productosCount: number
  lastShipmentDate: string | null
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('es-UY')
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function KpiCards({ data }: { data: Kpis | null }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const cards = [
    { label: 'Total Envíos', value: formatNumber(data.total), icon: Package, color: 'text-emerald-600' },
    { label: 'Peso Neto (kg)', value: formatNumber(data.totalPesoNeto), icon: Weight, color: 'text-emerald-700' },
    { label: 'Total Envases', value: formatNumber(data.totalEnvases), icon: Box, color: 'text-emerald-500' },
    { label: 'Países Destino', value: formatNumber(data.paisesCount), icon: Globe, color: 'text-emerald-800' },
    { label: 'Productos Únicos', value: formatNumber(data.productosCount), icon: Beef, color: 'text-emerald-600' },
    { label: 'Último Envío', value: formatDate(data.lastShipmentDate), icon: CalendarDays, color: 'text-emerald-700' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="bg-card border-border hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {c.label}
            </CardTitle>
            <c.icon className={`h-4 w-4 ${c.color}`} />
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-lg font-bold text-foreground">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}