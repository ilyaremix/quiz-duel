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
  otherDevice: { glyph: 'offline', tone: 'gold', action: 'retry' },
} as const;

interface FallbackScreenProps {
  kind: FallbackKind;
  onAction: () => void;
  actionDisabled?: boolean;
}

/** Экран 24: «Откройте в Telegram», ошибка сервера, устаревший вход, игра открыта на другом устройстве. */
export function FallbackScreen({ kind, onAction, actionDisabled }: FallbackScreenProps) {
  const { t } = useTranslation();
  const look = LOOK[kind];

  return (
    <main className="qd-screen qd-screen-in flex flex-col">
      <div className="grow" />
      {kind === 'outside' && (
        <div className="mb-7 flex justify-center">
          <Logo size="l" />
        </div>
      )}
      <Notice glyph={look.glyph} tone={look.tone} title={t(`s24.${kind}.title`)} text={t(`s24.${kind}.text`)} />
      <div className="grow" />
      <Button
        onClick={onAction}
        disabled={actionDisabled}
        icon={look.action ? <Icon glyph={look.action} size={22} stroke={2.5} /> : undefined}
      >
        {t(`s24.${kind}.action`)}
      </Button>
    </main>
  );
}
