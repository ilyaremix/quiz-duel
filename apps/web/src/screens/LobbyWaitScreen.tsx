import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameView } from '@quiz-duel/shared';
import { Button } from '../components/Button';
import { CategoryChip } from '../components/CategoryTile';
import { Icon } from '../components/Icon';
import { EmptySeat, PlayerCard } from '../components/PlayerCard';
import { formatClock, useServerNow } from '../hooks/useServerNow';
import { gameActions, useGame } from '../lib/game';

function VsBadge() {
  return (
    <div
      aria-hidden="true"
      className="absolute top-1/2 left-1/2 -mt-[22px] -ml-[22px] box-border flex h-11 w-11 items-center justify-center rounded-full border-4 border-page text-[13px] font-black"
      style={{ background: 'var(--qd-gold)', color: '#2A1F05' }}
    >
      VS
    </div>
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
    <main className="qd-screen qd-screen-in flex flex-col gap-[18px]">
      <header className="flex flex-col items-center gap-2.5 text-center">
        <CategoryChip cat={game.category} />
        <h1 className="m-0 text-[28px] font-black">{t('s05.title')}</h1>
        <p className="m-0 text-[15px] font-semibold text-hint">{t('s05.sub')}</p>
        <span
          className="qd-num flex h-[30px] items-center gap-1.5 rounded-[15px] px-3 text-[13px] font-extrabold transition-colors duration-200"
          style={
            expiring
              ? { background: 'var(--qd-gold-tint)', color: 'var(--qd-gold-text)' }
              : { background: 'var(--tg-theme-section-bg-color)', color: 'var(--tg-theme-hint-color)' }
          }
        >
          <Icon glyph="clock" size={14} stroke={2.5} />
          {expiring ? t('s05.expiring', { t: time }) : t('s05.open', { t: time })}
        </span>
      </header>

      <div className="relative grid grid-cols-2 gap-3">
        <PlayerCard id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} rating={game.me.rating} side="me" status="host" />
        <EmptySeat />
        <VsBadge />
      </div>

      <div className="flex items-center gap-2.5 rounded-[18px] bg-section py-1.5 pr-1.5 pl-3.5">
        <span aria-hidden="true" className="flex text-hint">
          <Icon glyph="link" size={18} />
        </span>
        <span className="min-w-0 grow truncate text-[14px] font-bold text-hint">{shownLink}</span>
        <button
          type="button"
          aria-label={t('s05.copyAria')}
          onClick={() => void gameActions.copyLink()}
          className="qd-press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[14px] border-0 bg-brand-tint p-0 text-brand-text"
        >
          <Icon glyph="copy" size={18} />
        </button>
      </div>

      <div className="grow" />

      <div className="flex flex-col gap-3">
        <Button icon={<Icon glyph="send" size={22} stroke={2.5} />} onClick={() => void gameActions.shareInvite(t('s05.shareText'))}>
          {t('s05.invite')}
        </Button>
        <Button variant="secondary" size="m" icon={<Icon glyph="copy" size={20} stroke={2.5} />} onClick={() => void gameActions.copyLink()}>
          {t('s05.copy')}
        </Button>
        <Button variant="ghost" size="s" disabled={cancelling} onClick={() => void gameActions.cancel()}>
          {t('s05.cancel')}
        </Button>
      </div>
    </main>
  );
}
