import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { queueRange, type MeResponse } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { formatClock, useServerNow } from '../hooks/useServerNow';
import { formatNumber } from '../i18n';
import { gameActions, useGame } from '../lib/game';
import { onBack } from '../lib/telegram';

/** Экран 7: поиск соперника - секундомер, окно рейтинга (шире каждые 5 с), «Отмена»; через 60 с - «Никого не нашли». */
export function SearchScreen({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const search = useGame((s) => s.search);
  const leaving = useGame((s) => Boolean(s.pending.queue));
  const now = useServerNow(250);

  // Системная «Назад» Telegram - отмена поиска.
  useEffect(() => onBack(gameActions.quickLeave), []);

  const notFound = search === 'notFound';
  const elapsed = search && search !== 'notFound' ? Math.max(0, now - search.since) : 0;
  const rating = search && search !== 'notFound' ? search.rating : me.rating;
  const w = queueRange(elapsed);
  const st = notFound ? 'notFound' : 'searching';

  return (
    <main className="qd-screen qd-screen-in flex flex-col gap-[18px]">
      <header className="flex flex-col items-center gap-2.5 text-center">
        <span className="flex h-[30px] items-center gap-1.5 rounded-[15px] bg-section px-3 text-[13px] font-extrabold text-brand-text">
          <Icon glyph="shuffle" size={14} stroke={2.5} />
          {t('s07.badge', { cat: t('cat.mix.title') })}
        </span>
        <h1 className="m-0 text-[28px] font-black">{t(`s07.${st}.title`)}</h1>
        <p className="m-0 max-w-[300px] text-[15px] leading-[1.35] font-semibold text-hint">{t(`s07.${st}.sub`)}</p>
      </header>

      <div className="flex grow items-center justify-center">
        {notFound ? (
          <div aria-hidden="true" className="qd-pop flex h-40 w-40 items-center justify-center rounded-full bg-section text-hint shadow-[0_4px_0_var(--qd-lip)]">
            <Icon glyph="clock" size={64} stroke={2} />
          </div>
        ) : (
          <div role="img" aria-label={t('s07.aria')} className="relative h-[300px] w-[300px]">
            <div aria-hidden="true" className="absolute inset-0 box-border rounded-full border-2 border-brand-tint" />
            <div aria-hidden="true" className="absolute top-10 left-10 box-border h-[220px] w-[220px] rounded-full border-2 border-brand-tint bg-section" />
            <div aria-hidden="true" className="qd-pulse absolute top-20 left-20 h-[140px] w-[140px] rounded-full bg-brand-tint" />
            <div className="absolute top-[106px] left-[106px]">
              <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={88} ring="me" />
            </div>
            <div aria-hidden="true" className="qd-dots absolute top-6 left-[236px] flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-[17px] font-black text-hint">
              ?
            </div>
            <div aria-hidden="true" className="absolute top-[176px] left-[30px] flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[14px] font-black text-hint">
              ?
            </div>
          </div>
        )}
      </div>

      {notFound ? (
        <div className="flex flex-col gap-3">
          <Button icon={<Icon glyph="duel" size={22} stroke={2.5} />} onClick={() => (gameActions.quickLeave(), gameActions.openCreate(me.docsAccepted))}>
            {t('s07.create')}
          </Button>
          <Button variant="secondary" size="m" icon={<Icon glyph="target" size={20} stroke={2.5} />} onClick={() => (gameActions.quickLeave(), gameActions.openSolo(me.docsAccepted))}>
            {t('s07.training')}
          </Button>
          <Button variant="ghost" size="s" onClick={() => void gameActions.quickJoin(me.docsAccepted)}>
            {t('s07.retry')}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-[20px] bg-section px-4 py-3.5">
              <span className="text-[13px] font-bold text-hint">{t('s07.elapsed')}</span>
              <span role="timer" className="qd-num text-[28px] font-black">
                {formatClock(Math.floor(elapsed / 1000) * 1000)}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-[20px] bg-section px-4 py-3.5">
              <span className="text-[13px] font-bold text-hint">{t('s07.range')}</span>
              <span className="qd-num flex items-center gap-[5px] text-[20px] font-black whitespace-nowrap text-gold-text">
                <Icon glyph="rating" size={16} stroke={2.5} />
                {formatNumber(Math.max(0, rating - w), lang)} - {formatNumber(rating + w, lang)}
              </span>
              <span className="text-[12px] font-semibold text-hint">{t('s07.widen')}</span>
            </div>
          </div>
          <Button variant="secondary" disabled={leaving} onClick={gameActions.quickLeave}>
            {t('s07.cancel')}
          </Button>
        </>
      )}
    </main>
  );
}
