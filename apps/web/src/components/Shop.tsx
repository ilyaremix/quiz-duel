/**
 * Обновление 2.0: детали магазина - монетка, ценник, товар и задание (компоненты ShopItem и TaskRow в дизайне).
 */
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { COIN_PACKS, GLOW_PRICES, PACK_PRICES, REACTION_PACKS, TOPIC_PRICE, type GlowId, type PackId, type PremiumTopic, type TaskView } from '@quiz-duel/shared';
import { formatNumber } from '../i18n';
import { pw } from '../lib/economy';
import { Avatar } from './Avatar';
import { CATEGORY_LOOK } from './Category';
import { Icon, type IconGlyph } from './Icon';

const GLASS = 'var(--qd-sheen), var(--qd-glass)';
const EDGE = 'var(--qd-glass-edge)';
const OK_BG = 'var(--qd-ok-glass)';
const OK_EDGE = 'var(--qd-ok-edge)';

/** Золотая монетка (и звезда для цен в звёздах). */
export function CoinDot({ size = 18, star = false }: { size?: number; star?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: star
          ? 'radial-gradient(circle at 32% 25%, #FFF0B8, #FFC93D 55%, #F59E0B)'
          : 'radial-gradient(circle at 32% 25%, #FFF3C4, #FFD36B 55%, #F2B230)',
        color: star ? '#3A2200' : '#3A2600',
      }}
    >
      <Icon glyph={star ? 'star' : 'coin'} size={Math.round(size * 0.62)} stroke={2.8} />
    </span>
  );
}

export type PriceState = 'buy' | 'owned' | 'equipped' | 'pass';

const PRICE: Record<PriceState, { bg: string; edge: string; fg: string }> = {
  buy: { bg: 'var(--qd-gold-glass)', edge: 'inset 0 1px 0 rgba(255,255,255,.4), inset 0 0 0 1px var(--qd-gold-ring)', fg: 'var(--qd-gold-text)' },
  owned: { bg: 'var(--qd-glass)', edge: 'var(--qd-glass-edge-flat)', fg: 'var(--tg-theme-hint-color)' },
  equipped: { bg: 'var(--qd-correct-tint)', edge: 'inset 0 1px 0 rgba(255,255,255,.3), inset 0 0 0 1px var(--qd-ok-ring)', fg: 'var(--qd-correct-text)' },
  pass: { bg: 'var(--qd-gold-glass)', edge: 'inset 0 1px 0 rgba(255,255,255,.4), inset 0 0 0 1px var(--qd-gold-ring)', fg: 'var(--qd-gold-text)' },
};

/** Ценник: монеты, звёзды, «Куплено», «Надето», «На 1 игру». */
export function PriceChip({ state, text, currency = 'coin', big = false }: { state: PriceState; text: string; currency?: 'coin' | 'star'; big?: boolean }) {
  const p = PRICE[state];
  const icon = state === 'buy';
  return (
    <span
      className="qd-num box-border inline-flex max-w-full shrink-0 items-center gap-1 font-bold whitespace-nowrap"
      style={{
        height: big ? 32 : 28,
        padding: `0 ${big ? 11 : 10}px 0 ${icon ? 4 : big ? 11 : 10}px`,
        borderRadius: big ? 16 : 14,
        fontSize: big ? 14 : 13,
        background: p.bg,
        boxShadow: p.edge,
        color: p.fg,
      }}
    >
      {icon && <CoinDot size={big ? 20 : 18} star={currency === 'star'} />}
      {state === 'equipped' && <Icon glyph="check" size={big ? 14 : 13} stroke={3} />}
      {text}
    </span>
  );
}

export type ItemState = 'buy' | 'owned' | 'equipped' | 'pass';

function priceText(t: (k: string) => string, lang: string, state: ItemState, price: number, kind: 'glow' | 'pack' | 'topic') {
  if (state === 'equipped') return { state: 'equipped' as const, text: t('s27.price.equipped') };
  if (state === 'pass') return { state: 'pass' as const, text: t('s27.price.pass') };
  if (state === 'owned' || price === 0)
    return { state: 'owned' as const, text: kind === 'topic' ? t('s27.price.open') : price === 0 ? t('s27.price.free') : t('s27.price.owned') };
  return { state: 'buy' as const, text: formatNumber(price, lang) };
}

function Tile({ label, onPress, equipped, badge, minH, children }: { label: string; onPress: () => void; equipped: boolean; badge?: string; minH: number; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className="qd-press relative box-border flex h-full w-full cursor-pointer flex-col items-center gap-2 rounded-[22px] border-0 px-2 pt-3 pb-2.5 text-center text-text"
      style={{ minHeight: minH, background: equipped ? OK_BG : GLASS, boxShadow: equipped ? OK_EDGE : EDGE }}
    >
      {badge && (
        <span
          className="absolute -top-[9px] left-1/2 box-border flex h-5 -translate-x-1/2 items-center rounded-[10px] px-2 text-[11px] font-extrabold whitespace-nowrap text-white"
          style={{ background: 'linear-gradient(120deg, #FF6A88, #9B5CFF)', boxShadow: '0 4px 12px rgba(155,92,255,.45)' }}
        >
          {badge}
        </span>
      )}
      {children}
    </button>
  );
}

function BigBall({ glyph, ball, glow, ink }: { glyph: IconGlyph; ball: string; glow: string; ink: string }) {
  return (
    <span aria-hidden="true" className="qd-ball h-[50px] w-[50px]" style={{ '--qd-ball': ball, '--qd-ball-glow': glow, color: ink } as CSSProperties}>
      <Icon glyph={glyph} size={24} stroke={2.2} />
    </span>
  );
}

export function GlowTile({ id, state, meId, meName, onPress }: { id: GlowId; state: ItemState; meId: number; meName: string; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const price = priceText(t, i18n.language, state, GLOW_PRICES[id], 'glow');
  const title = t(`s27.glows.${id}`);
  return (
    <Tile label={`${title}: ${price.text}`} onPress={onPress} equipped={state === 'equipped'} minH={146}>
      <span className="flex h-[60px] items-center justify-center">
        <Avatar id={meId} name={meName} size={50} glow={id} />
      </span>
      <span className="max-w-full truncate text-[14px] leading-[1.2] font-bold tracking-[-0.01em]">{title}</span>
      <span className="mt-auto">
        <PriceChip state={price.state} text={price.text} />
      </span>
    </Tile>
  );
}

export function TopicTile({ id, state, onPress }: { id: PremiumTopic; state: ItemState; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const price = priceText(t, i18n.language, state, TOPIC_PRICE, 'topic');
  const look = CATEGORY_LOOK[id];
  const title = t(`cat.${id}.title`);
  return (
    <Tile label={`${title}: ${price.text}`} onPress={onPress} equipped={false} minH={150}>
      <span className="flex h-[60px] items-center justify-center">
        <BigBall glyph={look.glyph} ball={look.ball} glow={look.glow} ink={look.ink} />
      </span>
      <span className="flex max-w-full min-w-0 flex-col gap-0.5">
        <span className="truncate text-[14px] leading-[1.2] font-bold tracking-[-0.01em]">{title}</span>
        <span className="truncate text-[12px] font-medium text-hint">{t(`cat.${id}.count`)}</span>
      </span>
      <span className="mt-auto">
        <PriceChip state={price.state} text={price.text} />
      </span>
    </Tile>
  );
}

export function CoinPackTile({ id, onPress }: { id: (typeof COIN_PACKS)[number]['id']; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const pack = COIN_PACKS.find((p) => p.id === id)!;
  const badge = 'best' in pack && pack.best ? t('s27.best') : 'bonus' in pack && pack.bonus ? t('s27.bonus', { n: pack.bonus }) : undefined;
  const title = formatNumber(pack.coins, i18n.language);
  return (
    <Tile label={`${title} ${pw(t, pack.coins, 'coin')}: ${pack.stars}`} onPress={onPress} equipped={false} badge={badge} minH={146}>
      <span className="flex h-[60px] items-center justify-center">
        <BigBall glyph="coin" ball="#FFD36B" glow="rgba(255,211,107,.55)" ink="#3A2600" />
      </span>
      <span className="flex max-w-full min-w-0 flex-col gap-0.5">
        <span className="qd-num truncate text-[17px] leading-[1.2] font-bold tracking-[-0.01em]">{title}</span>
        <span className="truncate text-[12px] font-medium text-hint">{t(`s27.coinPacks.${id}`)}</span>
      </span>
      <span className="mt-auto">
        <PriceChip state="buy" currency="star" text={formatNumber(pack.stars, i18n.language)} />
      </span>
    </Tile>
  );
}

export function PackRow({ id, state, onPress }: { id: PackId; state: ItemState; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const price = priceText(t, i18n.language, state, PACK_PRICES[id], 'pack');
  const title = t(`s27.packs.${id}`);
  const equipped = state === 'equipped';
  return (
    <button
      type="button"
      aria-label={`${title}: ${price.text}`}
      onClick={onPress}
      className="qd-press box-border flex min-h-[76px] w-full cursor-pointer items-center gap-2.5 rounded-[22px] border-0 py-2.5 pr-2.5 pl-3.5 text-left text-text"
      style={{ background: equipped ? OK_BG : GLASS, boxShadow: equipped ? OK_EDGE : EDGE }}
    >
      <span className="flex min-w-0 grow flex-col gap-1.5">
        <span className="text-[15px] font-bold tracking-[-0.01em]">{title}</span>
        <span aria-hidden="true" className="flex gap-1">
          {REACTION_PACKS[id].map((e) => (
            <span
              key={e}
              className="qd-emoji flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[17px] leading-none"
              style={{ background: 'var(--qd-glass)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3)' }}
            >
              {e}
            </span>
          ))}
        </span>
      </span>
      <PriceChip state={price.state} text={price.text} big />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Задание

export const TASK_LOOK: Record<TaskView['type'], { glyph: IconGlyph; ball: string; glow: string; ink: string; act: string }> = {
  play: { glyph: 'duel', ball: '#4F8DFF', glow: 'rgba(79,141,255,.55)', ink: '#FFFFFF', act: 'go' },
  ads: { glyph: 'ad', ball: '#FF6A88', glow: 'rgba(255,106,136,.5)', ink: '#FFFFFF', act: 'watch' },
  channel: { glyph: 'megaphone', ball: '#19C2DB', glow: 'rgba(25,194,219,.5)', ink: '#032A30', act: 'sub' },
  story: { glyph: 'story', ball: '#9B5CFF', glow: 'rgba(155,92,255,.55)', ink: '#FFFFFF', act: 'post' },
  invite: { glyph: 'userPlus', ball: '#3BE58B', glow: 'rgba(59,229,139,.5)', ink: '#04261A', act: 'invite' },
};

export type TaskState = 'go' | 'check' | 'claim' | 'done';

export function TaskRow({ task, state, onAction, busy }: { task: TaskView; state: TaskState; onAction: () => void; busy?: boolean }) {
  const { t, i18n } = useTranslation();
  const look = TASK_LOOK[task.type];
  const n = Math.min(task.count, task.goal);
  const custom = task.title ? (i18n.language.startsWith('en') ? task.title.en : task.title.ru) : null;
  const title = custom || t(`s27.task.${task.type}.t`, { g: task.goal, games: pw(t, task.goal, 'game') });
  const sub =
    task.type === 'channel'
      ? t('s27.task.channel.dTemplate', { ch: task.channel ?? '' })
      : t(`s27.task.${task.type}.d`, { n: task.count, g: task.goal, r: task.reward });
  const progress = (task.type === 'play' || task.type === 'ads') && state !== 'done';
  const pct = task.goal > 0 ? Math.round((n / task.goal) * 100) : 0;
  const actKey = state === 'go' ? look.act : state;
  const label = t(`s27.act.${actKey}`);
  const btn = 'qd-press box-border h-10 shrink-0 cursor-pointer rounded-[20px] border-0 px-3.5 text-[14px] font-bold whitespace-nowrap disabled:opacity-60';
  return (
    <div
      className="relative box-border flex min-h-[76px] w-full items-center gap-3 rounded-[24px] py-3 pr-2.5 pl-3 text-text"
      style={{ background: GLASS, boxShadow: EDGE, opacity: state === 'done' ? 0.62 : 1 }}
    >
      <span aria-hidden="true" className="qd-ball h-11 w-11" style={{ '--qd-ball': look.ball, '--qd-ball-glow': look.glow, color: look.ink } as CSSProperties}>
        <Icon glyph={look.glyph} size={21} stroke={2.3} />
      </span>
      <div className="flex min-w-0 grow flex-col gap-[5px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[15px] leading-[1.2] font-bold tracking-[-0.01em]">{title}</span>
          {task.type === 'story' && (
            <span className="box-border inline-flex h-5 shrink-0 items-center gap-[3px] rounded-[10px] pr-[7px] pl-[5px] text-[11px] font-bold text-white" style={{ background: 'linear-gradient(120deg, #9B5CFF, #4F8DFF)' }}>
              <Icon glyph="star" size={11} stroke={2.6} />
              {t('s27.premium')}
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-hint">
          <span
            className="qd-num box-border inline-flex h-5 shrink-0 items-center gap-[3px] rounded-[10px] pr-[7px] pl-[3px] font-bold"
            style={{ background: 'var(--qd-gold-glass)', boxShadow: 'inset 0 0 0 1px var(--qd-gold-ring)', color: 'var(--qd-gold-text)' }}
          >
            <CoinDot size={14} />+{formatNumber(task.reward, i18n.language)}
          </span>
          <span className="min-w-0 truncate">{sub}</span>
        </span>
        {progress && (
          <div role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-[5px] overflow-hidden rounded-[3px]" style={{ background: 'var(--qd-track)' }}>
            <div className="h-[5px] rounded-[3px]" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #FFD36B, #F2B230)', boxShadow: '0 0 8px rgba(255,211,107,.6)' }} />
          </div>
        )}
      </div>
      {state === 'go' && (
        <button type="button" onClick={onAction} disabled={busy} className={btn} style={{ background: 'var(--qd-glass)', boxShadow: 'var(--qd-glass-edge-flat)', color: 'var(--tg-theme-text-color)' }}>
          {label}
        </button>
      )}
      {state === 'check' && (
        <button type="button" onClick={onAction} disabled={busy} className={btn} style={{ background: 'var(--qd-brand-glass)', boxShadow: 'var(--qd-brand-edge)', color: 'var(--qd-brand-text)' }}>
          {label}
        </button>
      )}
      {state === 'claim' && (
        <button type="button" onClick={onAction} disabled={busy} className={`${btn} qd-task-ready qd-gold-btn font-extrabold`}>
          {label}
        </button>
      )}
      {state === 'done' && (
        <span role="img" aria-label={label} className="qd-ball h-10 w-10" style={{ '--qd-ball': '#3BE58B', '--qd-ball-glow': 'rgba(59,229,139,.5)', color: '#04261A' } as CSSProperties}>
          <Icon glyph="check" size={18} stroke={3.2} />
        </span>
      )}
    </div>
  );
}
