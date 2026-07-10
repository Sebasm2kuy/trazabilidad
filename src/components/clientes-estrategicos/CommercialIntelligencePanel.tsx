'use client';

// ============================================================
// CommercialIntelligencePanel — Panel de inteligencia comercial
// ------------------------------------------------------------
// Renderiza los 10 bloques de inteligencia comercial:
//   1. Executive Summary
//   2. Health Score
//   3. Evolución temporal
//   4. Oportunidad económica
//   5. Ranking de competidores
//   6. Diagnóstico automático
//   7. Clientes recuperables
//   8. Alertas inteligentes
//   9. Predicción
//  10. Acciones recomendadas
//
// Más la sección especial "¿Por qué estamos perdiendo este cliente?"
// ============================================================

import {
  AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Minus,
  Target, DollarSign, Users, Lightbulb, Activity, Brain,
  ArrowRight, Clock, CheckCircle2, XCircle, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CommercialIntelligenceResult, HealthLevel, AlertSeverity, TrendDirection, RecoveryProbability } from '@/intelligence-engine/commercialIntelligence';

interface Props {
  intelligence: CommercialIntelligenceResult;
  clienteName: string;
}

export function CommercialIntelligencePanel({ intelligence, clienteName }: Props) {
  return (
    <div className="space-y-6">
      {/* 1. EXECUTIVE SUMMARY */}
      <ExecutiveSummaryCard summary={intelligence.executiveSummary} health={intelligence.health} />

      {/* 2. HEALTH SCORE */}
      <HealthScoreCard health={intelligence.health} />

      {/* SECCIÓN ESPECIAL: ¿Por qué estamos perdiendo este cliente? */}
      <WhyLosingClientCard intelligence={intelligence} clienteName={clienteName} />

      {/* 3. EVOLUCIÓN TEMPORAL */}
      <TemporalEvolutionCard temporal={intelligence.temporal} />

      {/* 4. OPORTUNIDAD ECONÓMICA */}
      <EconomicOpportunityCard opportunity={intelligence.opportunity} />

      {/* 5. RANKING DE COMPETIDORES */}
      <CompetitorRankingCard competitors={intelligence.competitors} />

      {/* 6. DIAGNÓSTICO AUTOMÁTICO */}
      <DiagnosisCard diagnosis={intelligence.diagnosis} />

      {/* 7. CLIENTES RECUPERABLES */}
      <RecoverableClientsCard recoverable={intelligence.recoverable} />

      {/* 8. ALERTAS INTELIGENTES */}
      <SmartAlertsCard alerts={intelligence.alerts} />

      {/* 9. PREDICCIÓN */}
      <PredictionCard prediction={intelligence.prediction} />

      {/* 10. ACCIONES RECOMENDADAS */}
      <RecommendedActionsCard actions={intelligence.actions} />
    </div>
  );
}

// ============================================================
// 1. EXECUTIVE SUMMARY
// ============================================================

function ExecutiveSummaryCard({ summary, health }: { summary: string; health: { score: number; level: HealthLevel } }) {
  return (
    <Card className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white border-slate-700">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-violet-400" />
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
              Resumen Ejecutivo Automático
            </p>
          </div>
          <p className="text-sm leading-relaxed text-slate-100 whitespace-pre-line">
            {summary}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Score</p>
          <p className={cn('text-4xl font-bold tabular-nums',
            health.level === 'excelente' ? 'text-emerald-400' :
            health.level === 'bueno' ? 'text-blue-400' :
            health.level === 'riesgo' ? 'text-amber-400' :
            'text-red-400',
          )}>
            {health.score}
          </p>
          <p className="text-[10px] text-slate-500">/ 100</p>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// 2. HEALTH SCORE
// ============================================================

function HealthScoreCard({ health }: { health: import('@/intelligence-engine/commercialIntelligence').HealthScore }) {
  const levelConfig: Record<HealthLevel, { color: string; bg: string; label: string }> = {
    excelente: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-950/30', label: 'Excelente' },
    bueno: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-950/30', label: 'Bueno' },
    riesgo: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-950/30', label: 'Riesgo' },
    critico: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-950/30', label: 'Crítico' },
  };
  const cfg = levelConfig[health.level];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Health Score</h3>
        <Badge className={cn('text-[10px]', cfg.bg, cfg.color)} variant="secondary">{cfg.label}</Badge>
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{health.score}</span>
            <span className="text-sm text-slate-500">/ 100</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all',
                health.level === 'excelente' ? 'bg-emerald-500' :
                health.level === 'bueno' ? 'bg-blue-500' :
                health.level === 'riesgo' ? 'bg-amber-500' :
                'bg-red-500',
              )}
              style={{ width: `${health.score}%` }}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">{health.summary}</p>

      {/* Factores */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase font-semibold text-slate-500 mb-2">Factores del score</p>
        {health.factors.map(f => (
          <div key={f.code} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3 py-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{f.label}</span>
              <span className="text-xs font-mono text-slate-500">
                {f.value.toFixed(0)} × {f.weight.toFixed(0)}% = <strong className={cn(f.value >= 50 ? 'text-emerald-600' : 'text-amber-600')}>{f.contribution.toFixed(1)}</strong>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{f.explanation}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ============================================================
// SECCIÓN ESPECIAL: ¿Por qué estamos perdiendo este cliente?
// ============================================================

function WhyLosingClientCard({ intelligence, clienteName }: { intelligence: CommercialIntelligenceResult; clienteName: string }) {
  const { diagnosis, health } = intelligence;

  // Construir narrativa automática
  const narrative: string[] = [];

  // 1. ¿Sigue usando depósitos?
  const depositWithoutCert = diagnosis.find(d => d.code === 'deposit_without_cert');
  const fullFlow = diagnosis.find(d => d.code === 'full_caliral_flow');
  if (depositWithoutCert) {
    narrative.push(`El cliente continúa utilizando depósitos CALIRAL.`);
    narrative.push(`Sin embargo certifica con otro organismo.`);
    narrative.push(`No existe un problema logístico.`);
  } else if (fullFlow) {
    narrative.push(`El cliente mantiene flujo completo con CALIRAL (depósito + certificación).`);
  } else {
    narrative.push(`El cliente no utiliza depósitos CALIRAL.`);
  }

  // 2. ¿Cuándo empezó la caída?
  const dropStart = diagnosis.find(d => d.code === 'drop_start');
  if (dropStart) {
    narrative.push(`La pérdida comenzó en ${dropStart.title.replace('Caída comenzó en ', '')}.`);
  }

  // 3. ¿Competidor dominante?
  const competitorDominant = diagnosis.find(d => d.code === 'competitor_dominant');
  if (competitorDominant) {
    narrative.push(`El competidor dominante es ${competitorDominant.title.replace('Competidor dominante: ', '')}.`);
  }

  // 4. ¿Mercado específico?
  const lossByMarket = diagnosis.find(d => d.code === 'loss_by_market');
  if (lossByMarket) {
    narrative.push(`La pérdida ocurre específicamente hacia ${lossByMarket.title.replace('Pérdida concentrada en ', '')}.`);
  }

  // 5. ¿Problema comercial u operativo?
  const commercialProblem = diagnosis.find(d => d.code === 'commercial_problem');
  if (commercialProblem) {
    narrative.push(`La hipótesis más probable es una pérdida comercial (no operativa).`);
  }

  // 6. Valor económico
  if (intelligence.opportunity.recoverableTons > 0) {
    narrative.push(`La pérdida potencial asciende a ${(intelligence.opportunity.recoverableTons).toFixed(1)} toneladas (≈ USD ${intelligence.opportunity.estimatedValueUsd.toLocaleString('es-UY', { maximumFractionDigits: 0 })}).`);
  }

  if (health.level === 'excelente' || health.level === 'bueno') {
    narrative.unshift(`No estamos perdiendo a ${clienteName}. La relación es ${health.level === 'excelente' ? 'sólida' : 'aceptable'}.`);
  }

  return (
    <Card className="p-5 border-l-4 border-l-violet-500 bg-violet-50/30 dark:bg-violet-950/10">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          ¿Por qué estamos perdiendo a {clienteName}?
        </h3>
      </div>
      <div className="space-y-2">
        {narrative.map((line, i) => (
          <p key={i} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {line}
          </p>
        ))}
      </div>
      {diagnosis.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-violet-600 cursor-pointer hover:underline">
            Ver evidencia ({diagnosis.length} hallazgos)
          </summary>
          <div className="mt-2 space-y-1">
            {diagnosis.map(d => (
              <p key={d.code} className="text-[11px] text-slate-500 dark:text-slate-400 border-l-2 border-slate-200 dark:border-slate-700 pl-2">
                <strong>{d.title}:</strong> {d.evidence}
              </p>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

// ============================================================
// 3. EVOLUCIÓN TEMPORAL
// ============================================================

function TemporalEvolutionCard({ temporal }: { temporal: import('@/intelligence-engine/commercialIntelligence').TemporalEvolution }) {
  const trendIcon = temporal.trend === 'subiendo' ? <TrendingUp className="w-4 h-4 text-emerald-600" /> :
                    temporal.trend === 'bajando' ? <TrendingDown className="w-4 h-4 text-red-600" /> :
                    <Minus className="w-4 h-4 text-slate-400" />;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Evolución temporal</h3>
        <div className="ml-auto flex items-center gap-1">{trendIcon}</div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase text-slate-500 font-semibold">vs Período anterior</p>
          <p className={cn('text-lg font-bold tabular-nums',
            temporal.vsPreviousPeriod === null ? 'text-slate-400' :
            temporal.vsPreviousPeriod > 0 ? 'text-emerald-600' : 'text-red-600',
          )}>
            {temporal.vsPreviousPeriod === null ? '—' : `${temporal.vsPreviousPeriod > 0 ? '+' : ''}${temporal.vsPreviousPeriod.toFixed(1)}p`}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-slate-500 font-semibold">vs Año anterior</p>
          <p className={cn('text-lg font-bold tabular-nums',
            temporal.vsSamePeriodLastYear === null ? 'text-slate-400' :
            temporal.vsSamePeriodLastYear > 0 ? 'text-emerald-600' : 'text-red-600',
          )}>
            {temporal.vsSamePeriodLastYear === null ? '—' : `${temporal.vsSamePeriodLastYear > 0 ? '+' : ''}${temporal.vsSamePeriodLastYear.toFixed(1)}p`}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-slate-500 font-semibold">Tendencia</p>
          <p className={cn('text-lg font-bold',
            temporal.trend === 'subiendo' ? 'text-emerald-600' :
            temporal.trend === 'bajando' ? 'text-red-600' : 'text-slate-500',
          )}>
            {temporal.trend === 'subiendo' ? '↑' : temporal.trend === 'bajando' ? '↓' : '→'}
          </p>
        </div>
      </div>

      {/* Interpretación */}
      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 mb-3">
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <Lightbulb className="w-3 h-3 inline mr-1 text-violet-500" />
          {temporal.interpretation}
        </p>
      </div>

      {/* Mini-gráfico de barras */}
      {temporal.monthlyCapture.length > 0 && (
        <div>
          <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2">Captura mensual (%)</p>
          <div className="flex items-end gap-1 h-20">
            {temporal.monthlyCapture.slice(-12).map(m => {
              const height = Math.max(2, m.capturePct);
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-0.5" title={`${m.label}: ${m.capturePct.toFixed(1)}%`}>
                  <div
                    className={cn('w-full rounded-t',
                      m.capturePct > 50 ? 'bg-emerald-500' :
                      m.capturePct > 25 ? 'bg-amber-500' :
                      m.capturePct > 0 ? 'bg-red-400' : 'bg-slate-200',
                    )}
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-[8px] text-slate-400 rotate-45 origin-left whitespace-nowrap">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// 4. OPORTUNIDAD ECONÓMICA
// ============================================================

function EconomicOpportunityCard({ opportunity }: { opportunity: import('@/intelligence-engine/commercialIntelligence').EconomicOpportunity }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Oportunidad económica</h3>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3">
          <p className="text-[10px] uppercase text-emerald-700 dark:text-emerald-300 font-semibold">Toneladas recuperables</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {opportunity.recoverableTons.toLocaleString('es-UY', { maximumFractionDigits: 1 })}
          </p>
          <p className="text-[10px] text-slate-500">toneladas</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
          <p className="text-[10px] uppercase text-blue-700 dark:text-blue-300 font-semibold">Valor potencial</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">
            USD {opportunity.estimatedValueUsd.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-slate-500">@ USD {opportunity.pricePerTonUsd.toLocaleString('es-UY')}/t</p>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">{opportunity.explanation}</p>

      {opportunity.breakdown.length > 0 && (
        <div>
          <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2">Desglose de oportunidades</p>
          <div className="space-y-1">
            {opportunity.breakdown.slice(0, 8).map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="text-slate-700 dark:text-slate-200">{b.label}</span>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-slate-500">{b.tons.toFixed(1)} t</span>
                  <span className="text-blue-600 font-semibold">USD {b.valueUsd.toLocaleString('es-UY', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// 5. RANKING DE COMPETIDORES
// ============================================================

function CompetitorRankingCard({ competitors }: { competitors: import('@/intelligence-engine/commercialIntelligence').CompetitorInfo[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ranking de competidores</h3>
      </div>

      <div className="space-y-2">
        {competitors.slice(0, 8).map(c => {
          const trendIcon = c.trend === 'subiendo' ? <TrendingUp className="w-3 h-3 text-emerald-600" /> :
                           c.trend === 'bajando' ? <TrendingDown className="w-3 h-3 text-red-600" /> :
                           <Minus className="w-3 h-3 text-slate-400" />;
          return (
            <div key={c.name} className={cn(
              'flex items-center gap-3 p-2 rounded-lg',
              c.isCaliral ? 'bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900' : '',
            )}>
              <span className="text-xs font-bold text-slate-400 tabular-nums w-6">#{c.rank}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
                  {c.isCaliral && <Badge variant="secondary" className="text-[9px]">CALIRAL</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-500 tabular-nums">{c.tons.toFixed(1)} t</span>
                  <span className="text-[10px] text-slate-400">·</span>
                  <span className="text-[10px] font-semibold text-slate-600 tabular-nums">{c.sharePct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="flex items-center gap-1">{trendIcon}</div>
            </div>
          );
        })}
      </div>

      {/* Barra de participación */}
      {competitors.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2">Participación de mercado</p>
          <div className="flex h-3 rounded-full overflow-hidden">
            {competitors.slice(0, 8).map(c => (
              <div
                key={c.name}
                className={cn(
                  c.isCaliral ? 'bg-violet-500' :
                  c.rank === 1 ? 'bg-blue-500' :
                  c.rank === 2 ? 'bg-blue-400' :
                  c.rank === 3 ? 'bg-amber-500' :
                  'bg-slate-300',
                )}
                style={{ width: `${c.sharePct}%` }}
                title={`${c.name}: ${c.sharePct.toFixed(1)}%`}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// 6. DIAGNÓSTICO AUTOMÁTICO
// ============================================================

function DiagnosisCard({ diagnosis }: { diagnosis: import('@/intelligence-engine/commercialIntelligence').DiagnosisFinding[] }) {
  if (diagnosis.length === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-4 h-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Diagnóstico automático</h3>
        </div>
        <p className="text-xs text-slate-500">Sin hallazgos significativos.</p>
      </Card>
    );
  }

  const severityConfig = {
    positive: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
    warning: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/20' },
    negative: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/20' },
    neutral: { icon: Activity, color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-900/30' },
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Diagnóstico automático</h3>
      </div>

      <div className="space-y-3">
        {diagnosis.map(d => {
          const cfg = severityConfig[d.severity];
          const Icon = cfg.icon;
          return (
            <div key={d.code} className={cn('rounded-lg p-3', cfg.bg)}>
              <div className="flex items-start gap-2">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', cfg.color)} />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1">{d.title}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{d.detail}</p>
                  <p className="text-[10px] text-slate-400 mt-1 italic">📊 {d.evidence}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================
// 7. CLIENTES RECUPERABLES
// ============================================================

function RecoverableClientsCard({ recoverable }: { recoverable: import('@/intelligence-engine/commercialIntelligence').RecoverableClient[] }) {
  const probConfig: Record<RecoveryProbability, { color: string; bg: string; label: string }> = {
    alta: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-950/30', label: 'Alta' },
    media: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-950/30', label: 'Media' },
    baja: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-950/30', label: 'Baja' },
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Clientes recuperables</h3>
      </div>

      <div className="space-y-3">
        {recoverable.map((c, i) => {
          const cfg = probConfig[c.probability];
          return (
            <div key={i} className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{c.name}</span>
                <Badge className={cn('text-[10px]', cfg.bg, cfg.color)} variant="secondary">
                  Probabilidad {cfg.label}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Última actividad</p>
                  <p className="text-xs font-mono text-slate-700 dark:text-slate-200">{c.lastCaliralMonth ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Meses sin actividad</p>
                  <p className="text-xs font-mono text-slate-700 dark:text-slate-200">{c.monthsSinceLast >= 0 ? c.monthsSinceLast : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Toneladas perdidas</p>
                  <p className="text-xs font-mono text-slate-700 dark:text-slate-200">{c.lostTons.toFixed(1)} t</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{c.reason}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================
// 8. ALERTAS INTELIGENTES
// ============================================================

function SmartAlertsCard({ alerts }: { alerts: import('@/intelligence-engine/commercialIntelligence').SmartAlert[] }) {
  if (alerts.length === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Alertas inteligentes</h3>
        </div>
        <p className="text-xs text-slate-500">Sin alertas. Todo en orden.</p>
      </Card>
    );
  }

  const severityConfig: Record<AlertSeverity, { color: string; bg: string; border: string; label: string }> = {
    critica: { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-300 dark:border-red-900', label: 'CRÍTICA' },
    alta: { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-300 dark:border-amber-900', label: 'ALTA' },
    media: { color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-300 dark:border-blue-900', label: 'MEDIA' },
    baja: { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-900/30', border: 'border-slate-300 dark:border-slate-700', label: 'BAJA' },
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Alertas inteligentes</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">{alerts.length}</Badge>
      </div>

      <div className="space-y-2">
        {alerts.map(a => {
          const cfg = severityConfig[a.severity];
          return (
            <div key={a.id} className={cn('rounded-lg border p-3', cfg.bg, cfg.border)}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{a.title}</span>
                <Badge variant="outline" className={cn('text-[9px] shrink-0', cfg.color)}>{cfg.label}</Badge>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-1">{a.detail}</p>
              <div className="flex items-start gap-3 mt-2">
                <div className="flex-1">
                  <p className="text-[10px] text-slate-500"><strong>Impacto:</strong> {a.impact}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-[10px] text-violet-600 dark:text-violet-400">
                  <ArrowRight className="w-3 h-3 inline mr-1" />
                  <strong>Acción:</strong> {a.action}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================
// 9. PREDICCIÓN
// ============================================================

function PredictionCard({ prediction }: { prediction: import('@/intelligence-engine/commercialIntelligence').PredictionResult }) {
  const trendIcon = prediction.trend === 'subiendo' ? <TrendingUp className="w-4 h-4 text-emerald-600" /> :
                    prediction.trend === 'bajando' ? <TrendingDown className="w-4 h-4 text-red-600" /> :
                    <Minus className="w-4 h-4 text-slate-400" />;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Predicción (3 meses)</h3>
        <div className="ml-auto flex items-center gap-1">{trendIcon}</div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500 font-semibold">Pesimista</p>
          <p className="text-xl font-bold text-red-600 tabular-nums">{prediction.pessimisticPct.toFixed(1)}%</p>
        </div>
        <div className="bg-violet-50 dark:bg-violet-950/20 rounded-lg p-3 text-center border-2 border-violet-200 dark:border-violet-800">
          <p className="text-[10px] uppercase text-violet-700 dark:text-violet-300 font-semibold">Esperada</p>
          <p className="text-xl font-bold text-violet-700 dark:text-violet-300 tabular-nums">{prediction.expectedCapturePct.toFixed(1)}%</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500 font-semibold">Optimista</p>
          <p className="text-xl font-bold text-emerald-600 tabular-nums">{prediction.optimisticPct.toFixed(1)}%</p>
        </div>
      </div>

      {/* Confianza */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
          <span>Confianza del modelo</span>
          <span className="font-mono">{(prediction.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full',
              prediction.confidence > 0.7 ? 'bg-emerald-500' :
              prediction.confidence > 0.4 ? 'bg-amber-500' : 'bg-red-400',
            )}
            style={{ width: `${prediction.confidence * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <Lightbulb className="w-3 h-3 inline mr-1 text-violet-500" />
          {prediction.explanation}
        </p>
      </div>
    </Card>
  );
}

// ============================================================
// 10. ACCIONES RECOMENDADAS
// ============================================================

function RecommendedActionsCard({ actions }: { actions: import('@/intelligence-engine/commercialIntelligence').RecommendedAction[] }) {
  if (actions.length === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-4 h-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Acciones recomendadas</h3>
        </div>
        <p className="text-xs text-slate-500">Sin acciones pendientes.</p>
      </Card>
    );
  }

  const priorityConfig = {
    critica: { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-300 dark:border-red-900', label: 'CRÍTICA' },
    alta: { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-300 dark:border-amber-900', label: 'ALTA' },
    media: { color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-300 dark:border-blue-900', label: 'MEDIA' },
    baja: { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-900/30', border: 'border-slate-300 dark:border-slate-700', label: 'BAJA' },
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Acciones recomendadas</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">{actions.length}</Badge>
      </div>

      <div className="space-y-2">
        {actions.map(a => {
          const cfg = priorityConfig[a.priority];
          return (
            <div key={a.id} className={cn('rounded-lg border p-3', cfg.bg, cfg.border)}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex-1">{a.title}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="outline" className={cn('text-[9px]', cfg.color)}>{cfg.label}</Badge>
                  <Badge variant="outline" className="text-[9px] text-slate-500">
                    <Clock className="w-2.5 h-2.5 mr-0.5" />
                    {a.deadline}
                  </Badge>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-1">{a.detail}</p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                <ArrowRight className="w-3 h-3 inline mr-1" />
                <strong>Impacto esperado:</strong> {a.expectedImpact}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
