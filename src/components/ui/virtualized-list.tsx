// ============================================================
// VirtualizedList — Wrapper sobre @tanstack/react-virtual
// ------------------------------------------------------------
// Componente reutilizable para virtualizar listas/tablas grandes.
// Renderiza solo los items visibles en el viewport + overscan.
// ============================================================

'use client';
import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualizedListProps<T> {
  items: T[];
  /** Altura estimada de cada item en px. */
  estimateSize: number;
  /** Renderiza un item. Recibe el item y el index global. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Altura total del contenedor en px. Default: 600. */
  containerHeight?: number;
  /** Número de items extra a renderizar fuera del viewport. Default: 5. */
  overscan?: number;
  /** className del contenedor scrollable. */
  className?: string;
}

export function VirtualizedList<T>({
  items, estimateSize, renderItem,
  containerHeight = 600, overscan = 5, className,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return (
    <div
      ref={parentRef}
      style={{ height: containerHeight, overflow: 'auto' }}
      className={className}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
