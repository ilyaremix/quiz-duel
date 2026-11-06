import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameView } from '@quiz-duel/shared';
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

  return (
    <main className="qd-screen qd-screen-in flex flex-col gap-[18px]">
      <header className="flex flex-col items-center gap-2.5 text-center">
        <CategoryChip cat={game.category} />
        <h1 className="m-0 text-[28px] font-black">{t('s08.title')}</h1>
        <p className="m-0 text-[15px] font-semibold text-hint">{t('s08.sub')}</p>
      </header>

      <div className="relative grid grid-cols-2 gap-3">
        <div className="qd-slide-l">
          <PlayerCard id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} rating={game.me.rating} side="me" status="ready" />
        </div>
        <div className="qd-slide-r">
          <PlayerCard id={opp.userId} name={opp.name} photoUrl={opp.photoUrl} rating={opp.rating} side="opp" status="ready" />
        </div>
        <div
          aria-hidden="true"
          className="qd-pop-late absolute top-1/2 left-1/2 -mt-7 -ml-7 box-border flex h-14 w-14 items-center justify-center rounded-full border-4 border-page text-[17px] font-black"
          style={{ background: 'var(--qd-gold)', color: '#2A1F05' }}
        >
          VS
        </div>
      </div>

      <div className="flex grow flex-col items-center justify-center gap-[18px]">
        <div
          role="timer"
          aria-label={t('s08.aria', { n: count })}
          className="qd-num box-border flex h-[200px] w-[200px] items-center justify-center rounded-full text-[120px] leading-none font-black"
          style={{
            background: 'var(--qd-brand-tint)',
            border: '6px solid var(--qd-brand)',
            boxShadow: '0 6px 0 var(--qd-lip)',
            color: 'var(--qd-brand-text)',
          }}
        >
          {/* Новая цифра - новый элемент: появление проигрывается заново. */}
          <span key={count} className="qd-count">
            {count}
          </span>
        </div>
        <span
          className="text-[20px] font-black transition-colors duration-200"
          style={{ color: count === 1 ? 'var(--qd-gold-text)' : 'var(--tg-theme-hint-color)' }}
        >
          {t(`s08.words.w${count}`)}
        </span>
      </div>
    </main>
  );
}
