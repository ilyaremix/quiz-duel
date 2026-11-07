import { useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameView } from '@quiz-duel/shared';
import { BALLS } from '../components/Ball';
import { Button } from '../components/Button';
import { CategoryChip } from '../components/CategoryTile';
import { Icon } from '../components/Icon';
import { EmptySeat, PlayerCard } from '../components/PlayerCard';
import { formatClock, useServerNow } from '../hooks/useServerNow';
import { gameActions, useGame } from '../lib/game';

function VsBadge() {
  return (
    <span
      aria-hidden="true"
      className="qd-vs absolute top-1/2 left-1/2 z-[2] -translate-x-1/2 -translate-y-1/2"
      style={{ height: 30, padding: '0 11px', borderRadius: 15, fontSize: 13 }}
    >
      VS
    </span>
  );
}
export { VsBadge };

/** Экран 5: создатель ждёт соперника - ссылка, «Пригласить», «Скопировать», отсчёт жизни лобби. */
export function LobbyWaitScreen({ game }: { game: GameView }) {
  const { t } = useTranslation();
  const now = useServerNow(500);
  const invite = useGame((s) => (s.invite?.gameId === game.id ? s.invite : null));
  const cancelling = useGame((s) => Boolean(s.pending['game:cancel']));

  useEffect(() => {
    void gameActions.prefetchInvite(game.id);
  }, [game.id]);

  const left = (game.lobbyExpiresAt ?? now) - now;
  const expiring = left < 60_000;
  const time = formatClock(left);
  const shownLink = invite?.link.replace(/^https:\/\//, '') ?? '';

  return (
    <main className="qd-screen flex flex-col gap-[18px]">
      <header className="qd-in flex flex-col items-center gap-2.5 text-center">
        <CategoryChip cat={game.category} />
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">{t('s05.title')}</h1>
        <p className="m-0 text-[15px] font-medium text-hint">{t('s05.sub')}</p>
        <span
          className={`qd-chip qd-num ${expiring ? 'qd-chip-gold' : ''}`}
          style={{ height: 30, padding: '0 12px', borderRadius: 15, transition: 'color 200ms ease', color: expiring ? undefined : 'var(--tg-theme-hint-color)' }}
        >
          <Icon glyph="clock" size={14} stroke={2.5} />
          {expiring ? t('s05.expiring', { t: time }) : t('s05.open', { t: time })}
        </span>
      </header>

      <div className="qd-in qd-d1 relative grid grid-cols-2 gap-3">
        <PlayerCard id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} rating={game.me.rating} side="me" status="host" />
        <EmptySeat />
        <VsBadge />
      </div>

      <div className="qd-in qd-d2 qd-card flex items-center gap-2.5 rounded-[28px] py-1.5 pr-1.5 pl-4">
        <span aria-hidden="true" className="flex text-hint">
          <Icon glyph="link" size={18} />
        </span>
        <span className="min-w-0 grow truncate text-[14px] font-medium text-hint">{shownLink}</span>
        <button
          type="button"
          aria-label={t('s05.copyAria')}
          onClick={() => void gameActions.copyLink()}
          className="qd-press qd-ball h-11 w-11 cursor-pointer border-0 p-0"
          style={{ '--qd-ball': BALLS.brand.color, '--qd-ball-glow': BALLS.brand.glow, color: BALLS.brand.ink } as CSSProperties}
        >
          <Icon glyph="copy" size={18} />
        </button>
      </div>

      <div className="grow" />

      <div className="qd-in qd-d3 flex flex-col gap-3">
        <Button icon={<Icon glyph="send" size={22} stroke={2.4} />} onClick={() => void gameActions.shareInvite(t('s05.shareText'))}>
          {t('s05.invite')}
        </Button>
        <Button variant="secondary" size="m" icon={<Icon glyph="copy" size={20} stroke={2.4} />} onClick={() => void gameActions.copyLink()}>
          {t('s05.copy')}
        </Button>
        <Button variant="ghost" size="s" disabled={cancelling} onClick={() => void gameActions.cancel()}>
          {t('s05.cancel')}
        </Button>
      </div>
    </main>
  );
}
