'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, ComposedChart, AreaChart, Area } from 'recharts';
import { fetchAnalytics } from '@/lib/staticData';

function fmt(n: number) { if(n>=1000000) return (n/1000000).toFixed(1)+'M'; if(n>=1000) return (n/1000).toFixed(1)+'K'; return Math.round(n).toLocaleString('es-UY'); }

export default function AnalyticsCharts() {
  const [data, setData] = useState<Record<string,unknown>|null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchAnalytics().then(d => { setData(d); setLoading(false); }); }, []);
  if (loading||!data) return <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6"><Skeleton className="h-80"/><Skeleton className="h-80"/></div>;

  const md = ((data.monthlyData as Array<Record<string,number>>) || []).map(m=>({...m, label:(m.month as string).substring(5)+'/'+(m.month as string).substring(2,4)}));
  const bp = ((data.byProducto as Array<Record<string,number>>)||[]).slice(0,12);
  const bc = ((data.byCorte as Array<Record<string,number>>)||[]).slice(0,15);
  const bd = ((data.byDestino as Array<Record<string,number>>)||[]).slice(0,8);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <h2 className="text-2xl font-bold text-slate-800">Analíticas</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Evolución Mensual Peso Neto</CardTitle></CardHeader><CardContent className="h-80 relative"><ResponsiveContainer width="100%" height={280}><LineChart data={md}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>fmt(v as number)}/><Tooltip formatter={(v:number)=>fmt(v)+' kg'}/><Line type="monotone" dataKey="pesoNeto" stroke="#059669" strokeWidth={2} dot={{r:3}} name="Peso Neto"/></LineChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Evolución Mensual Envases</CardTitle></CardHeader><CardContent className="h-80 relative"><ResponsiveContainer width="100%" height={280}><AreaChart data={md}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>fmt(v as number)}/><Tooltip formatter={(v:number)=>fmt(v)}/><Area type="monotone" dataKey="envases" fill="#10b98133" stroke="#10b981" strokeWidth={2} name="Envases"/></AreaChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Distribución por Producto</CardTitle></CardHeader><CardContent className="h-80 relative"><ResponsiveContainer width="100%" height={280}><BarChart data={bp} layout="vertical" margin={{left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>fmt(v as number)}/><YAxis type="category" dataKey="producto" width={200} tick={{fontSize:9}}/><Tooltip formatter={(v:number)=>fmt(v)+' kg'}/><Bar dataKey="pesoNeto" fill="#059669" radius={[0,4,4,0]} name="Peso Neto (kg)"/></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Top Cortes por Envases</CardTitle></CardHeader><CardContent className="h-80 relative"><ResponsiveContainer width="100%" height={280}><BarChart data={bc} layout="vertical" margin={{left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>fmt(v as number)}/><YAxis type="category" dataKey="corte" width={140} tick={{fontSize:9}}/><Tooltip/><Bar dataKey="envases" fill="#f59e0b" radius={[0,4,4,0]} name="Envases"/></BarChart></ResponsiveContainer></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">Peso Bruto vs Peso Neto Mensual</CardTitle></CardHeader><CardContent className="h-80 relative"><ResponsiveContainer width="100%" height={280}><ComposedChart data={md}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>fmt(v as number)}/><Tooltip formatter={(v:number)=>fmt(v)+' kg'}/><Legend/><Bar dataKey="pesoBruto" fill="#f59e0b" radius={[4,4,0,0]} name="Peso Bruto"/><Bar dataKey="pesoNeto" fill="#059669" radius={[4,4,0,0]} name="Peso Neto"/></ComposedChart></ResponsiveContainer></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">Top Destinos por Peso Neto</CardTitle></CardHeader><CardContent className="h-72 relative"><ResponsiveContainer width="100%" height={240}><BarChart data={bd}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="destino" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>fmt(v as number)}/><Tooltip formatter={(v:number)=>fmt(v)+' kg'}/><Bar dataKey="pesoNeto" fill="#10b981" radius={[4,4,0,0]} name="Peso Neto (kg)"/></BarChart></ResponsiveContainer></CardContent></Card>
      </div>
    </div>
  );
}
