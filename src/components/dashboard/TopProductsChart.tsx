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

interface ProductData {
  denominacionMercaderia: string
  totalPeso: number
}

export function TopProductsChart({ data }: { data: ProductData[] | null }) {
  if (!data) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Top 10 Productos por Peso Neto</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const chartData = [...data].reverse()

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Top 10 Productos por Peso Neto</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.905 0.03 166)" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}t`} />
            <YAxis type="category" dataKey="denominacionMercaderia" width={180} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(1 0 0)',
                border: '1px solid oklch(0.905 0.03 166)',
                borderRadius: '8px',
                fontSize: 12,
              }}
              formatter={(value: number) => [`${Math.round(value).toLocaleString('es-UY')} kg`, 'Peso Neto']}
            />
            <Bar dataKey="totalPeso" fill="oklch(0.508 0.118 165.612)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}