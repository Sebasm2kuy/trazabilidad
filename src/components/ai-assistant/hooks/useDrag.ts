// ============================================================
// useDrag — Hook para arrastrar el ChatWindow
// ------------------------------------------------------------
// Encapsula toda la lógica de drag & drop de la ventana flotante.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';

interface Position { x: number; y: number; }
interface Offset { x: number; y: number; }

interface UseDragOptions {
  /** Ancho del ventana, para clamp horizontal. */
  width?: number;
  /** Posición inicial. */
  initialPosition?: Position;
  /** Si true, deshabilita el drag (ej: cuando está minimizado). */
  disabled?: boolean;
}

interface UseDragReturn {
  position: Position;
  dragging: boolean;
  dragRef: React.RefObject<HTMLDivElement | null>;
  handleMouseDown: (e: React.MouseEvent) => void;
}

export function useDrag(opts: UseDragOptions = {}): UseDragReturn {
  const { width = 400, initialPosition, disabled = false } = opts;
  const [position, setPosition] = useState<Position>(
    initialPosition ?? { x: typeof window !== 'undefined' ? window.innerWidth - 420 : 0, y: 100 },
  );
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Offset>({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    setDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [disabled, position.x, position.y]);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - width, e.clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };
    const handleMouseUp = () => setDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, dragOffset, width]);

  return { position, dragging, dragRef, handleMouseDown };
}
