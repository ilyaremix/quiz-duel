import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ball, BALLS } from '../components/Ball';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';

/** Экран 1: логотип выпрыгивает на дышащем ореоле, под ним бегущий градиентный сегмент; дольше 3 с - «Подключаемся…». */
export function LoadingScreen() {
  const { t } = useTranslation();
  const [long, setLong] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLong(true), 3_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main aria-label={t('s01.aria')} aria-busy="true" className="qd-screen relative flex flex-col items-center">
      <div className="grow" />
      <div className="flex flex-col items-center gap-11">
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="qd-halo absolute h-80 w-80 rounded-full"
            style={{ background: 'radial-gradient(closest-side, var(--qd-brand-glow), rgba(155, 92, 255, 0))' }}
          />
          <div className="qd-trophy relative">
            <Logo size="l" />
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={t('s01.aria')}
          className="relative h-1.5 w-[140px] overflow-hidden rounded-[3px]"
          style={{ background: 'var(--qd-track)', boxShadow: 'inset 0 0 0 1px var(--qd-glass-rim)' }}
        >
          <span
            className="qd-load absolute top-0 left-0 h-1.5 w-11 rounded-[3px]"
            style={{ background: 'var(--qd-timer)', boxShadow: '0 0 12px rgba(155, 92, 255, 0.7)' }}
          />
        </div>
      </div>
      <div className="mt-10 flex min-h-[72px] w-full max-w-[326px] justify-center" aria-live="polite">
        {long && (
          <div role="status" className="qd-in qd-card box-border flex w-full items-center gap-3 rounded-[26px] py-3.5 pr-[18px] pl-3.5">
            <Ball size={42} {...BALLS.brand}>
              <Icon glyph="clock" size={20} stroke={2.3} />
            </Ball>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[16px] font-bold">{t('s01.long')}</span>
              <span className="text-[13px] leading-[1.35] font-medium text-hint">{t('s01.longHint')}</span>
            </span>
          </div>
        )}
      </div>
      <div className="grow" />
      <span className="pb-5 text-center text-[13px] font-medium text-hint">{t('app.tagline')}</span>
    </main>
  );
}
