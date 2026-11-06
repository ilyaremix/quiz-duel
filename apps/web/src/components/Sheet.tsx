import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

/** Скорость свайпа вниз (px/мс), после которой шторка закрывается - как в прототипе. */
const CLOSE_VELOCITY = 0.45;
const EXIT_MS = 240;

interface SheetProps {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

interface Drag {
  id: number;
  y0: number;
  active: boolean;
  samples: { y: number; t: number }[];
}

/**
 * Нижняя шторка: вход 380 мс, выход 240 мс по кривой шторки.
 * Закрывается тапом по фону или быстрым свайпом вниз - по скорости жеста, а не по пройденному расстоянию.
 */
export function Sheet({ open, label, onClose, children }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      setDragY(0);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
      setDragY(0);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  if (!mounted) return null;

  const down = (e: PointerEvent<HTMLElement>) => {
    if (leaving) return;
    drag.current = { id: e.pointerId, y0: e.clientY, active: false, samples: [{ y: e.clientY, t: performance.now() }] };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    if (!d.active) {
      // Порог 6 px: короткий тап по кнопке внутри шторки остаётся тапом.
      if (dy < 6) return;
      d.active = true;
      try {
        e.currentTarget.setPointerCapture(d.id);
      } catch {
        /* без захвата тоже работает */
      }
    }
    d.samples.push({ y: e.clientY, t: performance.now() });
    if (d.samples.length > 6) d.samples.shift();
    setDragY(Math.max(0, dy));
    setDragging(true);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    const a = d.samples[0]!;
    const b = d.samples[d.samples.length - 1]!;
    const velocity = (b.y - a.y) / Math.max(1, b.t - a.t);
    setDragging(false);
    if (velocity > CLOSE_VELOCITY) onClose();
    else setDragY(0);
  };

  return (
    <div className="fixed inset-0 z-30">
      <div
        aria-hidden="true"
        className={leaving ? 'qd-backdrop-out absolute inset-0' : 'qd-backdrop-in absolute inset-0'}
        style={{ background: 'var(--qd-scrim)' }}
        onClick={onClose}
      />
      <div
        className="qd-sheet-drag absolute inset-x-0 bottom-0"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 300ms var(--qd-ease-sheet)',
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={`${leaving ? 'qd-sheet-out' : 'qd-sheet-in'} mx-auto box-border flex max-w-[560px] flex-col gap-4 rounded-t-[28px] bg-bg px-4 pt-2.5 text-text`}
          style={{ paddingBottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 32px)' }}
        >
          <div aria-hidden="true" className="h-[5px] w-10 self-center rounded-[3px] bg-surface-2" />
          {children}
        </section>
      </div>
    </div>
  );
}
