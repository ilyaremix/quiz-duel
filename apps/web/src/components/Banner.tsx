import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
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

interface RematchPerson {
  id: number;
  name: string;
  photoUrl: string | null;
}

/** Полоска оставшегося времени на ответ (30 с). */
function RematchProgress({ label, left, total }: { label: string; left: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(total / 1000)}
      aria-valuenow={Math.ceil(left / 1000)}
      className="h-1.5 overflow-hidden rounded-[3px] bg-surface-2"
    >
      <div className="h-1.5 rounded-[3px]" style={{ width: `${pct}%`, background: 'var(--qd-brand)', transition: 'width 100ms linear' }} />
    </div>
  );
}

/** Экран 13: «{соперник} предлагает реванш» - принять или отказаться, полоска 30 с. */
export function RematchBanner(props: {
  opp: RematchPerson;
  title: string;
  text: ReactNode;
  progressLabel: string;
  left: number;
  total: number;
  accept: string;
  decline: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div role="dialog" aria-label={props.title} className="box-border flex w-full flex-col gap-3.5 rounded-[24px] bg-section p-4 shadow-[0_4px_0_var(--qd-lip)]">
      <div className="flex items-center gap-3">
        <Avatar id={props.opp.id} name={props.opp.name} photoUrl={props.opp.photoUrl} size={44} ring="opp" on="card" />
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="truncate text-[16px] font-extrabold">{props.title}</span>
          <span className="truncate text-[13px] font-semibold text-hint">{props.text}</span>
        </div>
      </div>
      <RematchProgress label={props.progressLabel} left={props.left} total={props.total} />
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" size="m" disabled={props.busy} onClick={props.onDecline}>
          {props.decline}
        </Button>
        <Button size="m" disabled={props.busy} icon={<Icon glyph="rematch" size={20} stroke={2.5} />} onClick={props.onAccept}>
          {props.accept}
        </Button>
      </div>
    </div>
  );
}

/** «Вы предложили реванш» - ждём ответа соперника, можно отменить. */
export function RematchWaitBanner(props: {
  opp: RematchPerson;
  title: string;
  text: ReactNode;
  progressLabel: string;
  left: number;
  total: number;
  cancel: string;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <div role="status" className="box-border flex w-full flex-col gap-2 rounded-[24px] bg-section px-4 pt-3.5 pb-1.5 shadow-[0_4px_0_var(--qd-lip)]">
      <div className="flex items-center gap-3">
        <Avatar id={props.opp.id} name={props.opp.name} photoUrl={props.opp.photoUrl} size={40} ring="opp" on="card" />
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="truncate text-[15px] font-extrabold">{props.title}</span>
          <span className="truncate text-[13px] font-semibold text-hint">{props.text}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="grow">
          <RematchProgress label={props.progressLabel} left={props.left} total={props.total} />
        </div>
        <div className="shrink-0">
          <Button variant="ghost" size="s" full={false} disabled={props.busy} onClick={props.onCancel}>
            {props.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}
