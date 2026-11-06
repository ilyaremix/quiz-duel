import { Button } from './Button';
import { Icon } from './Icon';

/** Плашка «У вас идёт партия» на главной. */
export function ResumeBanner({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div role="status" className="box-border flex w-full items-center gap-3 rounded-[20px] bg-section py-3 pr-3 pl-3.5 shadow-[0_4px_0_var(--qd-lip)]">
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-text">
        <Icon glyph="duel" size={22} stroke={2.2} />
      </span>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-[15px] font-extrabold">{title}</span>
        <span className="truncate text-[13px] font-semibold text-hint">{text}</span>
      </div>
      <div className="shrink-0">
        <Button size="s" full={false} onClick={onAction}>
          {action}
        </Button>
      </div>
    </div>
  );
}

/** Жёлтая плашка «соперник не в сети» с отсчётом. */
export function DisconnectBanner({ title, text, time }: { title: string; text: string; time: string }) {
  return (
    <div role="alert" className="box-border flex w-full items-center gap-3 rounded-[20px] px-3.5 py-3" style={{ background: 'var(--qd-gold-tint)' }}>
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--qd-gold)', color: 'var(--qd-on-fill)' }}>
        <Icon glyph="offline" size={20} stroke={2.5} />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-extrabold">{title}</span>
        <span className="text-[13px] font-semibold">
          {text}{' '}
          <b className="qd-num font-black text-gold-text">{time}</b>
        </span>
      </div>
    </div>
  );
}

/** Верхняя полоса «Переподключаемся…». */
export function OfflineStrip({ title }: { title: string }) {
  return (
    <div
      role="status"
      className="box-border flex h-9 w-full items-center justify-center gap-2 text-[14px] font-extrabold"
      style={{ background: 'var(--qd-inverse-bg)', color: 'var(--qd-inverse-text)' }}
    >
      <svg className="qd-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {title}
    </div>
  );
}
