import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LangSetting, MeResponse } from '@quiz-duel/shared';
import { Segmented } from '../components/Segmented';
import { gameActions } from '../lib/game';
import { saveSettings } from '../lib/settings';
import { onBack } from '../lib/telegram';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 mt-2 ml-1 text-[13px] font-extrabold tracking-[0.04em] text-hint uppercase">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Экран 20: настройки. Вложенный экран без нижнего меню, назад - системная BackButton.
 * Всё сохраняется на сервере и применяется сразу, без перезагрузки.
 */
export function SettingsScreen({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  useEffect(() => onBack(gameActions.closeSettings), []);

  const langOptions: { value: LangSetting; label: string }[] = [
    { value: 'auto', label: t('s20.auto') },
    // Названия языков - на самих языках (одинаковые в обоих словарях), чтобы их узнал тот, кто не читает текущий.
    { value: 'ru', label: t('s20.native.ru') },
    { value: 'en', label: t('s20.native.en') },
  ];
  const langHint = me.language === 'auto' ? t('s20.langAuto', { name: t(`s20.langNames.${me.autoLang}`) }) : t('s20.langFixed');

  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen qd-screen-in flex flex-col gap-2.5">
        <h1 className="m-0 mt-1 mb-1.5 ml-1 text-[28px] font-black">{t('s20.title')}</h1>

        <Group title={t('s20.lang')}>
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-section p-3">
            <Segmented label={t('s20.lang')} options={langOptions} value={me.language} onPick={(language) => void saveSettings(queryClient, { language })} />
            <p className="m-0 mx-1 text-[13px] leading-[1.4] font-semibold text-hint">{langHint}</p>
          </div>
        </Group>
      </main>
    </div>
  );
}
