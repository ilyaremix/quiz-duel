import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { COUNT_OPTIONS, TIME_OPTIONS, VARIANTS } from '@quiz-duel/shared';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { isDefaultRules, MODE_LOOK, ModeCard, useRulesText } from '../components/Modes';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { setupActions, useSetup } from '../lib/setup';

const H3 = 'mt-1 mb-0 ml-1 text-[12px] font-semibold tracking-[0.08em] text-hint uppercase';

/** Экран 32: режим и настройки дуэли - режим, время на ответ, число вопросов. В рейтинг идёт только «Классика». */
export function SetupSheet() {
  const { t } = useTranslation();
  const open = useSetup((s) => s.open);
  const rules = useSetup((s) => s.rules);
  const summary = useRulesText();
  const look = MODE_LOOK[rules.variant];
  const timeLabels = t('s32.timeOpts').split('|');

  return (
    <Sheet open={open} label={t('s32.aria')} onClose={setupActions.close}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[22px] font-bold tracking-[-0.02em]">{t('s32.title')}</h2>
        <button type="button" aria-label={t('common.close')} onClick={setupActions.close} className="qd-press qd-icon-btn h-11 w-11">
          <Icon glyph="close" size={18} stroke={2.5} />
        </button>
      </div>

      <h3 className={H3}>{t('s32.modes')}</h3>
      <div role="radiogroup" aria-label={t('s32.modes')} className="grid auto-rows-fr grid-cols-2 gap-2.5">
        {VARIANTS.map((v) => (
          <ModeCard key={v} variant={v} selected={rules.variant === v} onPick={() => setupActions.set({ variant: v })} />
        ))}
      </div>

      <h3 className={H3}>{t('s32.time')}</h3>
      <Segmented
        label={t('s32.time')}
        options={TIME_OPTIONS.map((n, i) => ({ value: String(n), label: timeLabels[i] ?? `${n}` }))}
        value={String(rules.timeSec)}
        onPick={(v) => setupActions.set({ timeSec: Number(v) })}
      />
      <h3 className={H3}>{t('s32.count')}</h3>
      <Segmented
        label={t('s32.count')}
        options={COUNT_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
        value={String(rules.count)}
        onPick={(v) => setupActions.set({ count: Number(v) })}
      />

      <div role="status" className="qd-glass flex items-center gap-2.5 rounded-[22px] px-3 py-2.5">
        <span aria-hidden="true" className="qd-ball h-8 w-8" style={{ '--qd-ball': look.ball, '--qd-ball-glow': look.glow, color: look.ink } as CSSProperties}>
          <Icon glyph={look.glyph} size={16} stroke={2.4} />
        </span>
        <span className="flex min-w-0 grow flex-col gap-px">
          <span className="text-[14px] font-bold">{summary(rules)}</span>
          <span className="text-[12px] font-medium text-hint">{rules.variant === 'classic' ? t('s32.rated') : t('s32.unrated')}</span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Button icon={<Icon glyph="check" size={22} stroke={2.6} />} onClick={setupActions.close}>
          {t('s32.done')}
        </Button>
        {!isDefaultRules(rules) && (
          <Button variant="ghost" size="s" onClick={setupActions.reset}>
            {t('s32.reset')}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
