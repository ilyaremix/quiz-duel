import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

/** Скорость свайпа вниз (px/мс), после которой шторка закрывается - как в прототипе. */
const CLOSE_VELOCITY = 0.45;
const EXIT_MS = 240;

interface SheetProps {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** Главная кнопка: всегда видна внизу, даже когда содержимое листается. */
  footer?: ReactNode;
}

interface Drag {
  id: number;
  y0: number;
  active: boolean;
  samples: { y: number; t: number }[];
}

/** Отступ снизу: полоска «домой» на iPhone и 32 px воздуха. */
const SAFE_BOTTOM = 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 32px)';

/** Выше шторка не поднимается: под вырезом и кнопками Telegram остаётся зазор. */
const MAX_HEIGHT =
  'calc(var(--tg-viewport-height, 100dvh) - var(--tg-viewport-safe-area-inset-top, 0px) - var(--tg-viewport-content-safe-area-inset-top, 0px) - 12px)';

/**
 * Нижняя шторка - плотное стекло со скруглением 32 px: вход 380 мс, выход 240 мс по кривой шторки.
 * Закрывается тапом по фону или быстрым свайпом вниз - по скорости жеста, а не по пройденному расстоянию.
 * Не помещается на экран (маленький телефон, длинный список) - содержимое листается, а тянуть вниз
 * можно за полоску сверху и за кнопку внизу.
 */
export function Sheet({ open, label, onClose, children, footer }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const drag = useRef<Drag | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);

  // Содержимое выше экрана? Следим за размером: список может дорасти после загрузки (платные темы).
  useLayoutEffect(() => {
    const box = body.current;
    const inner = content.current;
    if (!mounted || !box || !inner) return;
    const check = () => setScrollable(box.scrollHeight > box.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(inner);
    ro.observe(box);
    return () => ro.disconnect();
  }, [mounted]);

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
    // Длинная шторка листается пальцем, поэтому свайп закрытия - с полоски сверху или с кнопки внизу.
    if (scrollable && (e.target as Element).closest('.qd-sheet-body')) return;
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
          className={`${leaving ? 'qd-sheet-out' : 'qd-sheet-in'} qd-sheet mx-auto box-border flex max-w-[560px] flex-col rounded-t-[32px] px-4 pt-2.5 text-text`}
          style={{ maxHeight: MAX_HEIGHT, touchAction: 'none' }}
        >
          <div aria-hidden="true" className="-mx-4 -mt-2.5 flex shrink-0 justify-center pt-2.5 pb-4">
            <div className="qd-grab" />
          </div>
          <div
            ref={body}
            className="qd-sheet-body -mx-4 flex min-h-0 flex-col overflow-y-auto overscroll-contain px-4"
            style={
              {
                // Помещается - палец не листает, а тянет шторку (свайп закрытия по всей шторке).
                touchAction: scrollable ? 'pan-y' : 'none',
                paddingBottom: footer ? 12 : SAFE_BOTTOM,
              } as CSSProperties
            }
          >
            <div ref={content} className="flex flex-col gap-4">
              {children}
            </div>
          </div>
          {footer && (
            <div className="shrink-0 pt-1" style={{ paddingBottom: SAFE_BOTTOM }}>
              {footer}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
