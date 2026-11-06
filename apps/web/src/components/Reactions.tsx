import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { REACTIONS, type Reaction } from '@quiz-duel/shared';
import { gameActions, useGame } from '../lib/game';

/** Строка из 6 реакций. После отправки 2 с неактивна (кулдаун проверяет и сервер). */
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
  const names = t('reactions.list', { returnObjects: true }) as string[];
  return (
    <div role="group" aria-label={t('reactions.aria')} className="flex w-full justify-between gap-1.5">
      {REACTIONS.map((emoji: Reaction, i) => (
        <button
          key={emoji}
          type="button"
          aria-label={`${t('reactions.prefix')}${names[i] ?? ''}`}
          disabled={cooldown}
          onClick={() => void gameActions.react(emoji)}
          className="qd-press flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-section p-0 leading-none transition-opacity duration-200 ease-[ease] disabled:cursor-default"
          style={{ width: d, height: d, fontSize: size === 's' ? 20 : 23, boxShadow: '0 3px 0 var(--qd-lip)', opacity: cooldown ? 0.45 : 1 } as CSSProperties}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

const SHOW_MS = 1_800;

/** Эмодзи всплывает у аватарки игрока и через 1,8 с исчезает. Ставится внутрь relative-контейнера. */
export function ReactionBubble({ userId, side, className = '' }: { userId: number; side: 'me' | 'opp'; className?: string }) {
  const { t } = useTranslation();
  const bubble = useGame((s) => s.bubbles[userId]);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    // Старый пузырь (пришёл до перехода на этот экран) не показываем заново.
    const left = bubble ? SHOW_MS - (Date.now() - bubble.at) : 0;
    if (!bubble || left <= 0) return;
    setShown(bubble.id);
    const timer = window.setTimeout(() => setShown(null), left);
    return () => window.clearTimeout(timer);
  }, [bubble]);
  if (!bubble || shown !== bubble.id) return null;
  return (
    <div
      key={bubble.id}
      role="img"
      aria-label={t('reactions.from', { r: bubble.emoji })}
      className={`qd-bubble pointer-events-none absolute z-10 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-section text-[24px] ${className}`}
      style={{ boxShadow: `0 4px 0 var(--qd-lip), 0 0 0 3px var(${side === 'me' ? '--qd-me' : '--qd-opp'})` }}
    >
      {bubble.emoji}
    </div>
  );
}
