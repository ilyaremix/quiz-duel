import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameView } from '@quiz-duel/shared';
import { useAuroraTone } from '../components/Aurora';
import { CategoryChip } from '../components/CategoryTile';
import { PlayerCard } from '../components/PlayerCard';
import { haptic } from '../lib/telegram';

/**
 * Экран 8: два игрока напротив и крупно 3-2-1. Цифру считает клиент по дедлайну
 * сервера (phaseEndsAt), поэтому у обоих игроков она меняется одновременно.
 */
export function VsScreen({ game, count }: { game: GameView; count: 1 | 2 | 3 }) {
  const { t } = useTranslation();
  const opp = game.opponent!;

  useEffect(() => {
    haptic.tick();
  }, [count]);
  // Фон: синий против оранжевого.
  useAuroraTone('vs');

  return (
    <main className="qd-screen flex flex-col gap-[18px]">
      <header className="qd-in flex flex-col items-center gap-2.5 text-center">
        <CategoryChip cat={game.category} />
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">{t('s08.title')}</h1>
        <p className="m-0 text-[15px] font-medium text-hint">
          {t('s08.subRules', {
            mode: t(`s32.mode.${game.rules.variant}.t`),
            n: game.rules.count,
            questions: t('plural.question', { count: game.rules.count }),
            t: game.rules.timeSec,
          })}
        </p>
      </header>

      <div className="relative grid grid-cols-2 gap-3">
        <div className="qd-slide-l">
          <PlayerCard id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} glow={game.me.glow} rating={game.me.rating} side="me" status="ready" />
        </div>
        <div className="qd-slide-r">
          <PlayerCard id={opp.userId} name={opp.name} photoUrl={opp.photoUrl} glow={opp.glow} rating={opp.rating} side="opp" status="ready" />
        </div>
        {/* VS - белая глянцевая сфера на уровне аватарок: там по бокам пусто, а длинные имена ниже она не закрывает. */}
        <div
          aria-hidden="true"
          className="qd-pop-late absolute top-[22px] left-1/2 z-[2] -ml-8 flex h-16 w-16 items-center justify-center rounded-full text-[20px] font-extrabold tracking-[0.02em]"
          style={{
            background: 'radial-gradient(circle at 32% 25%, #FFFFFF, #E4E8FF 60%, #C9D0FF)',
            boxShadow: 'inset 0 -3px 8px rgba(60, 70, 160, 0.25), 0 0 0 4px var(--qd-ring-gap), 0 0 34px rgba(255, 255, 255, 0.5), 0 10px 26px rgba(0, 0, 0, 0.35)',
            color: '#0B0D24',
          }}
        >
          VS
        </div>
      </div>

      <div className="flex grow flex-col items-center justify-center gap-[18px]">
        {/* Цифра отсчёта - в стеклянной сфере внутри вращающегося радужного кольца. */}
        <div role="timer" aria-label={t('s08.aria', { n: count })} className="relative flex h-[220px] w-[220px] items-center justify-center">
          <span
            aria-hidden="true"
            className="qd-turn absolute inset-0 rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, rgba(79, 141, 255, 0), #4F8DFF, #9B5CFF, #FF6A88, #FFD36B, #22D3EE, rgba(79, 141, 255, 0))',
              WebkitMaskImage: 'radial-gradient(closest-side, transparent 88%, #000 90%, #000 97%, transparent 100%)',
              maskImage: 'radial-gradient(closest-side, transparent 88%, #000 90%, #000 97%, transparent 100%)',
              animationDuration: '2400ms',
            }}
          />
          <div
            className="qd-num flex h-[188px] w-[188px] items-center justify-center rounded-full text-[112px] leading-none font-bold tracking-[-0.04em]"
            style={{
              background:
                'linear-gradient(155deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.06) 55%), radial-gradient(circle at 50% 118%, rgba(155, 92, 255, 0.7), rgba(155, 92, 255, 0) 62%), var(--qd-glass)',
              boxShadow: 'inset 0 1.5px 0 rgba(255, 255, 255, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.2), 0 0 60px var(--qd-brand-glow), 0 20px 40px rgba(3, 4, 20, 0.35)',
              color: 'var(--tg-theme-text-color)',
              textShadow: 'var(--qd-text-glow)',
            }}
          >
            {/* Новая цифра - новый элемент: появление проигрывается заново. */}
            <span key={count} className="qd-count">
              {count}
            </span>
          </div>
        </div>
        <span
          className="text-[22px] font-bold tracking-[-0.01em]"
          style={{
            color: count === 1 ? 'var(--qd-gold-text)' : 'var(--tg-theme-hint-color)',
            textShadow: count === 1 ? '0 0 24px var(--qd-gold-glow)' : 'none',
            transition: 'color 200ms ease',
          }}
        >
          {t(`s08.words.w${count}`)}
        </span>
      </div>
    </main>
  );
}
