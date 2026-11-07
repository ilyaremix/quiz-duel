import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameActions, useGame } from '../lib/game';
import { Button } from './Button';

const OUT_MS = 150;

/**
 * «Выйти из партии?» по системной кнопке «Назад». «Выйти» - сдача: сопернику сразу
 * техническая победа. Появление 300 мс от scale(0.95), исчезновение быстрее - 150 мс.
 */
export function ExitDialog() {
  const { t } = useTranslation();
  const open = useGame((s) => s.exitAsk);
  const busy = useGame((s) => Boolean(s.pending['game:forfeit']));
  // Тренировка: «Результат этой попытки не сохранится» вместо технического поражения.
  const k = useGame((s) => (s.game?.mode === 'solo' ? 's19.exit' : 's09.exit'));
  const [shown, setShown] = useState(open);
  const leaving = shown && !open;

  useEffect(() => {
    if (open) {
      setShown(true);
      return;
    }
    const timer = window.setTimeout(() => setShown(false), OUT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!shown) return null;
  return (
    <>
      <div
        className={`${leaving ? 'qd-backdrop-out' : 'qd-backdrop-in'} fixed inset-0 z-[60]`}
        style={{ background: 'var(--qd-scrim)' }}
        onClick={gameActions.closeExit}
      />
      <div className="pointer-events-none fixed inset-0 z-[61] box-border flex items-center justify-center px-8">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={t(`${k}.title`)}
          className={`${leaving ? 'qd-pop-out' : 'qd-pop'} pointer-events-auto box-border flex w-full max-w-[420px] flex-col gap-2 rounded-[28px] px-[18px] pt-[22px] pb-[18px] text-center text-text`}
          style={{ background: 'var(--qd-sheen), var(--qd-glass-solid)', boxShadow: 'var(--qd-glass-edge), 0 24px 60px rgba(3, 4, 20, 0.45)' }}
        >
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">{t(`${k}.title`)}</h2>
          <p className="m-0 mb-2.5 text-[15px] leading-[1.35] font-semibold text-hint">{t(`${k}.text`)}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" size="m" onClick={gameActions.closeExit}>
              {t(`${k}.stay`)}
            </Button>
            <Button variant="danger" size="m" disabled={busy || leaving} onClick={() => void gameActions.forfeit()}>
              {t(`${k}.leave`)}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
