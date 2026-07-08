'use client';

// ============================================================
// CopilotPage — El Copilot como Analista Inteligente
// ------------------------------------------------------------
// NO es un chat. Es un dominio de primer nivel que recibe
// una pregunta de negocio y construye automáticamente:
//   - Resumen ejecutivo
//   - Timeline
//   - Alertas
//   - Comparativas
//   - Recomendaciones
//   - Acciones sugeridas
// ============================================================

import { useEffect, useState } from 'react';
import {
  Bot, Sparkles, Search, TrendingUp, AlertTriangle, GitBranch,
  Target, ArrowRight, Lightbulb, Activity, FileText, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';
import { loadNacionalRecords } from '@/lib/nacionalLoader';
import { computeCapturaCaliral, generateCapturaInsights, CLIENTES_ESTRATEGICOS } from '@/intelligence-engine/capturaCaliral';
import { buildStockItems } from '@/domain/adapters';
import type { Shipment, ExpRecord } from '@/lib/types';
import { useEntityDrawer } from '@/store/useEntityDrawer';

type QuestionType =
  | 'donde_mercaderia' | 'que_cambio_hoy' | 'documentacion_falta'
  | 'alertas_criticas' | 'movimientos_recientes'
  | 'cuanto_exporto_nirea' | 'captura_caliral' | 'paises_perdiendo'
  | 'clientes_otros_depositos' | 'oportunidades' | 'libre';

interface QuestionPreset {
  id: QuestionType;
  text: string;
  category: 'operacion' | 'comercial';
  icon: any;
}

const PRESETS: QuestionPreset[] = [
  { id: 'donde_mercaderia', text: '¿Dónde está la mercadería?', category: 'operacion', icon: Search },
  { id: 'que_cambio_hoy', text: '¿Qué cambió hoy?', category: 'operacion', icon: Activity },
  { id: 'documentacion_falta', text: '¿Qué documentación falta?', category: 'operacion', icon: FileText },
  { id: 'alertas_criticas', text: '¿Qué alertas críticas existen?', category: 'operacion', icon: AlertTriangle },
  { id: 'movimientos_recientes', text: '¿Qué movimientos ocurrieron?', category: 'operacion', icon: GitBranch },
  { id: 'cuanto_exporto_nirea', text: '¿Cuánto exportó NIREA?', category: 'comercial', icon: TrendingUp },
  { id: 'captura_caliral', text: '¿Qué % pasó por CALIRAL?', category: 'comercial', icon: Target },
  { id: 'paises_perdiendo', text: '¿Qué países estamos perdiendo?', category: 'comercial', icon: TrendingUp },
  { id: 'clientes_otros_depositos', text: '¿Qué clientes usan otros depósitos?', category: 'comercial', icon: Users },
  { id: 'oportunidades', text: '¿Qué oportunidades existen?', category: 'comercial', icon: Lightbulb },
];

interface AnalysisBlock {
  type: 'summary' | 'kpi' | 'list' | 'recommendation' | 'timeline' | 'comparison' | 'alert' | 'empty';
  title: string;
  items?: { label: string; value: string; detail?: string; severity?: 'positive' | 'negative' | 'warning' | 'opportunity' | 'neutral' }[];
  text?: string;
}

interface AnalysisResult {
  blocks: AnalysisBlock[];
  rawAnswer: string;
}

export function CopilotPage() {
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [activePreset, setActivePreset] = useState<QuestionType | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [data, setData] = useState<{
    depositos: (Shipment | ExpRecord)[];
    exportaciones: (Shipment | ExpRecord)[];
    nacional: any[];
  } | null>(null);
  const openDrawer = useEntityDrawer(s => s.openDrawer);

  // Cargar datos en background
  useEffect(() => {
    Promise.all([loadDepositos(), loadExportaciones(), loadNacionalRecords()])
      .then(([deps, exps, nacional]) => setData({ depositos: deps, exportaciones: exps, nacional }))
      .catch(e => console.error('[copilot] carga falló:', e));
  }, []);

  function analyze(qType: QuestionType, freeText?: string) {
    if (!data) return;
    setLoading(true);
    setActivePreset(qType);
    setQuestion(freeText || PRESETS.find(p => p.id === qType)?.text || '');

    setTimeout(() => {
      const r = buildAnalysis(qType, data, freeText);
      setResult(r);
      setLoading(false);
    }, 300);
  }

  function submitFreeText() {
    if (!question.trim()) return;
    const q = question.toLowerCase();
    let detected: QuestionType = 'libre';
    if (q.includes('dónde') || q.includes('donde') || q.includes('ubicación')) detected = 'donde_mercaderia';
    else if (q.includes('cambió') || q.includes('cambio') || q.includes('hoy')) detected = 'que_cambio_hoy';
    else if (q.includes('document')) detected = 'documentacion_falta';
    else if (q.includes('alerta')) detected = 'alertas_criticas';
    else if (q.includes('movim')) detected = 'movimientos_recientes';
    else if (q.includes('nirea') && q.includes('export')) detected = 'cuanto_exporto_nirea';
    else if (q.includes('captura') || q.includes('%') || q.includes('caliral')) detected = 'captura_caliral';
    else if (q.includes('país') || q.includes('pais') || q.includes('perdi')) detected = 'paises_perdiendo';
    else if (q.includes('cliente')) detected = 'clientes_otros_depositos';
    else if (q.includes('oportun')) detected = 'oportunidades';
    analyze(detected, question);
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="px-8 pt-8 pb-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-5 h-5 text-violet-600" />
            <p className="text-[11px] uppercase tracking-widest text-violet-600 dark:text-violet-400 font-semibold">
              Analista Inteligente
            </p>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-1">
            Hacé una pregunta de negocio
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            El Copilot construye automáticamente un análisis completo: resumen, timeline, alertas, recomendaciones y acciones sugeridas.
          </p>
        </div>
      </div>

      <div className="px-8 pb-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitFreeText()}
              placeholder="Ej: ¿Dónde está la mercadería P14722? ¿Qué % de NIREA pasó por CALIRAL?"
              className="flex-1 text-sm px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400"
              autoFocus
            />
            <Button onClick={submitFreeText} disabled={loading || !question.trim()} className="px-6">
              {loading ? <Activity className="w-4 h-4 animate-pulse" /> : <Sparkles className="w-4 h-4 mr-1" />}
              {loading ? 'Analizando…' : 'Analizar'}
            </Button>
          </div>
        </div>
      </div>

      <div className="px-8 pb-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Preguntas frecuentes</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {PRESETS.map(p => {
              const Icon = p.icon;
              const active = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => analyze(p.id)}
                  className={cn(
                    'text-left rounded-lg border p-3 transition-all flex items-center gap-3',
                    active
                      ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-300 hover:shadow-sm',
                  )}
                >
                  <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-violet-600' : 'text-slate-500')} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', active ? 'text-violet-800 dark:text-violet-200' : 'text-slate-700 dark:text-slate-200')}>
                      {p.text}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {p.category === 'operacion' ? 'Operación' : 'Comercial'}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {result && (
        <div className="px-8 pb-12">
          <div className="max-w-5xl mx-auto space-y-3">
            <Card className="p-5 bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border-violet-200 dark:border-violet-900">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <p className="text-xs uppercase tracking-wider text-violet-700 dark:text-violet-300 font-semibold">
                  Resumen ejecutivo
                </p>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {result.rawAnswer}
              </p>
            </Card>

            {result.blocks.map((block, i) => (
              <AnalysisBlockCard
                key={i}
                block={block}
                onItemClick={(label) => {
                  if (label.match(/^P\d{4,8}/i) || label.match(/^\d{4,8}$/)) {
                    const cote = label.match(/P\d{4,8}/i)?.[0] || label;
                    openDrawer('cote', cote);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisBlockCard({ block, onItemClick }: { block: AnalysisBlock; onItemClick: (label: string) => void }) {
  const iconMap: Record<string, any> = {
    kpi: Target, list: FileText, recommendation: Lightbulb,
    timeline: GitBranch, comparison: TrendingUp, alert: AlertTriangle,
    summary: Sparkles, empty: Activity,
  };
  const Icon = iconMap[block.type] || Activity;

  if (block.type === 'empty') {
    return (
      <Card className="p-5 text-center">
        <Icon className="w-6 h-6 mx-auto text-slate-400 mb-2" />
        <p className="text-sm text-slate-500">{block.text}</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-violet-600" />
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{block.title}</p>
      </div>

      {block.text && (
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">{block.text}</p>
      )}

      {block.items && block.items.length > 0 && (
        <div className="space-y-1.5">
          {block.items.map((item, i) => {
            const severityColor = {
              positive: 'text-emerald-600',
              negative: 'text-red-600',
              warning: 'text-amber-600',
              opportunity: 'text-violet-600',
              neutral: 'text-slate-600 dark:text-slate-300',
            };
            return (
              <button
                key={i}
                onClick={() => onItemClick(item.label)}
                className="w-full text-left flex items-center gap-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">
                    {item.label}
                  </p>
                  {item.detail && (
                    <p className="text-[10px] text-slate-500 truncate">{item.detail}</p>
                  )}
                </div>
                {item.value && (
                  <span className={cn('text-xs font-semibold tabular-nums shrink-0', severityColor[item.severity || 'neutral'])}>
                    {item.value}
                  </span>
                )}
                <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function buildAnalysis(qType: QuestionType, data: { depositos: any[]; exportaciones: any[]; nacional: any[] }, freeText?: string): AnalysisResult {
  const stock = buildStockItems(data.depositos, data.exportaciones);
  const fmt = (n: number) => n.toLocaleString('es-UY', { maximumFractionDigits: 0 });
  const fmtT = (n: number) => `${(n / 1000).toFixed(1)} t`;

  switch (qType) {
    case 'donde_mercaderia': {
      const coteMatch = freeText?.match(/P\d{4,8}/i);
      if (coteMatch) {
        const cote = coteMatch[0].toUpperCase();
        const lotes = stock.filter(s => s.cote.toUpperCase() === cote);
        if (lotes.length === 0) {
          return {
            rawAnswer: `No se encontró mercadería con COTE ${cote}.`,
            blocks: [{ type: 'empty', title: 'Sin resultados', text: `El COTE ${cote} no existe en los registros cargados.` }],
          };
        }
        return {
          rawAnswer: `La mercadería ${cote} está en ${lotes.length} depósito(s). Peso total: ${fmtT(lotes.reduce((s, l) => s + l.pesoNeto, 0))}.`,
          blocks: [
            {
              type: 'list',
              title: 'Ubicaciones de la mercadería',
              items: lotes.map(l => ({
                label: `${l.cote} — ${l.deposito}`,
                value: fmtT(l.pesoNeto),
                detail: `${l.productor} • ${l.corte} • ${l.diasSinMovimiento} días sin movimiento`,
                severity: l.estado === 'retenido' ? 'negative' as const : l.diasSinMovimiento > 90 ? 'warning' as const : 'neutral' as const,
              })),
            },
          ],
        };
      }
      const byDeposito = new Map<string, { pn: number; count: number }>();
      for (const s of stock) {
        if (!byDeposito.has(s.deposito)) byDeposito.set(s.deposito, { pn: 0, count: 0 });
        const e = byDeposito.get(s.deposito)!;
        e.pn += s.pesoNeto; e.count++;
      }
      const total = stock.reduce((s, l) => s + l.pesoNeto, 0);
      return {
        rawAnswer: `Hay ${fmtT(total)} de mercadería distribuidos en ${byDeposito.size} depósito(s), totalizando ${stock.length} lotes.`,
        blocks: [
          {
            type: 'list',
            title: 'Mercadería por depósito',
            items: Array.from(byDeposito.entries())
              .sort((a, b) => b[1].pn - a[1].pn)
              .slice(0, 10)
              .map(([dep, v]) => ({
                label: dep,
                value: fmtT(v.pn),
                detail: `${v.count} lotes`,
                severity: 'neutral' as const,
              })),
          },
        ],
      };
    }

    case 'que_cambio_hoy': {
      const hoy = new Date().toISOString().substring(0, 10);
      const hoyMovs = [...data.depositos, ...data.exportaciones]
        .filter(r => r.fechaTramite && r.fechaTramite.substring(0, 10) === hoy);
      const ultimo = [...data.depositos, ...data.exportaciones]
        .filter(r => r.fechaTramite)
        .sort((a, b) => b.fechaTramite.localeCompare(a.fechaTramite))[0];
      return {
        rawAnswer: hoyMovs.length > 0
          ? `Hoy se registraron ${hoyMovs.length} movimientos.`
          : `No se registraron movimientos hoy. Último movimiento: ${ultimo?.fechaTramite || 'sin datos'}.`,
        blocks: [
          {
            type: 'timeline',
            title: 'Movimientos de hoy',
            items: hoyMovs.slice(0, 10).map(r => ({
              label: `${r.nroCote || '—'} — ${r.nombreEstablecimientoCertif || r.establecimiento || ''} → ${r.paisDestino || ''}`,
              value: fmt(r.pesoNeto || 0) + ' kg',
              detail: `${(r as any).tipo || 'movimiento'}`,
              severity: 'neutral' as const,
            })),
          },
        ],
      };
    }

    case 'documentacion_falta': {
      const sinDoc = stock.filter(s => !s.fechaIngreso);
      return {
        rawAnswer: sinDoc.length > 0
          ? `${sinDoc.length} lote(s) sin fecha de ingreso documentada.`
          : `Toda la mercadería tiene documentación de ingreso registrada.`,
        blocks: [
          {
            type: 'list',
            title: 'Lotes sin documentación',
            items: sinDoc.slice(0, 15).map(s => ({
              label: s.cote || s.id,
              value: fmt(s.pesoNeto) + ' kg',
              detail: `${s.deposito} • ${s.productor}`,
              severity: 'warning' as const,
            })),
          },
        ],
      };
    }

    case 'alertas_criticas': {
      const retenida = stock.filter(s => s.estado === 'retenido');
      const mayor180 = stock.filter(s => s.diasSinMovimiento > 180);
      const sinDestino = stock.filter(s => !s.tieneDestino && !s.tieneExportacion && s.diasSinMovimiento > 30);
      return {
        rawAnswer: `Alertas activas: ${retenida.length} retenida(s), ${mayor180.length} mayor a 180 días, ${sinDestino.length} sin destino.`,
        blocks: [
          {
            type: 'alert',
            title: 'Mercadería retenida',
            items: retenida.slice(0, 10).map(s => ({
              label: s.cote || s.id,
              value: fmt(s.pesoNeto) + ' kg',
              detail: `${s.deposito} • ${s.productor}`,
              severity: 'negative' as const,
            })),
          },
          {
            type: 'alert',
            title: 'Mayor a 180 días sin movimiento',
            items: mayor180.slice(0, 10).map(s => ({
              label: s.cote || s.id,
              value: `${s.diasSinMovimiento} días`,
              detail: `${s.deposito} • ${fmt(s.pesoNeto)} kg`,
              severity: 'warning' as const,
            })),
          },
        ],
      };
    }

    case 'movimientos_recientes': {
      const movs = [...data.depositos, ...data.exportaciones]
        .filter(r => r.fechaTramite)
        .sort((a, b) => b.fechaTramite.localeCompare(a.fechaTramite))
        .slice(0, 15);
      return {
        rawAnswer: `Últimos ${movs.length} movimientos registrados en el sistema.`,
        blocks: [
          {
            type: 'timeline',
            title: 'Timeline de movimientos',
            items: movs.map(r => ({
              label: `${r.nroCote || '—'} — ${r.nombreEstablecimientoCertif || r.establecimiento || ''} → ${r.paisDestino || r.nombreEstablecimientoDestino || ''}`,
              value: fmt(r.pesoNeto || 0) + ' kg',
              detail: new Date(r.fechaTramite).toLocaleDateString('es-UY'),
              severity: (r as any).tipo === 'EXPORTACION' ? 'positive' as const : 'neutral' as const,
            })),
          },
        ],
      };
    }

    case 'cuanto_exporto_nirea':
    case 'captura_caliral': {
      const NIREA = CLIENTES_ESTRATEGICOS.find(c => c.id === 'NIREA')!;
      const result = computeCapturaCaliral(data.nacional, NIREA.aliases);
      const insights = generateCapturaInsights(result, NIREA.name);
      return {
        rawAnswer: `${NIREA.name} exportó ${fmtT(result.totalClientePn)} en total. CALIRAL capturó como depósito ${fmtT(result.caliralPn)} (${result.captureIndex.toFixed(1)}%). Resto vía terceros: ${fmtT(result.otrosPn)}. Adicionalmente, CALIRAL certificó ${fmtT(result.caliralCfPn)} de lo depositado.`,
        blocks: [
          {
            type: 'kpi',
            title: 'Índice de Captura CALIRAL',
            items: [
              { label: 'Captura (depósito)', value: result.captureIndex.toFixed(1) + '%', detail: `${fmtT(result.caliralPn)} de ${fmtT(result.totalClientePn)}`, severity: result.captureIndex > 50 ? 'positive' as const : result.captureIndex > 25 ? 'warning' as const : 'negative' as const },
              { label: 'Certificación (de lo depositado)', value: result.caliralCfPn > 0 ? fmtT(result.caliralCfPn) : '—', detail: `${result.caliralCfCount} registros`, severity: 'neutral' as const },
              { label: 'Vía terceros', value: (100 - result.captureIndex).toFixed(1) + '%', detail: `${fmtT(result.otrosPn)}`, severity: 'neutral' as const },
            ],
          },
          {
            type: 'list',
            title: 'Conclusiones automáticas',
            items: insights.map(ins => ({
              label: ins.text,
              value: '',
              severity: ins.severity as any,
            })),
          },
          {
            type: 'comparison',
            title: 'Captura por país (top 8)',
            items: result.byPais.slice(0, 8).map(p => ({
              label: p.label,
              value: p.captureIndex.toFixed(1) + '%',
              detail: `${fmtT(p.totalPn)} totales`,
              severity: p.captureIndex > 50 ? 'positive' as const : p.captureIndex > 25 ? 'warning' as const : 'negative' as const,
            })),
          },
        ],
      };
    }

    case 'paises_perdiendo': {
      const NIREA = CLIENTES_ESTRATEGICOS.find(c => c.id === 'NIREA')!;
      const result = computeCapturaCaliral(data.nacional, NIREA.aliases);
      const paisesPerdidos = result.byPais
        .filter(p => p.captureIndex < 30 && p.totalPn > 1000)
        .sort((a, b) => b.totalPn - a.totalPn);
      return {
        rawAnswer: paisesPerdidos.length > 0
          ? `CALIRAL tiene participación baja (<30%) en ${paisesPerdidos.length} país(es) donde NIREA exporta volumen significativo.`
          : `CALIRAL mantiene participación saludable en todos los países donde NIREA exporta.`,
        blocks: [
          {
            type: 'list',
            title: 'Países con baja participación de CALIRAL',
            items: paisesPerdidos.slice(0, 10).map(p => ({
              label: p.label,
              value: p.captureIndex.toFixed(1) + '%',
              detail: `${fmtT(p.totalPn)} totales — oportunidad de captura`,
              severity: 'opportunity' as const,
            })),
          },
          {
            type: 'recommendation',
            title: 'Acción sugerida',
            text: `Contactar al departamento comercial para abordar ${paisesPerdidos.length} mercado(s) con baja participación. Volumen total en riesgo: ${fmtT(paisesPerdidos.reduce((s, p) => s + (p.totalPn - p.caliralPn), 0))}.`,
          },
        ],
      };
    }

    case 'clientes_otros_depositos': {
      const NIREA = CLIENTES_ESTRATEGICOS.find(c => c.id === 'NIREA')!;
      const result = computeCapturaCaliral(data.nacional, NIREA.aliases);
      const competidores = result.byCertificador
        .filter(c => !c.label.toUpperCase().includes('CALIRAL') && c.totalPn > 1000)
        .sort((a, b) => b.totalPn - a.totalPn);
      return {
        rawAnswer: `${NIREA.name} utiliza ${result.competidores.length} certificador(es) además de CALIRAL. Principal competidor: ${competidores[0]?.label || '—'} (${competidores[0] ? fmtT(competidores[0].totalPn) : '—'}).`,
        blocks: [
          {
            type: 'list',
            title: 'Certificadores competidores',
            items: competidores.slice(0, 10).map(c => ({
              label: c.label,
              value: fmtT(c.totalPn),
              detail: `${c.registros} registros • ${(100 - c.captureIndex).toFixed(1)}% del volumen de NIREA`,
              severity: 'warning' as const,
            })),
          },
        ],
      };
    }

    case 'oportunidades': {
      const NIREA = CLIENTES_ESTRATEGICOS.find(c => c.id === 'NIREA')!;
      const result = computeCapturaCaliral(data.nacional, NIREA.aliases);
      const oppPaises = result.byPais.filter(p => p.captureIndex < 30 && p.totalPn > 5000);
      const oppCortes = result.byCorte.filter(c => c.captureIndex < 30 && c.totalPn > 5000);
      return {
        rawAnswer: `Se detectaron ${oppPaises.length} oportunidad(es) en países y ${oppCortes.length} en cortes donde CALIRAL tiene baja participación con volumen significativo de NIREA.`,
        blocks: [
          {
            type: 'list',
            title: 'Oportunidades por país',
            items: oppPaises.slice(0, 8).map(p => ({
              label: p.label,
              value: fmtT(p.totalPn - p.caliralPn),
              detail: `Captura actual: ${p.captureIndex.toFixed(1)}% — volumen no capturado`,
              severity: 'opportunity' as const,
            })),
          },
          {
            type: 'list',
            title: 'Oportunidades por corte',
            items: oppCortes.slice(0, 8).map(c => ({
              label: c.label,
              value: fmtT(c.totalPn - c.caliralPn),
              detail: `Captura actual: ${c.captureIndex.toFixed(1)}%`,
              severity: 'opportunity' as const,
            })),
          },
          {
            type: 'recommendation',
            title: 'Acciones sugeridas',
            text: `1. Abordar comercialmente ${oppPaises.length} país(es) con baja captura. 2. Diversificar oferta de cortes en ${oppCortes.length} categoría(s). 3. Preparar propuesta de captura para volumen no gestionado: ${fmtT(oppPaises.reduce((s, p) => s + (p.totalPn - p.caliralPn), 0))}.`,
          },
        ],
      };
    }

    case 'libre':
    default: {
      const q = (freeText || '').toLowerCase();
      const matches = stock.filter(s =>
        s.cote.toLowerCase().includes(q) ||
        s.deposito.toLowerCase().includes(q) ||
        s.productor.toLowerCase().includes(q) ||
        s.corte.toLowerCase().includes(q)
      ).slice(0, 10);
      return {
        rawAnswer: matches.length > 0
          ? `Se encontraron ${matches.length} resultado(s) para "${freeText}".`
          : `No se encontraron resultados para "${freeText}". Probá con un COTE, productor o depósito.`,
        blocks: matches.length > 0 ? [{
          type: 'list',
          title: 'Resultados de búsqueda',
          items: matches.map(s => ({
            label: `${s.cote} — ${s.deposito}`,
            value: fmt(s.pesoNeto) + ' kg',
            detail: `${s.productor} • ${s.corte}`,
            severity: 'neutral' as const,
          })),
        }] : [{ type: 'empty', title: 'Sin resultados', text: 'No se encontró mercadería que coincida.' }],
      };
    }
  }
}
