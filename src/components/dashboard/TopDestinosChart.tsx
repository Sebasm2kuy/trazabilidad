'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DestinoData {
  nombreEstablecimientoDestino: string
  pesoTotal: number
}

export function TopDestinosChart({ data }: { data: DestinoData[] | null }) {
  if (!data) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Top Destinos por Peso Neto</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Top Destinos por Peso Neto</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.905 0.03 166)" />
            <XAxis
              dataKey="nombreEstablecimientoDestino"
              tick={{ fontSize: 9, angle: -45, textAnchor: 'end' }}
              interval={0}
              height={80}
            />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}t`} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(1 0 0)',
                border: '1px solid oklch(0.905 0.03 166)',
                borderRadius: '8px',
                fontSize: 12,
              }}
              formatter={(value: number) => [`${Math.round(value).toLocaleString('es-UY')} kg`, 'Peso Neto']}
            />
            <Bar dataKey="pesoTotal" fill="oklch(0.765 0.177 163.223)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}