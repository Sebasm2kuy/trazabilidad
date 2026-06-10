'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface CountryData {
  paisDestino: string
  cantidad: number
  pesoTotal: number
}

const COLORS = [
  'oklch(0.596 0.145 163.225)',
  'oklch(0.508 0.118 165.612)',
  'oklch(0.432 0.095 166.913)',
  'oklch(0.765 0.177 163.223)',
  'oklch(0.845 0.143 164.978)',
  'oklch(0.378 0.077 168.94)',
  'oklch(0.646 0.222 41.116)',
  'oklch(0.828 0.189 84.429)',
  'oklch(0.769 0.188 70.08)',
  'oklch(0.6 0.118 184.704)',
]

export function CountryPieChart({ data }: { data: CountryData[] | null }) {
  if (!data) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Distribución por País Destino</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const topCountries = data.slice(0, 8)
  const otherPeso = data.slice(8).reduce((acc, d) => acc + d.pesoTotal, 0)
  const otherCant = data.slice(8).reduce((acc, d) => acc + d.cantidad, 0)
  if (otherPeso > 0) {
    topCountries.push({ paisDestino: 'Otros', cantidad: otherCant, pesoTotal: otherPeso })
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Distribución por País Destino</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={topCountries}
              dataKey="pesoTotal"
              nameKey="paisDestino"
              cx="50%"
              cy="50%"
              outerRadius={110}
              label={({ paisDestino, percent }) =>
                `${paisDestino.length > 12 ? paisDestino.substring(0, 12) + '…' : paisDestino} (${(percent * 100).toFixed(1)}%)`
              }
              labelLine={{ strokeWidth: 1 }}
            >
              {topCountries.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(1 0 0)',
                border: '1px solid oklch(0.905 0.03 166)',
                borderRadius: '8px',
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [
                `${Math.round(value).toLocaleString('es-UY')} kg`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}