/**
 * Графики админки: один тон (--qd-chart), тонкие столбики со скруглением 4 px сверху, линия 2 px,
 * сетка - волосяные линии. Подсказка - по наведению или нажатию, без неё подписан последний столбик.
 * Текст - цветами текста, цвет графика только у самих отметок.
 */
import { useLayoutEffect, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Delta, SeriesPoint } from '@quiz-duel/shared';
import { Icon, type IconGlyph } from './Icon';

/** Верх шкалы - ближайшее «круглое» сверху: 1, 2, 3, 4, 5, 6, 8, 10 × 10ⁿ. */
export function niceTop(x: number): number {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / e;
  return ([1, 2, 3, 4, 5, 6, 8, 10].find((m) => m >= f - 1e-9) ?? 10) * e;
}

export function useNum() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return (n: number, digits = 1) => new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(n);
}

/** Ширина блока в px: линейному графику нужны настоящие координаты (иначе линия растянется). */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

const HINT = 'var(--tg-theme-hint-color)';

function Tip({ value, label, style }: { value: string; label: string; style: CSSProperties }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-[2] flex -translate-x-1/2 items-baseline gap-1.5 rounded-[12px] px-[9px] py-1 whitespace-nowrap"
      style={{ background: 'var(--qd-glass-solid)', boxShadow: 'inset 0 0 0 1px var(--qd-glass-rim), 0 6px 16px rgba(0, 0, 0, 0.25)', ...style }}
    >
      <strong className="qd-num text-[13px] font-bold">{value}</strong>
      <span className="qd-num text-[11px] font-semibold" style={{ color: HINT }}>
        {label}
      </span>
    </div>
  );
}

/** Мышь ушла - подсказка пропадает; палец - остаётся на выбранном столбике. */
const leaveFor = (clear: () => void) => (e: PointerEvent) => {
  if (e.pointerType === 'mouse') clear();
};

export function ChartEmpty({ height }: { height: number }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center justify-center rounded-[16px] text-[13px] font-medium"
      style={{ height, color: HINT, background: 'var(--qd-chart-track)' }}
    >
      {t('adm.empty')}
    </div>
  );
}

/** Столбики по дням: шкала 0 / половина / верх, подписи дат - первая, середина, последняя. */
export function Bars({ data, label, height = 130, unit = '' }: { data: SeriesPoint[]; label: string; height?: number; unit?: string }) {
  const { t } = useTranslation();
  const num = useNum();
  const [hi, setHi] = useState(-1);
  const n = data.length;
  if (!n || data.every((p) => p.v === 0)) return <ChartEmpty height={height + 52} />;

  const T0 = 30;
  const H = height;
  const max = Math.max(...data.map((p) => p.v));
  const whole = data.every((p) => Number.isInteger(p.v));
  // Целые числа: шкала не мельче 0 / 1 / 2, чтобы не было делений «0,5 игрока».
  const top = Math.max(niceTop(max), whole ? 2 : 0);
  const short = (v: number) => (top >= 10_000 ? `${num(Math.round(v / 100) / 10)}${t('adm.thousand')}` : num(v));
  const ticks = [0, top / 2, top].map((v) => ({ y: Math.round(T0 + H - (v / top) * H), label: short(v) }));
  const sel = hi >= 0 && hi < n ? hi : n - 1;
  const heights = data.map((p) => Math.max(2, Math.round((p.v / top) * H)));
  const min = Math.min(...data.map((p) => p.v));
  const tipX = Math.min(0.88, Math.max(0.12, (sel + 0.5) / n));

  return (
    <div
      role="group"
      aria-label={t('adm.chart.aria', { name: label, min: num(min) + unit, max: num(max) + unit, last: num(data[n - 1]!.v) + unit })}
      className="relative w-full"
      style={{ height: T0 + H + 22 }}
    >
      {ticks.map((tk) => (
        <div key={tk.y} aria-hidden="true">
          <div className="absolute right-0 left-10 h-px" style={{ top: tk.y, background: 'var(--qd-chart-grid)' }} />
          <span className="qd-num absolute left-0 w-[34px] text-right text-[11px] leading-[14px] font-semibold" style={{ top: tk.y - 7, color: HINT }}>
            {tk.label}
          </span>
        </div>
      ))}
      <div className="absolute right-0 left-10 flex items-end gap-[2px]" style={{ top: T0, height: H }}>
        {data.map((p, i) => (
          <button
            key={`${p.d}-${i}`}
            type="button"
            aria-label={`${p.d}: ${num(p.v)}${unit}`}
            onClick={() => setHi(i)}
            onPointerEnter={() => setHi(i)}
            onPointerLeave={leaveFor(() => setHi(-1))}
            onFocus={() => setHi(i)}
            onBlur={() => setHi(-1)}
            className="flex min-w-0 flex-1 basis-0 cursor-pointer items-end justify-center border-0 bg-transparent p-0"
            style={{ height: H + 30, marginTop: -30 }}
          >
            <span
              className="block w-full max-w-6 rounded-t-[4px]"
              style={{ height: heights[i], background: i === hi ? 'var(--qd-chart-hot)' : 'var(--qd-chart)', transition: 'background 120ms ease' }}
            />
          </button>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="qd-num absolute right-0 left-10 flex justify-between text-[11px] font-semibold"
        style={{ top: T0 + H + 6, color: HINT }}
      >
        <span>{data[0]!.d}</span>
        {n > 2 && <span>{data[Math.floor((n - 1) / 2)]!.d}</span>}
        {n > 1 && <span>{data[n - 1]!.d}</span>}
      </div>
      <Tip
        value={num(data[sel]!.v) + unit}
        label={data[sel]!.d}
        style={{ left: `calc(40px + (100% - 40px) * ${tipX})`, top: Math.max(0, T0 + H - heights[sel]! - 30) }}
      />
    </div>
  );
}

export interface LinePoint {
  /** Номер дня (кривая удержания) - иначе точки идут по порядку. */
  x?: number;
  d: string;
  v: number;
}

/** Линия 2 px с лёгкой заливкой, подпись последней точки, перекрестие и подсказка по нажатию. */
export function Line({ data, label, unit = '%', max, height = 120 }: { data: LinePoint[]; label: string; unit?: string; max?: number; height?: number }) {
  const { t } = useTranslation();
  const num = useNum();
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState(-1);
  const n = data.length;
  const T0 = 30;
  const H = height;
  if (n < 2) return <ChartEmpty height={H + 54} />;

  const L = 34;
  const R = Math.max(L + 10, W - 44);
  const xs = data.map((p, i) => p.x ?? i);
  const top = max ?? niceTop(Math.max(...data.map((p) => p.v)));
  const span = xs[n - 1]! - xs[0]! || 1;
  const X = (x: number) => L + ((x - xs[0]!) / span) * (R - L);
  const Y = (v: number) => T0 + H - (Math.min(v, top) / top) * H;
  const P = data.map((p, i) => [X(xs[i]!), Y(p.v)] as const);
  const f1 = (v: number) => Math.round(v * 10) / 10;
  const base = T0 + H;
  const pts = P.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
  const area = `M${f1(P[0]![0])},${base} L${P.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' L')} L${f1(P[n - 1]![0])},${base} Z`;
  const ticks = [0, top / 2, top].map((v) => ({ y: Math.round(Y(v)), label: num(v) + unit }));
  // Подпись посередине - у точки ближе всего к центру оси (дни удержания идут неравномерно),
  // и только если она не налезает на крайние.
  const center = (L + R) / 2;
  const mid = P.reduce((best, p, i) => (Math.abs(p[0] - center) < Math.abs(P[best]![0] - center) ? i : best), 0);
  const roomy = mid > 0 && mid < n - 1 && P[mid]![0] - L > 56 && R - P[mid]![0] > 56;
  const xl = roomy ? [0, mid, n - 1] : [0, n - 1];
  const last = P[n - 1]!;
  const values = data.map((p) => p.v);
  const h = hi >= 0 && hi < n ? hi : -1;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={t('adm.chart.aria', {
        name: label,
        min: num(Math.min(...values)) + unit,
        max: num(Math.max(...values)) + unit,
        last: num(values[n - 1]!) + unit,
      })}
      className="relative w-full"
      style={{ height: base + 24 }}
    >
      {W > 0 && (
        <>
          {ticks.map((tk) => (
            <div key={tk.y} aria-hidden="true">
              <div className="absolute h-px" style={{ left: L, width: R - L, top: tk.y, background: 'var(--qd-chart-grid)' }} />
              <span className="qd-num absolute left-0 w-7 text-right text-[11px] leading-[14px] font-semibold" style={{ top: tk.y - 7, color: HINT }}>
                {tk.label}
              </span>
            </div>
          ))}
          <svg width={W} height={base + 2} viewBox={`0 0 ${W} ${base + 2}`} aria-hidden="true" className="absolute top-0 left-0 overflow-visible">
            <path d={area} fill="var(--qd-chart)" fillOpacity={0.1} />
            <polyline points={pts} fill="none" stroke="var(--qd-chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={f1(last[0])} cy={f1(last[1])} r={4} fill="var(--qd-chart)" stroke="var(--qd-chart-ring)" strokeWidth={2} />
          </svg>
          {h >= 0 && (
            <>
              <div
                aria-hidden="true"
                className="absolute w-px"
                style={{ left: Math.round(P[h]![0]), top: T0, height: H, background: 'var(--qd-chart-cross)' }}
              />
              <div
                aria-hidden="true"
                className="absolute h-2.5 w-2.5 rounded-full"
                style={{
                  left: Math.round(P[h]![0] - 5),
                  top: Math.round(P[h]![1] - 5),
                  background: 'var(--qd-chart)',
                  boxShadow: '0 0 0 2px var(--qd-chart-ring)',
                }}
              />
            </>
          )}
          <span aria-hidden="true" className="qd-num absolute text-[13px] font-bold" style={{ left: Math.round(last[0] + 8), top: Math.round(last[1] - 9) }}>
            {num(values[n - 1]!) + unit}
          </span>
          {xl.map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className="qd-num absolute text-[11px] font-semibold whitespace-nowrap"
              style={{ left: Math.round(P[i]![0]), top: base + 6, color: HINT, transform: `translateX(${i === 0 ? '0' : i === n - 1 ? '-100%' : '-50%'})` }}
            >
              {data[i]!.d}
            </span>
          ))}
          {P.map(([x], i) => {
            // Зона нажатия - от середины до середины соседних точек, не уже 24 px.
            const a = i === 0 ? x - 12 : (P[i - 1]![0] + x) / 2;
            const b = i === n - 1 ? x + 12 : (x + P[i + 1]![0]) / 2;
            const w = Math.max(24, b - a);
            return (
              <button
                key={i}
                type="button"
                aria-label={`${data[i]!.d}: ${num(values[i]!)}${unit}`}
                onClick={() => setHi(i)}
                onPointerEnter={() => setHi(i)}
                onPointerLeave={leaveFor(() => setHi(-1))}
                onFocus={() => setHi(i)}
                onBlur={() => setHi(-1)}
                className="absolute top-0 cursor-crosshair border-0 bg-transparent p-0"
                style={{ left: Math.round((a + b) / 2 - w / 2), width: Math.round(w), height: base + 2 }}
              />
            );
          })}
          {h >= 0 && <Tip value={num(values[h]!) + unit} label={data[h]!.d} style={{ left: Math.round(Math.min(W - 50, Math.max(50, P[h]![0]))), top: 0 }} />}
        </>
      )}
    </div>
  );
}

/** Изменение к прошлому периоду: стрелка и знак (не только цвет); зелёное - когда к лучшему. */
function DeltaChip({ delta, unit }: { delta: number; unit: '%' | 'pp' }) {
  const { t } = useTranslation();
  const num = useNum();
  const better = delta === 0 ? null : delta > 0;
  const text = `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${num(Math.abs(delta))}${unit === 'pp' ? ` ${t('adm.pp')}` : '%'}`;
  const glyph: IconGlyph = delta > 0 ? 'up' : delta < 0 ? 'down' : 'minus';
  return (
    <span
      className={`qd-chip qd-num shrink-0 gap-0.5 ${better === null ? '' : better ? 'qd-chip-ok' : 'qd-chip-bad'}`}
      aria-label={`${t(delta < 0 ? 'adm.down' : 'adm.up')} ${text}`}
      style={{ height: 22, padding: '0 8px 0 5px', fontSize: 12 }}
    >
      <Icon glyph={glyph} size={13} stroke={2.8} />
      {text}
    </span>
  );
}

/** Показатель периода: подпись, крупное значение, изменение и пояснение. */
export function Kpi({ label, value, delta, unit = '%', sub }: { label: string; value: string; delta?: Delta; unit?: '%' | 'pp'; sub?: string }) {
  return (
    <div className="qd-card box-border flex min-h-24 w-full min-w-0 flex-col gap-1 rounded-[24px] px-3.5 py-3">
      <span className="truncate text-[12px] font-semibold text-hint">{label}</span>
      <span className="qd-num truncate text-[24px] font-bold tracking-[-0.02em]">{value}</span>
      <div className="flex min-h-[22px] min-w-0 items-center gap-1.5">
        {delta !== undefined && delta !== null && <DeltaChip delta={delta} unit={unit} />}
        {sub && <span className="line-clamp-2 min-w-0 text-[12px] leading-[1.3] font-medium text-hint">{sub}</span>}
      </div>
    </div>
  );
}

export interface MeterLook {
  glyph: IconGlyph;
  ball: string;
  glow: string;
  ink: string;
}

/** Доля: подпись и значение, полоса в тон графиков на светлой подложке того же тона. */
export function Meter({ label, value, share, sub, look }: { label: ReactNode; value: string; share: number; sub?: string; look?: MeterLook }) {
  const s = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
  const pct = Math.max(s > 0 ? 2 : 0, Math.round(s * 1000) / 10);
  return (
    <div className="flex items-center gap-3">
      {look && (
        <span
          aria-hidden="true"
          className="qd-ball h-[34px] w-[34px] shrink-0"
          style={{ '--qd-ball': look.ball, '--qd-ball-glow': look.glow, color: look.ink } as CSSProperties}
        >
          <Icon glyph={look.glyph} size={17} stroke={2.4} />
        </span>
      )}
      <div className="flex min-w-0 grow flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 grow truncate text-[14px] font-semibold">{label}</span>
          <span className="qd-num shrink-0 text-[14px] font-bold">{value}</span>
        </div>
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-[3px]" style={{ background: 'var(--qd-chart-track)' }}>
          <div className="h-full rounded-[3px]" style={{ width: `${pct}%`, background: 'var(--qd-chart)' }} />
        </div>
        {sub && <span className="truncate text-[12px] font-medium text-hint">{sub}</span>}
      </div>
    </div>
  );
}

/** Карточка раздела: заголовок, пояснение и содержимое. */
export function Panel({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="qd-card flex flex-col gap-3 rounded-[26px] px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <h2 className="m-0 text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
          {sub && <span className="text-[12px] font-medium text-hint">{sub}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Бот - админ канала? Иначе подписку не проверить. */
export function BotLine({ ok }: { ok: boolean | null }) {
  const { t } = useTranslation();
  const color = ok === null ? HINT : ok ? 'var(--qd-correct-text)' : 'var(--qd-wrong-text)';
  return (
    <span role="status" className="flex min-w-0 items-center gap-1 text-[12px] font-semibold" style={{ color }}>
      <Icon glyph={ok ? 'check' : ok === null ? 'info' : 'alert'} size={13} stroke={2.8} />
      <span className="min-w-0 truncate">{ok === null ? t('adm.task.botUnknown') : ok ? t('adm.tasks.botOk') : t('adm.tasks.botNo')}</span>
    </span>
  );
}

/** «в сети», «5 мин назад», «вчера» - по-русски и по-английски силами Intl. */
export function seenText(at: number, lang: string, t: (k: string) => string, now = Date.now()) {
  const sec = Math.max(0, (now - at) / 1000);
  if (sec < 180) return t('adm.player.online');
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
  if (sec < 3600) return rtf.format(-Math.round(sec / 60), 'minute');
  if (sec < 86_400) return rtf.format(-Math.round(sec / 3600), 'hour');
  if (sec < 30 * 86_400) return rtf.format(-Math.round(sec / 86_400), 'day');
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(at));
}
