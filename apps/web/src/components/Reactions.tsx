import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REACTION_PACKS, type Reaction } from '@quiz-duel/shared';
import { gameActions, useGame } from '../lib/game';
import { useWallet } from '../lib/economy';

/** Строка из 6 реакций - стеклянные кружки. После отправки 2 с полупрозрачны (кулдаун проверяет и сервер). */
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
  // Обновление 2.0: набор, надетый в магазине; подписи для чтения с экрана - только у базового.
  const pack = useWallet().data?.pack ?? 'base';
  const emojis = REACTION_PACKS[pack];
  const names = pack === 'base' ? (t('reactions.list', { returnObjects: true }) as string[]) : [];
  return (
    <div role="group" aria-label={t('reactions.aria')} className="flex w-full justify-between gap-1.5">
      {emojis.map((emoji: Reaction, i) => (
        <button
          key={emoji}
          type="button"
          aria-label={`${t('reactions.prefix')}${names[i] ?? emoji}`}
          disabled={cooldown}
          onClick={() => void gameActions.react(emoji)}
          className="qd-press qd-react qd-emoji flex aspect-square min-w-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 leading-none disabled:cursor-default"
          style={{
            // На узком экране кружки ужимаются, но остаются кругами.
            flex: `0 1 ${d}px`,
            fontSize: size === 's' ? 20 : 23,
            background: 'var(--qd-sheen), var(--qd-glass)',
            boxShadow: 'var(--qd-glass-edge-flat)',
            opacity: cooldown ? 0.45 : 1,
            transition: 'opacity 200ms ease, filter 150ms ease, transform var(--qd-dur-press) var(--qd-ease-ui)',
          }}
        >
          {emoji}
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
      aria-label={t('reactions.from', { r: live.emoji })}
      className={`qd-bubble qd-emoji pointer-events-none absolute z-10 flex h-[50px] w-[50px] items-center justify-center rounded-full text-[25px] ${className}`}
      style={{
        background: 'var(--qd-sheen), var(--qd-glass-solid)',
        boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 0 0 2px var(${side === 'me' ? '--qd-me' : '--qd-opp'}), 0 0 20px var(${side === 'me' ? '--qd-me-glow' : '--qd-opp-glow'}), 0 10px 24px rgba(3, 4, 20, 0.35)`,
      }}
    >
      {live.emoji}
    </div>
  );
}
