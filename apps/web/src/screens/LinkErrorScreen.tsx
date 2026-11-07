import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { Icon, type IconGlyph } from '../components/Icon';
import { Notice, type NoticeTone } from '../components/Notice';
import { gameActions, type LinkErrorKind } from '../lib/game';

/** Оформление по виду ошибки, как на макете экрана 23: стеклянная сфера светится цветом тона. */
const LOOK: Record<LinkErrorKind, { glyph: IconGlyph; tone: NoticeTone }> = {
  taken: { glyph: 'duel', tone: 'gold' },
  notFound: { glyph: 'info', tone: 'muted' },
  expired: { glyph: 'clock', tone: 'muted' },
  cancelled: { glyph: 'close', tone: 'wrong' },
  finished: { glyph: 'rating', tone: 'brand' },
  busy: { glyph: 'alert', tone: 'gold' },
};

/** Экран 23: ссылка не работает - отдельный текст на каждый случай и «Создать свою». */
export function LinkErrorScreen({ kind, docsAccepted }: { kind: LinkErrorKind; docsAccepted: boolean }) {
  const { t } = useTranslation();
  const look = LOOK[kind];
  const busy = kind === 'busy';
  return (
    <main className="qd-screen flex flex-col">
      <div className="grow" />
      <div className="qd-in">
        <Notice glyph={look.glyph} tone={look.tone} title={t(`s23.${kind}.title`)} text={t(`s23.${kind}.text`)} />
      </div>
      <div className="grow" />
      <div className="qd-in qd-d2 flex flex-col gap-2.5">
        <Button
          icon={<Icon glyph={busy ? 'send' : 'duel'} size={22} stroke={2.4} />}
          onClick={() => (busy ? void gameActions.backToBusy() : gameActions.createOwn(docsAccepted))}
        >
          {t(busy ? 's23.back' : 's23.own')}
        </Button>
        <Button variant="ghost" size="m" onClick={gameActions.goHome}>
          {t('s23.home')}
        </Button>
      </div>
    </main>
  );
}
