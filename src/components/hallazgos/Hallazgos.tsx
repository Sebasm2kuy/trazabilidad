'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Sparkles, Loader2 } from 'lucide-react';
import { dataUrl } from '@/lib/staticData';
import React from 'react';

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  positive: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  negative: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  neutral: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
};

interface MovRecord {
  t: string; f: string; c: string; cf: string; p: string; np: string;
  ed: string; tm: string; pa: string; d: string; co: string;
  pa2: number; e: number; pb: number; pn: number; tt: string; sh: string;
  tpd?: string; tp?: number | null; isd?: boolean; dep?: string;
}

interface Insight {
  id: string; type: string; icon: string; title: string; description: string;
  severity: 'positive' | 'negative' | 'warning' | 'neutral'; value?: number; entity?: string;
}

const PERIOD_PRESETS = [
  { label: 'Q1 26 vs Q2 26', p1: { start: '2026-01-01', end: '2026-03-31' }, p2: { start: '2026-04-01', end: '2026-06-30' } },
  { label: '2025 vs 2026', p1: { start: '2025-01-01', end: '2025-12-31' }, p2: { start: '2026-01-01', end: '2026-12-31' } },
  { label: 'H1 26 vs H2 26', p1: { start: '2026-01-01', end: '2026-06-30' }, p2: { start: '2026-07-01', end: '2026-12-31' } },
];

export default function Hallazgos() {
  const [records, setRecords] = useState<MovRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [period1, setPeriod1] = useState({ start: '2026-01-01', end: '2026-03-31' });
  const [period2, setPeriod2] = useState({ start: '2026-04-01', end: '2026-06-30' });
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'congelado' | 'fresco'>('todos');

  // Load pre-computed insights (instant)
  useEffect(() => {
    // Just mark as loaded, actual data comes from records
    setLoading(false);
  }, []);

  // Load full records (lazy, when user interacts)
  const loadRecords = useCallback(async () => {
    if (recordsLoaded) return;
    setLoadingRecords(true);
    try {
      // 1. Try Firebase first
      const fbUrl = 'https://trazabilidad-9aa3c-default-rtdb.firebaseio.com';
      const metaResp = await fetch(`${fbUrl}/mercado_nacional_meta.json`);
      if (metaResp.ok) {
        const meta = await metaResp.json();
        if (meta && meta.totalRegistros && meta.totalChunks) {
          const allRecords: MovRecord[] = [];
          for (let i = 0; i < meta.totalChunks; i++) {
            const chunkResp = await fetch(`${fbUrl}/mercado_nacional_data/${i}.json`);
            if (chunkResp.ok) {
              const chunk = await chunkResp.json();
              if (Array.isArray(chunk)) allRecords.push(...chunk);
            }
          }
          if (allRecords.length > 0) {
            setRecords(allRecords);
            setRecordsLoaded(true);
            setLoadingRecords(false);
            return;
          }
        }
      }
      // 2. Fallback to .json.gz
      const rr = await fetch(dataUrl('data/nacional_mgmp.json.gz'));
      if (rr.ok) {
        if (rr.body && typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('gzip');
          const decompressed = rr.body.pipeThrough(ds);
          const text = await new Response(decompressed).text();
          setRecords(JSON.parse(text));
        } else {
          const buf = await rr.arrayBuffer();
          const pako = await import('pako');
          const decompressed = pako.inflate(new Uint8Array(buf));
          const text = new TextDecoder().decode(decompressed);
          setRecords(JSON.parse(text));
        }
        setRecordsLoaded(true);
      }
    } catch (err) { console.error('Error loading records:', err); }
    setLoadingRecords(false);
  }, [recordsLoaded]);

  // Filter records by period + tipo
  const filterByPeriod = useCallback((recs: MovRecord[], start: string, end: string) => {
    return recs.filter(r => {
      if (r.f < start || r.f > end) return false;
      if (tipoFilter !== 'todos') {
        const target = tipoFilter === 'congelado' ? 'Congelado' : 'Fresco';
        if (r.tpd !== target) return false;
      }
      return true;
    });
  }, [tipoFilter]);

  const p1Records = useMemo(() => filterByPeriod(records, period1.start, period1.end), [records, period1, filterByPeriod]);
  const p2Records = useMemo(() => filterByPeriod(records, period2.start, period2.end), [records, period2, filterByPeriod]);

  // Compute comparisons
  const comparisons = useMemo(() => {
    const summarize = (recs: MovRecord[]) => {
      const paises = new Set<string>(); const cortes = new Set<string>();
      const empresas = new Set<string>(); const denoms = new Set<string>();
      let pn = 0, cajas = 0;
      for (const r of recs) {
        if (r.pa) paises.add(r.pa); if (r.co) cortes.add(r.co);
        if (r.p) empresas.add(r.p); if (r.d) denoms.add(r.d);
        pn += r.pn || 0; cajas += r.e || 0;
      }
      return { registros: recs.length, pn, cajas, paises: paises.size, cortes: cortes.size, empresas: empresas.size, denoms: denoms.size };
    };
    const s1 = summarize(p1Records);
    const s2 = summarize(p2Records);
    return [
      { metric: 'Registros', cv: s1.registros, pv: s2.registros },
      { metric: 'Peso Neto (kg)', cv: s1.pn, pv: s2.pn },
      { metric: 'Cajas', cv: s1.cajas, pv: s2.cajas },
      { metric: 'Empresas', cv: s1.empresas, pv: s2.empresas },
      { metric: 'Países', cv: s1.paises, pv: s2.paises },
      { metric: 'Cortes', cv: s1.cortes, pv: s2.cortes },
    ].map(c => ({
      ...c,
      change: c.pv - c.cv,
      changeRate: c.cv > 0 ? ((c.pv - c.cv) / c.cv) * 100 : 0,
    }));
  }, [p1Records, p2Records]);

  // Generate insights
  const insights = useMemo<Insight[]>(() => {
    if (!p1Records.length && !p2Records.length) return [];
    const result: Insight[] = [];
    let id = 0;

    // Growth: company
    const companyPn1: Record<string, number> = {};
    const companyPn2: Record<string, number> = {};
    for (const r of p1Records) { if (r.p) companyPn1[r.p] = (companyPn1[r.p] || 0) + (r.pn || 0); }
    for (const r of p2Records) { if (r.p) companyPn2[r.p] = (companyPn2[r.p] || 0) + (r.pn || 0); }
    const allCompanies = new Set([...Object.keys(companyPn1), ...Object.keys(companyPn2)]);
    const companyGrowth = Array.from(allCompanies).map(name => ({
      name, p1: companyPn1[name] || 0, p2: companyPn2[name] || 0,
      rate: companyPn1[name] > 0 ? (((companyPn2[name] || 0) - companyPn1[name]) / companyPn1[name]) * 100 : 0,
    })).sort((a, b) => b.rate - a.rate);

    // Growth: country
    const countryPn1: Record<string, number> = {};
    const countryPn2: Record<string, number> = {};
    for (const r of p1Records) { if (r.pa) countryPn1[r.pa] = (countryPn1[r.pa] || 0) + (r.pn || 0); }
    for (const r of p2Records) { if (r.pa) countryPn2[r.pa] = (countryPn2[r.pa] || 0) + (r.pn || 0); }
    const allCountries = new Set([...Object.keys(countryPn1), ...Object.keys(countryPn2)]);
    const countryGrowth = Array.from(allCountries).map(name => ({
      name, p1: countryPn1[name] || 0, p2: countryPn2[name] || 0,
      rate: countryPn1[name] > 0 ? (((countryPn2[name] || 0) - countryPn1[name]) / countryPn1[name]) * 100 : 0,
    })).sort((a, b) => b.rate - a.rate);

    // 1. Market total
    const pnComp = comparisons.find(c => c.metric === 'Peso Neto (kg)');
    if (pnComp && pnComp.cv > 0) {
      if (pnComp.changeRate > 5) {
        result.push({ id: `i${id++}`, type: 'growth', icon: '📈', title: 'El mercado creció',
          description: `El volumen total aumentó ${pnComp.changeRate.toFixed(1)}% (${(pnComp.pv / 1000).toFixed(0)} ton vs ${(pnComp.cv / 1000).toFixed(0)} ton).`,
          severity: 'positive', value: pnComp.changeRate });
      } else if (pnComp.changeRate < -5) {
        result.push({ id: `i${id++}`, type: 'decline', icon: '📉', title: 'El mercado se contrajo',
          description: `El volumen total cayó ${Math.abs(pnComp.changeRate).toFixed(1)}% (${(pnComp.pv / 1000).toFixed(0)} ton vs ${(pnComp.cv / 1000).toFixed(0)} ton).`,
          severity: 'negative', value: pnComp.changeRate });
      }
    }

    // 2. Country growth
    for (const g of countryGrowth.slice(0, 3)) {
      if (g.rate > 20 && g.p2 > 100000) {
        result.push({ id: `i${id++}`, type: 'growth', icon: '📈', title: `${g.name} creció ${g.rate.toFixed(0)}%`,
          description: `${g.name} aumentó de ${(g.p1 / 1000).toFixed(0)} a ${(g.p2 / 1000).toFixed(0)} toneladas.`,
          severity: 'positive', value: g.rate, entity: g.name });
      }
    }

    // 3. Country decline
    for (const g of countryGrowth.slice(-3).reverse()) {
      if (g.rate < -20 && g.p1 > 100000) {
        result.push({ id: `i${id++}`, type: 'decline', icon: '📉', title: `${g.name} cayó ${Math.abs(g.rate).toFixed(0)}%`,
          description: `${g.name} disminuyó de ${(g.p1 / 1000).toFixed(0)} a ${(g.p2 / 1000).toFixed(0)} toneladas.`,
          severity: 'negative', value: g.rate, entity: g.name });
      }
    }

    // 4. Company growth
    for (const g of companyGrowth.slice(0, 3)) {
      if (g.rate > 30 && g.p2 > 50000) {
        result.push({ id: `i${id++}`, type: 'growth', icon: '🏭', title: `${g.name.substring(0, 25)} creció ${g.rate.toFixed(0)}%`,
          description: `${g.name} aumentó de ${(g.p1 / 1000).toFixed(0)} a ${(g.p2 / 1000).toFixed(0)} toneladas.`,
          severity: 'positive', value: g.rate, entity: g.name });
      }
    }

    // 5. Company decline
    for (const g of companyGrowth.slice(-3).reverse()) {
      if (g.rate < -30 && g.p1 > 50000) {
        result.push({ id: `i${id++}`, type: 'decline', icon: '⚠️', title: `${g.name.substring(0, 25)} cayó ${Math.abs(g.rate).toFixed(0)}%`,
          description: `${g.name} redujo de ${(g.p1 / 1000).toFixed(0)} a ${(g.p2 / 1000).toFixed(0)} toneladas.`,
          severity: 'warning', value: g.rate, entity: g.name });
      }
    }

    // 6. New/lost destinations
    const curPaises = new Set(p2Records.map(r => r.pa).filter(Boolean));
    const prevPaises = new Set(p1Records.map(r => r.pa).filter(Boolean));
    const newDests = [...curPaises].filter(p => !prevPaises.has(p));
    const lostDests = [...prevPaises].filter(p => !curPaises.has(p));
    if (newDests.length > 0) {
      result.push({ id: `i${id++}`, type: 'new', icon: '🌎', title: `${newDests.length} nuevo${newDests.length > 1 ? 's' : ''} destino${newDests.length > 1 ? 's' : ''}`,
        description: `Se incorporaron: ${newDests.slice(0, 5).join(', ')}${newDests.length > 5 ? ` y ${newDests.length - 5} más` : ''}.`,
        severity: 'positive' });
    }
    if (lostDests.length > 0) {
      result.push({ id: `i${id++}`, type: 'lost', icon: '❌', title: `${lostDests.length} destino${lostDests.length > 1 ? 's' : ''} perdido${lostDests.length > 1 ? 's' : ''}`,
        description: `Se dejaron de exportar a: ${lostDests.slice(0, 5).join(', ')}${lostDests.length > 5 ? ` y ${lostDests.length - 5} más` : ''}.`,
        severity: 'warning' });
    }

    // 7. Concentration risk
    const concMap: Record<string, { totalPn: number; destinos: Record<string, number> }> = {};
    for (const r of p2Records) {
      if (!r.p) continue;
      if (!concMap[r.p]) concMap[r.p] = { totalPn: 0, destinos: {} };
      concMap[r.p].totalPn += r.pn || 0;
      const dest = r.pa || 'S/D';
      concMap[r.p].destinos[dest] = (concMap[r.p].destinos[dest] || 0) + (r.pn || 0);
    }
    const highRisk = Object.entries(concMap).map(([name, d]) => {
      const sorted = Object.entries(d.destinos).sort(([,a],[,b]) => b - a);
      const pct = d.totalPn > 0 ? (sorted[0]?.[1] || 0) / d.totalPn * 100 : 0;
      return { name, pct, topDest: sorted[0]?.[0] || 'S/D', totalPn: d.totalPn };
    }).filter(c => c.pct > 60 && c.totalPn > 100000).sort((a, b) => b.pct - a.pct);

    for (const c of highRisk.slice(0, 3)) {
      result.push({ id: `i${id++}`, type: 'concentration', icon: '⚠️', title: `${c.name.substring(0, 25)} depende ${c.pct.toFixed(0)}% de ${c.topDest}`,
        description: `${c.name} concentra el ${c.pct.toFixed(0)}% de sus exportaciones en ${c.topDest}. Riesgo: alto.`,
        severity: 'warning', value: c.pct, entity: c.name });
    }

    // 8. Market leader
    const topCompany = companyGrowth.sort((a, b) => b.p2 - a.p2)[0];
    if (topCompany && topCompany.p2 > 0) {
      result.push({ id: `i${id++}`, type: 'milestone', icon: '🏆', title: `${topCompany.name.substring(0, 25)} lidera el mercado`,
        description: `${topCompany.name} es el principal exportador con ${(topCompany.p2 / 1000).toFixed(0)} toneladas.`,
        severity: 'neutral', entity: topCompany.name });
    }

    return result;
  }, [p1Records, p2Records, comparisons]);

  // Auto-load records on mount
  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  if (loading) {
    return <div className="p-6 space-y-4"><h2 className="text-2xl font-bold text-slate-800">🔎 Hallazgos</h2><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center gap-3">
        <Sparkles className="h-7 w-7 text-violet-600" />
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Hallazgos</h2>
          <p className="text-xs text-slate-500">Descubridor automático de patrones y cambios</p>
        </div>
      </div>

      {/* Filtros de período */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-slate-700">Período 1 (base)</span>
            <input type="date" value={period1.start} onChange={e => setPeriod1(prev => ({ ...prev, start: e.target.value }))} className="text-xs border rounded px-2 py-1" />
            <span className="text-xs text-slate-400">→</span>
            <input type="date" value={period1.end} onChange={e => setPeriod1(prev => ({ ...prev, end: e.target.value }))} className="text-xs border rounded px-2 py-1" />
            <span className="text-xs text-slate-400 ml-2">vs</span>
            <span className="text-xs font-semibold text-slate-700 ml-1">Período 2 (actual)</span>
            <input type="date" value={period2.start} onChange={e => setPeriod2(prev => ({ ...prev, start: e.target.value }))} className="text-xs border rounded px-2 py-1" />
            <span className="text-xs text-slate-400">→</span>
            <input type="date" value={period2.end} onChange={e => setPeriod2(prev => ({ ...prev, end: e.target.value }))} className="text-xs border rounded px-2 py-1" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_PRESETS.map(preset => (
              <button key={preset.label}
                onClick={() => { setPeriod1(preset.p1); setPeriod2(preset.p2); }}
                className="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                {preset.label}
              </button>
            ))}
            <span className="text-[10px] text-slate-400 ml-2">Tipo:</span>
            {['todos', 'congelado', 'fresco'].map(t => (
              <button key={t}
                className={`text-[10px] px-2 py-1 rounded-full transition-colors ${tipoFilter === t ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                onClick={() => setTipoFilter(t as any)}>
                {t === 'todos' ? 'Todos' : t === 'congelado' ? 'Congelado' : 'Fresco'}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loadingRecords && (
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          <span className="text-sm text-slate-500">Cargando registros para análisis…</span>
        </CardContent></Card>
      )}

      {/* KPIs comparativos */}
      {!loadingRecords && records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {comparisons.map((c, i) => {
            const isPositive = c.change > 0;
            return (
              <Card key={i} className={`border-l-4 ${isPositive ? 'border-l-emerald-500' : c.change < 0 ? 'border-l-red-500' : 'border-l-slate-400'}`}>
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase font-semibold text-slate-500">{c.metric}</p>
                  <p className="text-lg font-bold text-slate-800 mt-1">{c.pv.toLocaleString()}</p>
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
      )}

      {/* Insights */}
      {!loadingRecords && records.length > 0 && (
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
      )}

      {!loadingRecords && records.length > 0 && insights.length === 0 && (
        <Card><CardContent className="p-8 text-center text-slate-400">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No se detectaron cambios significativos. Probá otro rango de fechas.</p>
        </CardContent></Card>
      )}
    </div>
  );
}
