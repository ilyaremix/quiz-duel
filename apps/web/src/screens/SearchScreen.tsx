import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { queueRange, type MeResponse } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Ball, BALLS } from '../components/Ball';
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
    <main className="qd-screen flex flex-col gap-[18px]">
      <header className="qd-in flex flex-col items-center gap-2.5 text-center">
        <span className="qd-chip" style={{ height: 30, padding: '0 12px 0 5px', borderRadius: 15 }}>
          <Ball size={20} {...BALLS.brand} style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 0 10px var(--qd-brand-glow)' }}>
            <Icon glyph="shuffle" size={12} stroke={2.6} />
          </Ball>
          {t('s07.badge', { cat: t('cat.mix.title') })}
        </span>
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">{t(`s07.${st}.title`)}</h1>
        <p className="m-0 max-w-[300px] text-[15px] leading-[1.35] font-medium text-hint">{t(`s07.${st}.sub`)}</p>
      </header>

      <div className="flex grow items-center justify-center">
        {notFound ? (
          <div
            aria-hidden="true"
            className="qd-pop flex h-40 w-40 items-center justify-center rounded-full"
            style={{
              background:
                'linear-gradient(155deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.06) 55%), radial-gradient(circle at 50% 118%, var(--qd-brand-glow), rgba(155, 92, 255, 0) 64%), var(--qd-glass)',
              boxShadow: 'inset 0 1.5px 0 rgba(255, 255, 255, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.2), 0 0 60px var(--qd-brand-glow), 0 18px 36px rgba(3, 4, 20, 0.3)',
              color: 'var(--qd-brand-text)',
            }}
          >
            <span className="qd-bob flex">
              <Icon glyph="clock" size={64} stroke={2} />
            </span>
          </div>
        ) : (
          // Радар: стеклянный диск с вращающимся лучом и волнами от аватара.
          <div role="img" aria-label={t('s07.aria')} className="relative h-[300px] w-[300px]">
            <div aria-hidden="true" className="absolute inset-0 box-border rounded-full" style={{ border: '1.5px dashed var(--qd-dash)' }} />
            <div aria-hidden="true" className="qd-glass absolute top-10 left-10 h-[220px] w-[220px] rounded-full" />
            <div
              aria-hidden="true"
              className="qd-turn absolute top-10 left-10 h-[220px] w-[220px] rounded-full"
              style={{
                background: 'conic-gradient(from 0deg, rgba(155, 92, 255, 0) 0deg, rgba(155, 92, 255, 0) 270deg, rgba(155, 92, 255, 0.55) 360deg)',
                animationDuration: '2400ms',
              }}
            />
            <div
              aria-hidden="true"
              className="qd-halo absolute top-[70px] left-[70px] h-40 w-40 rounded-full"
              style={{ background: 'radial-gradient(closest-side, var(--qd-me-glow), rgba(79, 141, 255, 0))' }}
            />
            {['', 'qd-r2', 'qd-r3'].map((r) => (
              <span
                key={r || 'r1'}
                aria-hidden="true"
                className={`qd-ripple ${r} absolute top-[106px] left-[106px] box-border h-[88px] w-[88px] rounded-full`}
                style={{ borderColor: 'rgba(170, 190, 255, 0.75)' }}
              />
            ))}
            <div className="absolute top-[106px] left-[106px]">
              <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={88} ring="me" on="none" />
            </div>
            <div
              aria-hidden="true"
              className="qd-dots qd-glass absolute top-[22px] left-[234px] flex h-[42px] w-[42px] items-center justify-center rounded-full text-[18px] font-bold"
              style={{ color: 'var(--qd-opp-text)' }}
            >
              ?
            </div>
            <div
              aria-hidden="true"
              className="qd-glass absolute top-[178px] left-7 flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-bold text-hint"
            >
              ?
            </div>
          </div>
        )}
      </div>

      {notFound ? (
        <div className="qd-in qd-d1 flex flex-col gap-3">
          <Button icon={<Icon glyph="duel" size={22} stroke={2.4} />} onClick={() => (gameActions.quickLeave(), gameActions.openCreate(me.docsAccepted))}>
            {t('s07.create')}
          </Button>
          <Button
            variant="secondary"
            size="m"
            icon={<Icon glyph="target" size={20} stroke={2.4} />}
            onClick={() => (gameActions.quickLeave(), gameActions.openSolo(me.docsAccepted))}
          >
            {t('s07.training')}
          </Button>
          <Button variant="ghost" size="s" onClick={() => void gameActions.quickJoin(me.docsAccepted)}>
            {t('s07.retry')}
          </Button>
        </div>
      ) : (
        <>
          <div className="qd-in qd-d1 grid grid-cols-2 gap-3">
            <div className="qd-card flex flex-col gap-1 rounded-[24px] px-4 py-3.5">
              <span className="text-[13px] font-medium text-hint">{t('s07.elapsed')}</span>
              <span role="timer" className="qd-num text-[28px] font-bold tracking-[-0.02em]">
                {formatClock(Math.floor(elapsed / 1000) * 1000)}
              </span>
            </div>
            <div className="qd-card flex flex-col gap-1 rounded-[24px] px-4 py-3.5">
              <span className="text-[13px] font-medium text-hint">{t('s07.range')}</span>
              <span className="qd-num flex items-center gap-[5px] text-[20px] font-bold whitespace-nowrap text-gold-text">
                <Icon glyph="rating" size={16} stroke={2.5} />
                {formatNumber(Math.max(0, rating - w), lang)} - {formatNumber(rating + w, lang)}
              </span>
              <span className="text-[12px] font-medium text-hint">{t('s07.widen')}</span>
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
