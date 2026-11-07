import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ThemeSetting, LangSetting, MeResponse, MotionSetting } from '@quiz-duel/shared';
import { Ball, BALLS } from '../components/Ball';
import { Button } from '../components/Button';
import { Icon, type IconGlyph } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { shop, useWallet } from '../lib/economy';
import { setThemeSetting, telegramIsDark } from '../lib/telegram';
import { Sheet } from '../components/Sheet';
import { Switch } from '../components/Switch';
import { gameActions } from '../lib/game';
import { useAutoReduced } from '../lib/motion';
import { saveSettings } from '../lib/settings';
import { askWriteAccess, haptic, onBack, setHapticsEnabled } from '../lib/telegram';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 mt-2 ml-1 text-[12px] font-semibold tracking-[0.08em] text-hint uppercase">{title}</h2>
      {children}
    </section>
  );
}

function ToggleRow({ title, hint, on, onToggle }: { title: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex min-h-[66px] items-center gap-3">
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-[16px] font-semibold">{title}</span>
        <span className="text-[13px] leading-[1.35] font-medium text-hint">{hint}</span>
      </div>
      <Switch on={on} label={title} onToggle={onToggle} />
    </div>
  );
}

/** Правила «Как играть» - у каждого свой глянцевый шар. */
const RULES: { glyph: IconGlyph; ball: keyof typeof BALLS }[] = [
  { glyph: 'duel', ball: 'brand' },
  { glyph: 'clock', ball: 'me' },
  { glyph: 'bolt', ball: 'gold' },
  { glyph: 'rating', ball: 'ok' },
];

/** Шторка «Как играть»: 4 правила и «Понятно». */
function HowToSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} label={t('s20.howTo')} onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[22px] font-bold tracking-[-0.02em]">{t('s20.howTo')}</h2>
        <button type="button" aria-label={t('common.close')} onClick={onClose} className="qd-press qd-icon-btn" style={{ width: 44, height: 44 }}>
          <Icon glyph="close" size={18} stroke={2.5} />
        </button>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {RULES.map((r, i) => (
          <li key={r.glyph} className="qd-card flex items-start gap-3.5 rounded-[24px] p-3">
            <Ball size={44} {...BALLS[r.ball]}>
              <Icon glyph={r.glyph} size={22} stroke={2.2} />
            </Ball>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[16px] font-bold">{t(`s20.rules.${i}.t`)}</span>
              <span className="text-[13px] leading-[1.4] font-medium text-hint">{t(`s20.rules.${i}.d`)}</span>
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
  const [themeAuto, themeLight, themeDark] = t('s20.themeOpts').split('|');
  const themeOptions: { value: ThemeSetting; label: string }[] = [
    { value: 'auto', label: themeAuto ?? '' },
    { value: 'light', label: themeLight ?? '' },
    { value: 'dark', label: themeDark ?? '' },
  ];
  const wallet = useWallet().data;
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
      <main className="qd-screen flex flex-col gap-2.5">
        <h1 className="qd-in m-0 mt-1 mb-1.5 ml-1 text-[28px] font-bold tracking-[-0.02em]">{t('s20.title')}</h1>

        <div className="qd-in qd-d1">
          <Group title={t('s20.lang')}>
            <div className="qd-card flex flex-col gap-2.5 rounded-[26px] p-3">
              <Segmented label={t('s20.lang')} options={langOptions} value={me.language} onPick={(language) => void saveSettings(queryClient, { language })} />
              <p className="m-0 mx-1.5 text-[13px] leading-[1.4] font-medium text-hint">{langHint}</p>
            </div>
          </Group>
        </div>

        <div className="qd-in qd-d1">
          <Group title={t('s20.theme')}>
            <div className="qd-card flex flex-col gap-2.5 rounded-[26px] p-3">
              <Segmented
                label={t('s20.theme')}
                options={themeOptions}
                value={me.theme ?? 'auto'}
                onPick={(theme) => {
                  setThemeSetting(theme);
                  void saveSettings(queryClient, { theme });
                }}
              />
              <p className="m-0 mx-1.5 text-[13px] leading-[1.4] font-medium text-hint">
                {(me.theme ?? 'auto') === 'auto' ? t('s20.themeAuto', { name: t(`s20.themeNames.${telegramIsDark() ? 'dark' : 'light'}`) }) : t('s20.themeFixed')}
              </p>
            </div>
          </Group>
        </div>

        <div className="qd-in qd-d2">
          <Group title={t('s20.motion')}>
            <div className="qd-card flex flex-col gap-2.5 rounded-[26px] p-3">
              <Segmented
                label={t('s20.motion')}
                options={motionOptions}
                value={me.reducedMotion}
                onPick={(reducedMotion) => void saveSettings(queryClient, { reducedMotion })}
              />
              <p className="m-0 mx-1.5 text-[13px] leading-[1.4] font-medium text-hint">{motionHint}</p>
            </div>
          </Group>
        </div>

        <div className="qd-in qd-d3">
          <Group title={t('s20.feedback')}>
            <div className="qd-card flex flex-col rounded-[26px] py-1 pr-2 pl-4">
              <ToggleRow title={t('s20.haptics')} hint={t('s20.hapticsHint')} on={me.haptics} onToggle={toggleHaptics} />
              <div aria-hidden="true" className="h-px bg-separator" />
              <ToggleRow title={t('s20.notif')} hint={notifHint} on={notifOn} onToggle={toggleNotif} />
            </div>
          </Group>
        </div>

        {wallet && (
          <div className="qd-in qd-d3">
            <Group title={t('s20.ads')}>
              <div className="qd-card flex items-center gap-3 rounded-[26px] py-2.5 pr-2.5 pl-4">
                <span className="min-w-0 grow text-[14px] leading-[1.35] font-medium" style={{ color: wallet.adFree ? 'var(--qd-correct-text)' : 'var(--tg-theme-hint-color)' }}>
                  {wallet.adFree ? t('s20.adsOff') : t('s20.adsOn')}
                </span>
                {!wallet.adFree && (
                  <Button variant="secondary" size="s" full={false} icon={<Icon glyph="star" size={17} stroke={2.4} />} onClick={() => shop.openItem({ kind: 'adFree', id: 'adfree' })}>
                    {t('s20.adsBuy')}
                  </Button>
                )}
              </div>
            </Group>
          </div>
        )}

        <button
          type="button"
          onClick={() => setHowTo(true)}
          className="qd-press qd-card qd-in qd-d4 mt-2.5 box-border flex min-h-[62px] w-full cursor-pointer items-center gap-3 rounded-[26px] border-0 py-[9px] pr-3.5 pl-2.5 text-left text-text"
        >
          <Ball size={42} {...BALLS.brand}>
            <Icon glyph="info" size={20} stroke={2.4} />
          </Ball>
          <span className="grow text-[16px] font-semibold">{t('s20.howTo')}</span>
          <span aria-hidden="true" className="flex text-hint">
            <Icon glyph="chevron" size={18} stroke={2.5} />
          </span>
        </button>
      </main>
      <HowToSheet open={howTo} onClose={() => setHowTo(false)} />
    </div>
  );
}
