import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
import { Ball, BALLS } from './Ball';
import { Button } from './Button';
import { Icon } from './Icon';

const CARD = { background: 'var(--qd-sheen), var(--qd-glass)', boxShadow: 'var(--qd-glass-edge)' };

/** Плашка «У вас идёт партия» на главной: живая зелёная точка и главная кнопка «Вернуться». */
export function ResumeBanner({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div role="status" className="box-border flex w-full items-center gap-3 rounded-[26px] py-3 pr-3 pl-3.5" style={CARD}>
      <Ball size={44} {...BALLS.brand}>
        <Icon glyph="duel" size={22} stroke={2.2} />
      </Ball>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="flex items-center gap-[7px] text-[15px] leading-[1.25] font-bold">
          <span
            aria-hidden="true"
            className="qd-bn-live h-2 w-2 shrink-0 rounded-full"
            style={{ background: 'var(--qd-correct)', boxShadow: '0 0 8px var(--qd-ok-glow)' }}
          />
          <span className="min-w-0">{title}</span>
        </span>
        <span className="text-[13px] leading-[1.3] font-medium text-hint">{text}</span>
      </div>
      <div className="shrink-0">
        <Button size="s" full={false} onClick={onAction}>
          {action}
        </Button>
      </div>
    </div>
  );
}

/** Золотое стекло «соперник не в сети» с отсчётом до технической победы. */
export function DisconnectBanner({ title, text, time }: { title: string; text: string; time: string }) {
  return (
    <div
      role="alert"
      className="box-border flex w-full items-center gap-3 rounded-[24px] px-3.5 py-3"
      style={{ background: 'var(--qd-gold-glass)', boxShadow: 'var(--qd-gold-edge)' }}
    >
      <Ball size={40} {...BALLS.gold}>
        <Icon glyph="offline" size={20} stroke={2.5} />
      </Ball>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-[13px] font-medium">
          {text}{' '}
          <b className="qd-num font-bold text-gold-text">{time}</b>
        </span>
      </div>
    </div>
  );
}

/** Верхняя полоса «Переподключаемся…» - плотное стекло. safeTop - у самого верха экрана, под вырезом. */
export function OfflineStrip({ title, safeTop = false }: { title: string; safeTop?: boolean }) {
  const inset = 'calc(var(--tg-viewport-safe-area-inset-top, 0px) + var(--tg-viewport-content-safe-area-inset-top, 0px))';
  return (
    <div
      role="status"
      className="box-border flex w-full items-center justify-center gap-2 text-[14px] font-semibold"
      style={{
        background: 'var(--qd-toast)',
        boxShadow: 'inset 0 -1px 0 rgba(255, 255, 255, 0.14), 0 8px 22px rgba(3, 4, 20, 0.3)',
        color: 'var(--tg-theme-text-color)',
        paddingTop: safeTop ? inset : 0,
        height: safeTop ? `calc(36px + ${inset})` : 36,
      }}
    >
      <svg className="qd-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="#9B5CFF" strokeWidth="3" strokeLinecap="round" />
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

/** Полоска оставшегося времени на ответ (30 с) - градиент таймера. */
function RematchProgress({ label, left, total }: { label: string; left: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(total / 1000)}
      aria-valuenow={Math.ceil(left / 1000)}
      className="h-1.5 overflow-hidden rounded-[3px]"
      style={{ background: 'var(--qd-track)' }}
    >
      <div className="h-1.5 rounded-[3px]" style={{ width: `${pct}%`, background: 'var(--qd-timer)', transition: 'width 100ms linear' }} />
    </div>
  );
}

/** Экран 13: «{соперник} предлагает реванш» - принять или отказаться, полоска 30 с. Плавает над итогами - стекло плотное. */
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
    <div
      role="dialog"
      aria-label={props.title}
      className="box-border flex w-full flex-col gap-3.5 rounded-[28px] p-4"
      style={{ background: 'var(--qd-sheen), var(--qd-glass-solid)', boxShadow: 'var(--qd-glass-edge)' }}
    >
      <div className="flex items-center gap-3">
        <Avatar id={props.opp.id} name={props.opp.name} photoUrl={props.opp.photoUrl} size={44} ring="opp" on="card" />
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-[16px] leading-[1.25] font-bold">{props.title}</span>
          <span className="text-[13px] leading-[1.3] font-medium text-hint">{props.text}</span>
        </div>
      </div>
      <RematchProgress label={props.progressLabel} left={props.left} total={props.total} />
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" size="m" disabled={props.busy} onClick={props.onDecline}>
          {props.decline}
        </Button>
        <Button size="m" disabled={props.busy} icon={<Icon glyph="rematch" size={20} stroke={2.4} />} onClick={props.onAccept}>
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
    <div role="status" className="box-border flex w-full flex-col gap-3 rounded-[26px] py-3.5 pr-3.5 pl-4" style={CARD}>
      <div className="flex items-center gap-3">
        <Avatar id={props.opp.id} name={props.opp.name} photoUrl={props.opp.photoUrl} size={40} ring="opp" on="card" />
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-[15px] leading-[1.25] font-bold">{props.title}</span>
          <span className="text-[13px] leading-[1.3] font-medium text-hint">{props.text}</span>
        </div>
        <div className="shrink-0">
          <Button variant="secondary" size="s" full={false} disabled={props.busy} onClick={props.onCancel}>
            {props.cancel}
          </Button>
        </div>
      </div>
      <RematchProgress label={props.progressLabel} left={props.left} total={props.total} />
    </div>
  );
}
