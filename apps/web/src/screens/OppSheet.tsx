import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { StatTile } from '../components/StatTile';
import { formatNumber } from '../i18n';
import { api, queryKeys } from '../lib/api';
import { formatWhen } from '../lib/format';
import { gameActions, useGame } from '../lib/game';
import { statTiles } from './ProfileScreen';

/** Экран 17: шторка профиля соперника по тапу на аватарку - рейтинг, цифры и личный счёт встреч. */
export function OppSheet({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const userId = useGame((s) => s.oppSheet);
  const game = useGame((s) => s.game);
  const q = useQuery({ queryKey: queryKeys.player(userId ?? 0), queryFn: () => api.player(userId!), enabled: userId !== null, staleTime: 10_000 });

  // Пока профиль грузится, показываем то, что уже известно из снимка партии.
  const known = game?.opponent?.userId === userId ? game.opponent : null;
  const player =
    q.data?.player ?? (known ? { id: known.userId, name: known.name, username: known.username, photoUrl: known.photoUrl, rating: known.rating } : null);
  const h = q.data?.headToHead;
  const tiles = statTiles(q.data?.stats ?? null, t, lang).filter((s) => ['games', 'winrate', 'accuracy', 'avgTime'].includes(s.key));

  return (
    <Sheet open={userId !== null} label={t('s17.aria')} onClose={gameActions.closeOpp}>
      {player && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <Avatar
              id={player.id}
              name={player.name}
              photoUrl={player.photoUrl}
              size={76}
              ring="opp"
              on="none"
              badge={known ? (known.online && !known.left ? 'online' : 'offline') : 'none'}
            />
            <div className="mt-1 flex flex-col">
              <span className="max-w-[300px] truncate text-[23px] font-bold tracking-[-0.02em]">{player.name}</span>
              {player.username && <span className="text-[14px] font-medium text-hint">@{player.username}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="qd-chip qd-chip-gold qd-num">
                <Icon glyph="rating" size={14} stroke={2.6} />
                {formatNumber(q.data?.stats.rating ?? player.rating, lang)}
              </span>
              <span className="qd-chip qd-num" style={{ color: 'var(--tg-theme-hint-color)' }}>
                {q.data?.stats.place ? t('s03.place', { n: formatNumber(q.data.stats.place, lang) }) : t('s03.newbie')}
              </span>
            </div>
          </div>

          <div className="qd-card box-border flex w-full flex-col items-center gap-2 rounded-[26px] px-4 py-3.5" aria-busy={q.isPending}>
            <span className="text-[13px] font-semibold text-hint">{t('s17.h2h')}</span>
            <div className="flex items-center gap-3.5">
              <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={38} ring="me" on="none" />
              <span className="qd-num text-[38px] leading-none font-bold tracking-[-0.02em]">
                <span style={{ color: 'var(--qd-me-text)', textShadow: '0 0 18px var(--qd-me-glow)' }}>{h ? h.me : '·'}</span>
                <span style={{ color: 'var(--qd-dash)' }}> : </span>
                <span style={{ color: 'var(--qd-opp-text)', textShadow: '0 0 18px var(--qd-opp-glow)' }}>{h ? h.opp : '·'}</span>
              </span>
              <Avatar id={player.id} name={player.name} photoUrl={player.photoUrl} size={38} ring="opp" on="none" />
            </div>
            <span className="text-[13px] font-medium text-hint">
              {q.isError
                ? t('s17.error')
                : !h
                  ? ' '
                  : h.games === 0 || h.lastAt === null
                    ? t('s17.first')
                    : t('s17.meta', { count: h.games, when: formatWhen(h.lastAt, t, lang) })}
            </span>
          </div>

          <div className="grid w-full grid-cols-4 gap-2">
            {tiles.map((s) => (
              <StatTile key={s.key} value={q.data ? s.value : '·'} label={s.label} on="card" muted={!q.data} />
            ))}
          </div>

          <div className="w-full">
            <Button variant="secondary" size="m" onClick={gameActions.closeOpp}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
