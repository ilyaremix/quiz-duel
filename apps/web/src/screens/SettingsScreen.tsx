import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LangSetting, MeResponse, MotionSetting } from '@quiz-duel/shared';
import { Button } from '../components/Button';
import { Icon, type IconGlyph } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { Switch } from '../components/Switch';
import { gameActions } from '../lib/game';
import { useAutoReduced } from '../lib/motion';
import { saveSettings } from '../lib/settings';
import { askWriteAccess, haptic, onBack, setHapticsEnabled } from '../lib/telegram';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 mt-2 ml-1 text-[13px] font-extrabold tracking-[0.04em] text-hint uppercase">{title}</h2>
      {children}
    </section>
  );
}

function ToggleRow({ title, hint, on, onToggle }: { title: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex min-h-[66px] items-center gap-3">
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-[16px] font-extrabold">{title}</span>
        <span className="text-[13px] leading-[1.35] font-semibold text-hint">{hint}</span>
      </div>
      <Switch on={on} label={title} onToggle={onToggle} />
    </div>
  );
}

const RULES: { glyph: IconGlyph; bg: string; fg: string }[] = [
  { glyph: 'duel', bg: 'var(--qd-brand-tint)', fg: 'var(--qd-brand-text)' },
  { glyph: 'clock', bg: 'var(--qd-surface-2)', fg: 'var(--tg-theme-text-color)' },
  { glyph: 'bolt', bg: 'var(--qd-gold-tint)', fg: 'var(--qd-gold)' },
  { glyph: 'rating', bg: 'var(--qd-correct-tint)', fg: 'var(--qd-correct-text)' },
];

/** Шторка «Как играть»: 4 правила и «Понятно». */
function HowToSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} label={t('s20.howTo')} onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[22px] font-black">{t('s20.howTo')}</h2>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={onClose}
          className="qd-press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-surface-2 p-0 text-hint"
        >
          <Icon glyph="close" size={18} stroke={2.5} />
        </button>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {RULES.map((r, i) => (
          <li key={r.glyph} className="flex items-start gap-3.5 rounded-[20px] bg-section p-3">
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: r.bg, color: r.fg }}>
              <Icon glyph={r.glyph} size={22} stroke={2.2} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[16px] font-extrabold">{t(`s20.rules.${i}.t`)}</span>
              <span className="text-[13px] leading-[1.4] font-semibold text-hint">{t(`s20.rules.${i}.d`)}</span>
            </div>
          </li>
        ))}
      </ol>
      <Button onClick={onClose}>{t('s20.ok')}</Button>
    </Sheet>
  );
}

/**
 * Экран 20: настройки. Вложенный экран без нижнего меню, назад - системная BackButton.
 * Всё сохраняется на сервере (действует на всех устройствах) и применяется сразу, без перезагрузки.
 */
export function SettingsScreen({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [howTo, setHowTo] = useState(false);

  // «Назад»: сначала закрывает шторку «Как играть», потом - на главную.
  useEffect(() => onBack(howTo ? () => setHowTo(false) : gameActions.closeSettings), [howTo]);

  const langOptions: { value: LangSetting; label: string }[] = [
    { value: 'auto', label: t('s20.auto') },
    // Названия языков - на самих языках (одинаковые в обоих словарях), чтобы их узнал тот, кто не читает текущий.
    { value: 'ru', label: t('s20.native.ru') },
    { value: 'en', label: t('s20.native.en') },
  ];
  const langHint = me.language === 'auto' ? t('s20.langAuto', { name: t(`s20.langNames.${me.autoLang}`) }) : t('s20.langFixed');

  const autoReduced = useAutoReduced();
  const motionOptions: { value: MotionSetting; label: string }[] = [
    { value: 'auto', label: t('s20.auto') },
    { value: 'on', label: t('s20.on') },
    { value: 'off', label: t('s20.off') },
  ];
  // Подсказка объясняет, что выбрано сейчас: для «Авто» - включился ли режим на этом устройстве.
  const motionHint =
    me.reducedMotion === 'auto'
      ? t('s20.motionAuto', { state: t(autoReduced ? 's20.states.on' : 's20.states.off') })
      : t(me.reducedMotion === 'on' ? 's20.motionOn' : 's20.motionOff');

  const toggleHaptics = () => {
    const next = !me.haptics;
    // Сразу, не дожидаясь сервера: включили - короткий отклик, чтобы было понятно, что заработало.
    setHapticsEnabled(next);
    if (next) haptic.select();
    void saveSettings(queryClient, { haptics: next });
  };

  // Уведомления: бот может писать, только если игрок это разрешил (requestWriteAccess).
  // Включая их без разрешения, сразу спрашиваем; отказ - уведомления всё равно включены
  // (разрешение можно дать позже через /start у бота), подсказка скажет об этом.
  const notifOn = me.notifications;
  const notifHint = notifOn && !me.writeAccess ? t('s20.notifNoAccess') : t('s20.notifHint');
  const toggleNotif = () => {
    void saveSettings(queryClient, { notifications: !notifOn });
    if (!notifOn && !me.writeAccess) {
      void askWriteAccess().then((allowed) => (allowed ? saveSettings(queryClient, { writeAccess: true }) : undefined));
    }
  };

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

        <Group title={t('s20.motion')}>
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-section p-3">
            <Segmented
              label={t('s20.motion')}
              options={motionOptions}
              value={me.reducedMotion}
              onPick={(reducedMotion) => void saveSettings(queryClient, { reducedMotion })}
            />
            <p className="m-0 mx-1 text-[13px] leading-[1.4] font-semibold text-hint">{motionHint}</p>
          </div>
        </Group>

        <Group title={t('s20.feedback')}>
          <div className="flex flex-col rounded-[20px] bg-section py-1 pr-1.5 pl-4">
            <ToggleRow title={t('s20.haptics')} hint={t('s20.hapticsHint')} on={me.haptics} onToggle={toggleHaptics} />
            <div aria-hidden="true" className="h-px bg-surface-2" />
            <ToggleRow title={t('s20.notif')} hint={notifHint} on={notifOn} onToggle={toggleNotif} />
          </div>
        </Group>

        <button
          type="button"
          onClick={() => setHowTo(true)}
          className="qd-press mt-2.5 box-border flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-[20px] border-0 bg-section px-3 py-2 text-left font-[inherit] text-text"
        >
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-text">
            <Icon glyph="info" size={18} stroke={2.5} />
          </span>
          <span className="grow text-[16px] font-extrabold">{t('s20.howTo')}</span>
          <span aria-hidden="true" className="flex text-hint">
            <Icon glyph="chevron" size={18} stroke={2.5} />
          </span>
        </button>
      </main>
      <HowToSheet open={howTo} onClose={() => setHowTo(false)} />
    </div>
  );
}
