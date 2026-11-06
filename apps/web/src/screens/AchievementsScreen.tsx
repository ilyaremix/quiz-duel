import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Achievement } from '../components/Achievement';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { TabDock } from '../components/TabDock';
import { api, queryKeys } from '../lib/api';
import { gameActions } from '../lib/game';
import { onBack } from '../lib/telegram';

/** Новая - получена меньше суток назад: с блеском бейджа и подписью «Новая ачивка!». */
const FRESH_MS = 24 * 3_600_000;

/** Экран 18: сетка 12 ачивок - полученные цветные, закрытые серые с прогрессом «37/100». */
export function AchievementsScreen() {
  const { t } = useTranslation();
  const list = useQuery({ queryKey: queryKeys.achievements, queryFn: api.achievements });
  const data = list.data;

  // Системная «Назад» Telegram - обратно в профиль.
  useEffect(() => onBack(gameActions.closeAchievements), []);

  const pct = data ? Math.round((data.unlocked / data.total) * 100) : 0;
  const now = Date.now();

  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen qd-screen-in flex flex-col gap-4 pb-[120px]!" aria-busy={list.isPending}>
        <header className="flex flex-col gap-2">
          <h1 className="m-0 text-[28px] font-black">{t('s18.title')}</h1>
          <div className="flex items-center gap-2.5">
            <div
              role="progressbar"
              aria-label={t('s18.aria')}
              aria-valuemin={0}
              aria-valuemax={data?.total ?? 12}
              aria-valuenow={data?.unlocked ?? 0}
              className="h-2 grow overflow-hidden rounded bg-section"
            >
              <div className="h-2 rounded bg-gold" style={{ width: `${pct}%` }} />
            </div>
            <span className="qd-num text-[14px] font-extrabold text-hint">{data ? t('s18.count', { n: data.unlocked, m: data.total }) : ''}</span>
          </div>
        </header>

        {list.isError && (
          <div className="flex flex-col gap-3">
            <Notice glyph="alert" title={t('s18.error')} text={t('toast.loadFailed')} />
            <Button variant="secondary" onClick={() => void list.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-2.5">
          {data
            ? data.items.map((a) => (
                <Achievement
                  key={a.code}
                  layout="tile"
                  code={a.code}
                  state={!a.unlocked ? 'locked' : a.unlockedAt && now - a.unlockedAt < FRESH_MS ? 'new' : 'unlocked'}
                  current={a.current}
                  goal={a.goal}
                />
              ))
            : list.isPending && Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true" className="qd-skel h-[172px] rounded-[20px] bg-section" />)}
        </section>
      </main>
      <TabDock active="profile" />
    </div>
  );
}
