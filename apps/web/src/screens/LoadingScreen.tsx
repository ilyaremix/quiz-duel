import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '../components/Logo';

/** Экран 1: логотип и индикатор; дольше 3 с - «Подключаемся…». */
export function LoadingScreen() {
  const { t } = useTranslation();
  const [long, setLong] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLong(true), 3_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main aria-label={t('s01.aria')} aria-busy="true" className="qd-screen qd-screen-in flex flex-col items-center justify-center gap-6">
      <Logo size="l" />
      <p className="m-0 text-[15px] font-bold text-hint">{t('app.tagline')}</p>
      <div
        aria-hidden="true"
        className="qd-spin h-7 w-7 rounded-full border-[3px] border-surface-2"
        style={{ borderTopColor: 'var(--qd-brand)' }}
      />
      <div className="min-h-12 text-center" aria-live="polite">
        {long && (
          <div className="qd-fade-in flex flex-col gap-1">
            <span className="text-[17px] font-extrabold">{t('s01.long')}</span>
            <span className="text-[13px] font-bold text-hint">{t('s01.longHint')}</span>
          </div>
        )}
      </div>
    </main>
  );
}
