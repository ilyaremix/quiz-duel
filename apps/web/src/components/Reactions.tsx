import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REACTION_PACKS, packOf, type Reaction } from '@quiz-duel/shared';
import type { TFunction } from 'i18next';
import { gameActions, useGame } from '../lib/game';
import { useWallet } from '../lib/economy';
import { ReactionGlyph } from './Art';
import { Icon } from './Icon';

/** Название реакции для чтения с экрана: «Класс», «Корона»… (неизвестная - сам эмодзи). */
export function reactionName(t: TFunction, emoji: string): string {
  const pack = packOf(emoji);
  if (!pack) return emoji;
  const names = t(pack === 'base' ? 'reactions.list' : `reactions.${pack}`, { returnObjects: true }) as string[];
  return names[REACTION_PACKS[pack].indexOf(emoji)] ?? emoji;
}

/**
 * Строка из 6 реакций - стеклянные кружки. После отправки 2 с полупрозрачны (кулдаун проверяет и сервер).
 * Базовый набор - эмодзи, купленные - свои рисунки (components/Art.tsx).
 */
export function Reactions({ size = 'm' }: { size?: 'm' | 's' }) {
  const { t } = useTranslation();
  const until = useGame((s) => s.reactUntil);
  const [, rerender] = useState(0);
  const cooldown = until > Date.now();
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => rerender((n) => n + 1), until - Date.now() + 20);
    return () => window.clearTimeout(timer);
  }, [cooldown, until]);

  const d = size === 's' ? 44 : 50;
  // Обновление 2.0: набор, надетый в магазине.
  const pack = useWallet().data?.pack ?? 'base';
  const emojis = REACTION_PACKS[pack];
  return (
    <div role="group" aria-label={t('reactions.aria')} className="flex w-full justify-between gap-1.5">
      {emojis.map((emoji: Reaction) => (
        <button
          key={emoji}
          type="button"
          aria-label={`${t('reactions.prefix')}${reactionName(t, emoji)}`}
          disabled={cooldown}
          onClick={() => void gameActions.react(emoji)}
          className="qd-press qd-react qd-emoji flex aspect-square min-w-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 leading-none disabled:cursor-default"
          style={{
            // На узком экране кружки ужимаются, но остаются кругами.
            flex: `0 1 ${d}px`,
            background: 'var(--qd-sheen), var(--qd-glass)',
            boxShadow: 'var(--qd-glass-edge-flat)',
            opacity: cooldown ? 0.45 : 1,
            transition: 'opacity 200ms ease, filter 150ms ease, transform var(--qd-dur-press) var(--qd-ease-ui)',
          }}
        >
          <ReactionGlyph r={emoji} size={size === 's' ? 28 : 32} />
        </button>
      ))}
    </div>
  );
}

const SHOW_MS = 1_800;

/** Последняя реакция игрока, пока она «живёт» (1,8 с), иначе null. Старую (пришла до этого экрана) не показываем. */
export function useLiveReaction(userId: number | undefined): { id: number; emoji: string } | null {
  const bubble = useGame((s) => (userId === undefined ? undefined : s.bubbles[userId]));
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    const left = bubble ? SHOW_MS - (Date.now() - bubble.at) : 0;
    if (!bubble || left <= 0) return;
    setShown(bubble.id);
    const timer = window.setTimeout(() => setShown(null), left);
    return () => window.clearTimeout(timer);
  }, [bubble]);
  return bubble && shown === bubble.id ? { id: bubble.id, emoji: bubble.emoji } : null;
}

/** Эмодзи всплывает у аватарки игрока в стеклянном кружке с кольцом его цвета и через 1,8 с исчезает. Ставится внутрь relative-контейнера. */
export function ReactionBubble({ userId, side, className = '' }: { userId: number; side: 'me' | 'opp'; className?: string }) {
  const { t } = useTranslation();
  const live = useLiveReaction(userId);
  if (!live) return null;
  return (
    <div
      key={live.id}
      role="img"
      aria-label={t('reactions.from', { r: reactionName(t, live.emoji) })}
      className={`qd-bubble pointer-events-none absolute z-10 flex h-[50px] w-[50px] items-center justify-center rounded-full ${className}`}
      style={{
        background: 'var(--qd-sheen), var(--qd-glass-solid)',
        boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 0 0 2px var(${side === 'me' ? '--qd-me' : '--qd-opp'}), 0 0 20px var(${side === 'me' ? '--qd-me-glow' : '--qd-opp-glow'}), 0 10px 24px rgba(3, 4, 20, 0.35)`,
      }}
    >
      <ReactionGlyph r={live.emoji} size={36} live />
    </div>
  );
}

/**
 * Реакции во время партии: кнопка-смайлик над вопросом, по нажатию слева от неё плавно
 * выезжает лента из 6 реакций (поверх, без сдвига вёрстки). Отправил - лента закрывается.
 * Тап мимо или Escape - тоже закрывается.
 */
export function ReactionPicker() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const until = useGame((s) => s.reactUntil);
  const [, rerender] = useState(0);
  const cooldown = until > Date.now();
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => rerender((n) => n + 1), until - Date.now() + 20);
    return () => window.clearTimeout(timer);
  }, [cooldown, until]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pack = useWallet().data?.pack ?? 'base';
  const emojis = REACTION_PACKS[pack];
  const send = (emoji: Reaction) => {
    void gameActions.react(emoji);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative flex h-10 w-full shrink-0 items-center justify-end">
      <div role="group" aria-label={t('reactions.aria')} inert={!open} data-open={open} className="qd-react-tray absolute top-0 right-12 bottom-0 left-0 flex items-center justify-end gap-1.5 pr-1.5">
        {emojis.map((emoji: Reaction, i) => (
          <button
            key={emoji}
            type="button"
            aria-label={`${t('reactions.prefix')}${reactionName(t, emoji)}`}
            disabled={cooldown}
            onClick={() => send(emoji)}
            className="qd-press qd-react qd-emoji flex aspect-square min-w-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 leading-none disabled:cursor-default"
            style={{
              flex: '0 1 40px',
              background: 'var(--qd-sheen), var(--qd-glass)',
              boxShadow: 'var(--qd-glass-edge-flat)',
              opacity: cooldown ? 0.45 : undefined,
              transitionDelay: open ? `${(emojis.length - 1 - i) * 25}ms` : '0ms',
            }}
          >
            <ReactionGlyph r={emoji} size={26} />
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t('reactions.close') : t('reactions.open')}
        onClick={() => setOpen((v) => !v)}
        className="qd-press qd-icon-btn h-10! w-10!"
        style={{ color: open ? 'var(--tg-theme-text-color)' : 'var(--tg-theme-hint-color)' }}
      >
        <span className="flex" style={{ transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform 220ms var(--qd-ease-ui)' }}>
          <Icon glyph={open ? 'close' : 'smile'} size={20} stroke={2.3} />
        </span>
      </button>
    </div>
  );
}
