'use client';
import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Sparkles } from 'lucide-react';
import { dataUrl } from '@/lib/staticData';
import React from 'react';

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  positive: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  negative: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  neutral: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
};

interface InsightData {
  period: { currentStart: string; currentEnd: string; previousStart: string; previousEnd: string; currentLabel: string; previousLabel: string };
  currentSummary: any;
  previousSummary: any;
  comparisons: { metric: string; currentValue: number; previousValue: number; change: number; changeRate: number }[];
  timeSeries: { fecha: string; registros: number; cajas: number; pesoNeto: number }[];
  countryRanking: { name: string; registros: number; cajas: number; pesoNeto: number; share: number }[];
  companyRanking: { name: string; registros: number; cajas: number; pesoNeto: number; share: number }[];
  countryGrowth: { name: string; currentPn: number; previousPn: number; growthRate: number; absoluteChange: number }[];
  companyGrowth: { name: string; currentPn: number; previousPn: number; growthRate: number; absoluteChange: number }[];
  productGrowth: { name: string; currentPn: number; previousPn: number; growthRate: number; absoluteChange: number }[];
  corteGrowth: { name: string; currentPn: number; previousPn: number; growthRate: number; absoluteChange: number }[];
  newDestinations: string[];
  lostDestinations: string[];
  concentration: { name: string; totalPn: number; topDestinoPn: number; topDestinoName: string; concentration: number; risk: string }[];
}

interface Insight {
  id: string; type: string; icon: string; title: string; description: string;
  severity: 'positive' | 'negative' | 'warning' | 'neutral'; value?: number; entity?: string;
}

export default function Hallazgos() {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(dataUrl('data/nacional_insights.json'));
        if (r.ok) setData(await r.json());
      } catch (err) { console.error('Error loading insights:', err); }
      setLoading(false);
    })();
  }, []);

  // Generate insights from pre-computed data (instant, no 23MB JSON needed)
  const insights = useMemo<Insight[]>(() => {
    if (!data) return [];
    const result: Insight[] = [];
    let id = 0;

    // 1. Market growth/decline
    const pnComp = data.comparisons.find(c => c.metric === 'Peso Neto (kg)');
    if (pnComp && pnComp.previousValue > 0) {
      const rate = pnComp.changeRate;
      if (rate > 5) {
        result.push({ id: `i${id++}`, type: 'growth', icon: '📈', title: 'El mercado creció',
          description: `El volumen total aumentó ${rate.toFixed(1)}% respecto a ${data.period.previousLabel} (${(data.currentSummary.totalPesoNeto / 1000).toFixed(0)} ton vs ${(data.previousSummary.totalPesoNeto / 1000).toFixed(0)} ton).`,
          severity: 'positive', value: rate });
      } else if (rate < -5) {
        result.push({ id: `i${id++}`, type: 'decline', icon: '📉', title: 'El mercado se contrajo',
          description: `El volumen total cayó ${Math.abs(rate).toFixed(1)}% respecto a ${data.period.previousLabel} (${(data.currentSummary.totalPesoNeto / 1000).toFixed(0)} ton vs ${(data.previousSummary.totalPesoNeto / 1000).toFixed(0)} ton).`,
          severity: 'negative', value: rate });
      }
    }

    // 2. Country growth
    for (const g of data.countryGrowth.slice(0, 3)) {
      if (g.growthRate > 20 && g.currentPn > 100000) {
        result.push({ id: `i${id++}`, type: 'growth', icon: '📈', title: `${g.name} creció ${g.growthRate.toFixed(0)}%`,
          description: `${g.name} aumentó de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas (+${(g.absoluteChange / 1000).toFixed(0)} ton).`,
          severity: 'positive', value: g.growthRate, entity: g.name });
      }
    }

    // 3. Country decline
    for (const g of data.countryGrowth.slice(-3).reverse()) {
      if (g.growthRate < -20 && g.previousPn > 100000) {
        result.push({ id: `i${id++}`, type: 'decline', icon: '📉', title: `${g.name} cayó ${Math.abs(g.growthRate).toFixed(0)}%`,
          description: `${g.name} disminuyó de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas (${(g.absoluteChange / 1000).toFixed(0)} ton).`,
          severity: 'negative', value: g.growthRate, entity: g.name });
      }
    }

    // 4. Company growth
    for (const g of data.companyGrowth.slice(0, 3)) {
      if (g.growthRate > 30 && g.currentPn > 50000) {
        result.push({ id: `i${id++}`, type: 'growth', icon: '🏭', title: `${g.name.substring(0, 25)} creció ${g.growthRate.toFixed(0)}%`,
          description: `${g.name} aumentó sus envíos de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas.`,
          severity: 'positive', value: g.growthRate, entity: g.name });
      }
    }

    // 5. Company decline
    for (const g of data.companyGrowth.slice(-3).reverse()) {
      if (g.growthRate < -30 && g.previousPn > 50000) {
        result.push({ id: `i${id++}`, type: 'decline', icon: '⚠️', title: `${g.name.substring(0, 25)} cayó ${Math.abs(g.growthRate).toFixed(0)}%`,
          description: `${g.name} redujo sus envíos de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas.`,
          severity: 'warning', value: g.growthRate, entity: g.name });
      }
    }

    // 6. New destinations
    if (data.newDestinations.length > 0) {
      result.push({ id: `i${id++}`, type: 'new', icon: '🌎', title: `${data.newDestinations.length} nuevo${data.newDestinations.length > 1 ? 's' : ''} destino${data.newDestinations.length > 1 ? 's' : ''}`,
        description: `Se incorporaron exportaciones a: ${data.newDestinations.slice(0, 5).join(', ')}${data.newDestinations.length > 5 ? ` y ${data.newDestinations.length - 5} más` : ''}.`,
        severity: 'positive' });
    }

    // 7. Lost destinations
    if (data.lostDestinations.length > 0) {
      result.push({ id: `i${id++}`, type: 'lost', icon: '❌', title: `${data.lostDestinations.length} destino${data.lostDestinations.length > 1 ? 's' : ''} perdido${data.lostDestinations.length > 1 ? 's' : ''}`,
        description: `Se dejaron de exportar a: ${data.lostDestinations.slice(0, 5).join(', ')}${data.lostDestinations.length > 5 ? ` y ${data.lostDestinations.length - 5} más` : ''}.`,
        severity: 'warning' });
    }

    // 8. Concentration risk
    const highRisk = data.concentration.filter(c => c.risk === 'alto' && c.totalPn > 100000);
    for (const c of highRisk.slice(0, 3)) {
      result.push({ id: `i${id++}`, type: 'concentration', icon: '⚠️', title: `${c.name.substring(0, 25)} depende ${c.concentration.toFixed(0)}% de ${c.topDestinoName}`,
        description: `${c.name} concentra el ${c.concentration.toFixed(0)}% de sus exportaciones (${(c.topDestinoPn / 1000).toFixed(0)} ton) en ${c.topDestinoName}. Riesgo: ${c.risk}.`,
        severity: 'warning', value: c.concentration, entity: c.name });
    }

    // 9. Product growth
    for (const g of data.productGrowth.slice(0, 2)) {
      if (g.growthRate > 50 && g.currentPn > 50000) {
        result.push({ id: `i${id++}`, type: 'growth', icon: '📦', title: `${g.name.substring(0, 30)} creció ${g.growthRate.toFixed(0)}%`,
          description: `El producto "${g.name.substring(0, 40)}" aumentó de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas.`,
          severity: 'positive', value: g.growthRate, entity: g.name });
      }
    }

    // 10. Market leader
    const topCompany = data.companyRanking[0];
    if (topCompany) {
      result.push({ id: `i${id++}`, type: 'milestone', icon: '🏆', title: `${topCompany.name.substring(0, 25)} lidera el mercado`,
        description: `${topCompany.name} es el principal exportador con ${(topCompany.pesoNeto / 1000).toFixed(0)} toneladas (${topCompany.share.toFixed(1)}% del mercado total).`,
        severity: 'neutral', value: topCompany.share, entity: topCompany.name });
    }

    // 11. Top 3 concentration
    const top3Share = data.countryRanking.slice(0, 3).reduce((s, p) => s + p.share, 0);
    if (top3Share > 60) {
      result.push({ id: `i${id++}`, type: 'concentration', icon: '📊', title: `Top 3 países concentran ${top3Share.toFixed(0)}% del mercado`,
        description: `${data.countryRanking.slice(0, 3).map(p => `${p.name} (${p.share.toFixed(0)}%)`).join(', ')} dominan el mercado exportador. Considerar diversificación.`,
        severity: 'warning', value: top3Share });
    }

    return result;
  }, [data]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-2xl font-bold text-slate-800">🔎 Hallazgos</h2>
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      </div>
    );
  }

  if (!data) return <div className="p-6">Error cargando datos</div>;

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center gap-3">
        <Sparkles className="h-7 w-7 text-violet-600" />
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Hallazgos</h2>
          <p className="text-xs text-slate-500">Descubridor automático de patrones · {data.period.currentLabel} vs {data.period.previousLabel}</p>
        </div>
      </div>

      {/* KPIs comparativos */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {data.comparisons.map((c, i) => {
          const isPositive = c.change > 0;
          return (
            <Card key={i} className={`border-l-4 ${isPositive ? 'border-l-emerald-500' : c.change < 0 ? 'border-l-red-500' : 'border-l-slate-400'}`}>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase font-semibold text-slate-500">{c.metric}</p>
                <p className="text-lg font-bold text-slate-800 mt-1">{c.currentValue.toLocaleString()}</p>
                {c.changeRate !== 0 && (
                  <p className={`text-[10px] mt-0.5 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isPositive ? '▲' : '▼'} {Math.abs(c.changeRate).toFixed(1)}% ({c.change > 0 ? '+' : ''}{c.change.toLocaleString()})
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Insights */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3">{insights.length} hallazgo{insights.length !== 1 ? 's' : ''} detectado{insights.length !== 1 ? 's' : ''}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map(insight => {
            const colors = SEVERITY_COLORS[insight.severity] || SEVERITY_COLORS.neutral;
            return (
              <Card key={insight.id} className={`${colors.bg} ${colors.border} border`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{insight.icon}</span>
                    <div className="flex-1">
                      <h4 className={`text-sm font-bold ${colors.text}`}>{insight.title}</h4>
                      <p className="text-xs text-slate-600 mt-1">{insight.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {insights.length === 0 && (
        <Card><CardContent className="p-8 text-center text-slate-400">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No se detectaron cambios significativos.</p>
        </CardContent></Card>
      )}
    </div>
  );
}
