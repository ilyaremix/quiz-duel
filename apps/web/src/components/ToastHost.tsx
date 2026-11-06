import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../lib/game';
import { Toast } from './Toast';

const SHOW_MS = 2_600;
const OUT_MS = 150;

/** Один тост сверху: 300 мс вход, 2,6 с на экране, 150 мс выход. Новый заменяет старый. */
export function ToastHost() {
  const { t } = useTranslation();
  const toast = useGame((s) => s.toast);
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(toast);

  useEffect(() => {
    if (!toast) return;
    setVisible(toast);
    setLeaving(false);
    const out = window.setTimeout(() => setLeaving(true), SHOW_MS);
    const end = window.setTimeout(() => setVisible(null), SHOW_MS + OUT_MS);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(end);
    };
  }, [toast]);

  if (!visible) return null;
  return (
    <div
      key={visible.id}
      className={`${leaving ? 'qd-toast-out' : 'qd-toast-in'} pointer-events-none fixed right-4 left-4 z-40`}
      style={{ top: 'calc(var(--tg-viewport-safe-area-inset-top, 0px) + var(--tg-viewport-content-safe-area-inset-top, 0px) + 14px)' }}
    >
      <div className="mx-auto max-w-[560px]">
        <Toast kind={visible.kind} text={t(visible.key, visible.vars)} />
      </div>
    </div>
  );
}
