'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Weight, Box, Globe, Tag, CalendarDays } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { fetchAnalytics } from '@/lib/staticData';

const COLORS = ['#059669','#10b981','#34d399','#6ee7b7','#a7f3d0','#d1fae5','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];

function fmt(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString('es-UY');
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Dashboard() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchAnalytics().then(d => { setData(d); setLoading(false); }); }, []);

  if (loading || !data) return <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 p-6"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;

  const kpis = [
    { label: 'Total Envíos', value: fmt(data.total as number), icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Peso Neto Total', value: fmt(data.pesoNetoTotal as number) + ' kg', icon: Weight, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Total Envases', value: fmt(data.envasesTotal as number), icon: Box, color: 'text-sky-600', bg: 'bg-sky-50' },
    { label: 'Países Destino', value: String(data.uniquePaisCount), icon: Globe, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Productos Únicos', value: String(data.uniqueProductoCount), icon: Tag, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Último Envío', value: data.lastDate ? fmtDate(data.lastDate as string) : '-', icon: CalendarDays, color: 'text-teal-600', bg: 'bg-teal-50' },
  ];

  const monthlyData = (data.monthlyData as Array<Record<string, number>>).map(m => ({ ...m, month: (m.month as string).substring(5) + '/' + (m.month as string).substring(2, 4) }));
  const topProductos = ((data.byProducto as Array<Record<string, number>>) || []).slice(0, 10);
  const paisData = ((data.byPais as Array<Record<string, number>>) || []).slice(0, 8);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((k) => { const Icon = k.icon; return (
          <Card key={k.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-3 rounded-xl ${k.bg}`}><Icon className={`h-6 w-6 ${k.color}`} /></div>
              <div><p className="text-xs text-slate-500 uppercase tracking-wide">{k.label}</p><p className="text-xl font-bold text-slate-800">{k.value}</p></div>
            </CardContent>
          </Card>
        ); })}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Envíos por Mes</CardTitle></CardHeader><CardContent className="h-72 relative"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="envios" fill="#059669" radius={[4,4,0,0]} name="Envíos" /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Distribución por País</CardTitle></CardHeader><CardContent className="h-72 relative"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paisData} dataKey="pesoNeto" nameKey="pais" cx="50%" cy="50%" outerRadius={100} label={({pais,percent}) => `${(pais as string).substring(0,20)} ${(percent*100).toFixed(0)}%`}>{paisData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Productos por Peso Neto</CardTitle></CardHeader><CardContent className="h-80 relative"><ResponsiveContainer width="100%" height="100%"><BarChart data={topProductos} layout="vertical" margin={{left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>fmt(v as number)} /><YAxis type="category" dataKey="producto" width={200} tick={{fontSize:9}} /><Tooltip formatter={(v:number)=>fmt(v)+' kg'} /><Bar dataKey="pesoNeto" fill="#10b981" radius={[0,4,4,0]} name="Peso Neto (kg)" /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Peso Neto Mensual (kg)</CardTitle></CardHeader><CardContent className="h-80 relative"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" tick={{fontSize:11}} /><YAxis tick={{fontSize:11}} tickFormatter={v=>fmt(v as number)} /><Tooltip formatter={(v:number)=>fmt(v)+' kg'} /><Bar dataKey="pesoNeto" fill="#f59e0b" radius={[4,4,0,0]} name="Peso Neto (kg)" /></BarChart></ResponsiveContainer></CardContent></Card>
      </div>
    </div>
  );
}
