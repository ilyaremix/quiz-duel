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
  const player = q.data?.player ?? (known ? { id: known.userId, name: known.name, username: known.username, photoUrl: known.photoUrl, rating: known.rating } : null);
  const h = q.data?.headToHead;
  const tiles = statTiles(q.data?.stats ?? null, t, lang).filter((s) => ['games', 'winrate', 'accuracy', 'avgTime'].includes(s.key));

  return (
    <Sheet open={userId !== null} label={t('s17.aria')} onClose={gameActions.closeOpp}>
      {player && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <Avatar id={player.id} name={player.name} photoUrl={player.photoUrl} size={72} ring="opp" on="page" badge={known ? (known.online && !known.left ? 'online' : 'offline') : 'none'} />
            <div className="mt-1 flex flex-col">
              <span className="max-w-[300px] truncate text-[22px] font-black">{player.name}</span>
              {player.username && <span className="text-[14px] font-semibold text-hint">@{player.username}</span>}
            </div>
            <div className="qd-num flex items-center gap-1.5">
              <span className="flex h-6 items-center gap-1 rounded-xl px-2.5 text-[13px] font-extrabold" style={{ background: 'var(--qd-gold-tint)', color: 'var(--qd-gold-text)' }}>
                <Icon glyph="rating" size={13} stroke={2.5} />
                {formatNumber(q.data?.stats.rating ?? player.rating, lang)}
              </span>
              <span className="flex h-6 items-center rounded-xl bg-surface-2 px-2.5 text-[13px] font-bold text-hint">
                {q.data?.stats.place ? t('s03.place', { n: formatNumber(q.data.stats.place, lang) }) : t('s03.newbie')}
              </span>
            </div>
          </div>

          <div className="box-border flex w-full flex-col items-center gap-2 rounded-[20px] bg-surface-2 px-4 py-3.5" aria-busy={q.isPending}>
            <span className="text-[13px] font-extrabold text-hint">{t('s17.h2h')}</span>
            <div className="flex items-center gap-3.5">
              <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={36} ring="me" on="none" />
              <span className="qd-num text-[36px] leading-none font-black">
                <span className="text-me-text">{h ? h.me : '·'}</span>
                <span className="text-hint"> : </span>
                <span className="text-opp-text">{h ? h.opp : '·'}</span>
              </span>
              <Avatar id={player.id} name={player.name} photoUrl={player.photoUrl} size={36} ring="opp" on="none" />
            </div>
            <span className="text-[13px] font-semibold text-hint">
              {q.isError ? t('s17.error') : !h ? ' ' : h.games === 0 || h.lastAt === null ? t('s17.first') : t('s17.meta', { count: h.games, when: formatWhen(h.lastAt, t, lang) })}
            </span>
          </div>

          <div className="grid w-full grid-cols-4 gap-2">
            {tiles.map((s) => (
              <StatTile key={s.key} value={q.data ? s.value : '·'} label={s.label} on="card" muted={!q.data} />
            ))}
          </div>

          <div className="w-full">
            <Button variant="ghost" size="s" onClick={gameActions.closeOpp}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
