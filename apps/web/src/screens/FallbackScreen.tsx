import { useTranslation } from 'react-i18next';
import { Logo } from '../components/Logo';
import { Notice } from '../components/Notice';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';

export type FallbackKind = 'outside' | 'error' | 'session' | 'otherDevice';

const LOOK = {
  outside: { glyph: undefined, tone: 'brand', action: 'send' },
  error: { glyph: 'alert', tone: 'wrong', action: 'retry' },
  session: { glyph: 'clock', tone: 'gold', action: undefined },
  otherDevice: { glyph: 'chip', tone: 'brand', action: undefined },
} as const;

interface FallbackScreenProps {
  kind: FallbackKind;
  onAction: () => void;
  actionDisabled?: boolean;
}

/** Экран 24: «Откройте в Telegram» (логотип на дышащем ореоле), ошибка сервера, устаревший вход, игра на другом устройстве. */
export function FallbackScreen({ kind, onAction, actionDisabled }: FallbackScreenProps) {
  const { t } = useTranslation();
  const look = LOOK[kind];

  return (
    <main className="qd-screen flex flex-col">
      <div className="grow" />
      {kind === 'outside' && (
        <div className="qd-trophy relative mb-7 flex justify-center">
          <div
            aria-hidden="true"
            className="qd-halo absolute top-1/2 left-1/2 -mt-[150px] -ml-[150px] h-[300px] w-[300px] rounded-full"
            style={{ background: 'radial-gradient(closest-side, var(--qd-brand-glow), rgba(155, 92, 255, 0))' }}
          />
          <div className="relative">
            <Logo size="l" />
          </div>
        </div>
      )}
      <div className="qd-in">
        <Notice glyph={look.glyph} tone={look.tone} title={t(`s24.${kind}.title`)} text={t(`s24.${kind}.text`)} />
      </div>
      <div className="grow" />
      <div className="qd-in qd-d2">
        <Button
          onClick={onAction}
          disabled={actionDisabled}
          icon={look.action ? <Icon glyph={look.action} size={22} stroke={2.4} /> : undefined}
        >
          {t(`s24.${kind}.action`)}
        </Button>
      </div>
    </main>
  );
}
