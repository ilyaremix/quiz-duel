import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { TIMINGS, type GameView } from '@quiz-duel/shared';
import { DisconnectBanner } from '../components/Banner';
import { useAuroraTone } from '../components/Aurora';
import { BALLS } from '../components/Ball';
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

  // Оба готовы - фон синий против оранжевого, как на VS.
  useAuroraTone(state === 'both' ? 'vs' : 'default');

  // Офлайн соперник (я создатель) - место освободится; офлайн создатель - лобби закроется.
  const offUntil = opp.seatFreesAt ?? game.lobbyExpiresAt ?? now;

  return (
    <main className="qd-screen flex flex-col gap-[18px]">
      <header className="qd-in flex flex-col items-center gap-2.5 text-center">
        <CategoryChip cat={game.category} />
        <h1 className="m-0 max-w-full truncate text-[28px] font-bold tracking-[-0.02em]">{t(`s06.${state}.title`, { opp: opp.name })}</h1>
        <p
          className="m-0 text-[15px]"
          style={{
            color: state === 'both' ? 'var(--qd-correct-text)' : 'var(--tg-theme-hint-color)',
            fontWeight: state === 'both' ? 600 : 500,
            transition: 'color 200ms ease',
          }}
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
        <div className="qd-in qd-d1">
          <PlayerCard id={me.userId} name={me.name} photoUrl={me.photoUrl} glow={me.glow} rating={me.rating} side="me" status={meStatus} />
        </div>
        <div key={opp.userId} className="qd-arrive">
          <PlayerCard
            id={opp.userId}
            name={opp.name}
            photoUrl={opp.photoUrl}
            glow={opp.glow}
            rating={opp.rating}
            side="opp"
            status={oppStatus}
            avatarLabel={t('s12.oppAria', { opp: opp.name })}
            onAvatar={() => gameActions.openOpp(opp.userId)}
          />
        </div>
        {state === 'both' ? (
          // Оба готовы: вместо VS - зелёный шар с отсчётом до старта.
          <span
            role="timer"
            aria-label={t('s06.both.sub', { n: startIn })}
            className="qd-pop qd-ball qd-num absolute top-1/2 left-1/2 z-[2] -mt-7 -ml-7 h-14 w-14 text-[24px] font-bold"
            style={{ '--qd-ball': BALLS.ok.color, '--qd-ball-glow': BALLS.ok.glow, color: BALLS.ok.ink } as CSSProperties}
          >
            <span key={startIn} className="qd-count">
              {startIn}
            </span>
          </span>
        ) : (
          <VsBadge />
        )}
        <ReactionBubble userId={me.userId} side="me" className="-top-4 left-3.5" />
        <ReactionBubble userId={opp.userId} side="opp" className="-top-4 right-3.5" />
      </div>

      <section className="qd-in qd-d2 flex flex-col gap-2.5">
        <span className="text-center text-[13px] font-semibold text-hint">{t('s06.tease')}</span>
        <Reactions />
      </section>

      <div className="grow" />

      <div className="qd-in qd-d3 flex flex-col gap-3">
        {countdown ? (
          <Button disabled>{t('s06.starting')}</Button>
        ) : me.ready ? (
          <Button variant="secondary" disabled={readyBusy} onClick={() => void gameActions.ready(false)}>
            {t('s06.unready')}
          </Button>
        ) : (
          <Button disabled={readyBusy} icon={<Icon glyph="check" size={22} stroke={2.4} />} onClick={() => void gameActions.ready(true)}>
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
