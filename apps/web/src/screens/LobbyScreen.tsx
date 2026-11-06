import { useTranslation } from 'react-i18next';
import { TIMINGS, type GameView } from '@quiz-duel/shared';
import { DisconnectBanner } from '../components/Banner';
import { Button } from '../components/Button';
import { CategoryChip } from '../components/CategoryTile';
import { Icon } from '../components/Icon';
import { PlayerCard, type PlayerStatus } from '../components/PlayerCard';
import { ReactionBubble, Reactions } from '../components/Reactions';
import { formatClock, useServerNow } from '../hooks/useServerNow';
import { gameActions, useGame } from '../lib/game';
import { VsBadge } from './LobbyWaitScreen';

type LobbyState = 'none' | 'oppReady' | 'meReady' | 'both' | 'oppOffline';

/** Экран 6: оба в лобби - карточки, «Готов» / «Снять „Готов“», отсчёт до старта, соперник не в сети. */
export function LobbyScreen({ game }: { game: GameView }) {
  const { t } = useTranslation();
  const now = useServerNow(250);
  const readyBusy = useGame((s) => Boolean(s.pending.ready));
  const leaving = useGame((s) => Boolean(s.pending['game:leave']));
  const opp = game.opponent!;
  const me = game.me;
  const iAmCreator = game.creatorId === me.userId;

  const countdown = game.phase === 'countdown';
  const state: LobbyState = countdown
    ? 'both'
    : !opp.online
      ? 'oppOffline'
      : me.ready
        ? 'meReady'
        : opp.ready
          ? 'oppReady'
          : 'none';

  // Лобби-часть отсчёта: после неё ещё 3 с экрана VS.
  const startIn = Math.max(1, Math.ceil(((game.phaseEndsAt ?? now) - TIMINGS.vsMs - now) / 1000));
  const meStatus: PlayerStatus = me.ready ? 'ready' : 'notready';
  const oppStatus: PlayerStatus = !opp.online ? 'offline' : opp.ready ? 'ready' : 'notready';

  // Офлайн соперник (я создатель) - место освободится; офлайн создатель - лобби закроется.
  const offUntil = opp.seatFreesAt ?? game.lobbyExpiresAt ?? now;

  return (
    <main className="qd-screen qd-screen-in flex flex-col gap-[18px]">
      <header className="flex flex-col items-center gap-2.5 text-center">
        <CategoryChip cat={game.category} />
        <h1 className="m-0 max-w-full truncate text-[28px] font-black">{t(`s06.${state}.title`, { opp: opp.name })}</h1>
        <p
          className="m-0 text-[15px] font-semibold transition-colors duration-200"
          style={{ color: state === 'both' ? 'var(--qd-correct-text)' : 'var(--tg-theme-hint-color)' }}
        >
          {t(`s06.${state}.sub`, { opp: opp.name, n: startIn })}
        </p>
      </header>

      {state === 'oppOffline' && (
        <div className="qd-toast-in">
          <DisconnectBanner
            title={t('s06.offTitle', { opp: opp.name })}
            text={t(iAmCreator ? 's06.offText' : 's06.offTextHost')}
            time={formatClock(offUntil - now)}
          />
        </div>
      )}

      <div className="relative grid grid-cols-2 gap-3">
        <PlayerCard id={me.userId} name={me.name} photoUrl={me.photoUrl} rating={me.rating} side="me" status={meStatus} />
        <div key={opp.userId} className="qd-arrive">
          <PlayerCard
            id={opp.userId}
            name={opp.name}
            photoUrl={opp.photoUrl}
            rating={opp.rating}
            side="opp"
            status={oppStatus}
            avatarLabel={t('s12.oppAria', { opp: opp.name })}
            onAvatar={() => gameActions.openOpp(opp.userId)}
          />
        </div>
        <VsBadge />
        <ReactionBubble userId={me.userId} side="me" className="top-[-14px] left-[18px]" />
        <ReactionBubble userId={opp.userId} side="opp" className="top-[-14px] right-[18px]" />
      </div>

      <section className="flex flex-col gap-2.5">
        <span className="text-center text-[13px] font-extrabold text-hint">{t('s06.tease')}</span>
        <Reactions />
      </section>

      <div className="grow" />

      <div className="flex flex-col gap-3">
        {countdown ? (
          <Button disabled>{t('s06.starting')}</Button>
        ) : me.ready ? (
          <Button variant="secondary" disabled={readyBusy} onClick={() => void gameActions.ready(false)}>
            {t('s06.unready')}
          </Button>
        ) : (
          <Button disabled={readyBusy} icon={<Icon glyph="check" size={22} stroke={2.5} />} onClick={() => void gameActions.ready(true)}>
            {t('s06.ready')}
          </Button>
        )}
        <Button variant="ghost" size="s" disabled={leaving} onClick={() => void gameActions.leave()}>
          {t('s06.leave')}
        </Button>
      </div>
    </main>
  );
}
