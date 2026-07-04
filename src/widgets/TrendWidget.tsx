'use client';

// ============================================================
// TrendWidget — Mini gráfico de tendencia (sparkline + barras)
// ============================================================

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface TrendPoint {
  label: string;
  value: number;
}

interface Props {
  data: TrendPoint[];
  className?: string;
  height?: number;
  color?: string;
  showAxis?: boolean;
  formatValue?: (v: number) => string;
}

export function TrendWidget({
  data,
  className,
  height = 80,
  color = '#8b5cf6',
  showAxis = false,
  formatValue = (v) => v.toLocaleString('es-UY'),
}: Props) {
  if (data.length === 0) {
    return <div className={cn('text-center py-6 text-sm text-slate-500', className)}>Sin datos suficientes.</div>;
  }
  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;
  const width = 100;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  // Polyline points for sparkline
  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = height - ((d.value - min) / range) * (height - 8) - 4;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  const last = data[data.length - 1];
  const first = data[0];
  const change = first.value === 0 ? 0 : ((last.value - first.value) / first.value) * 100;
  const up = change >= 0;

  return (
    <div className={cn('', className)}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {first.label} → {last.label}
        </span>
        <div className="flex items-center gap-1">
          {up ? <TrendingUp className="w-3 h-3 text-emerald-600" /> : <TrendingDown className="w-3 h-3 text-red-600" />}
          <span className={cn('text-xs font-semibold tabular-nums', up ? 'text-emerald-600' : 'text-red-600')}>
            {up ? '+' : ''}{change.toFixed(1)}%
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Área bajo la curva */}
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={`url(#grad-${color.replace('#', '')})`}
        />
        {/* Línea */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Punto final */}
        {data.length > 0 && (
          <circle
            cx={width}
            cy={height - ((last.value - min) / range) * (height - 8) - 4}
            r="1.8"
            fill={color}
          />
        )}
      </svg>
      {showAxis && (
        <div className="flex justify-between mt-1 text-[10px] text-slate-400">
          {data.filter((_, i) => i % Math.ceil(data.length / 6) === 0).map((d, i) => (
            <span key={i}>{d.label}</span>
          ))}
        </div>
      )}
      <div className="flex justify-between mt-1 text-[10px] text-slate-400">
        <span>{formatValue(first.value)}</span>
        <span className="font-semibold text-slate-600 dark:text-slate-300">{formatValue(last.value)}</span>
      </div>
    </div>
  );
}
