import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocsInfo } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ConsentChecks } from '../components/ConsentChecks';
import { Logo } from '../components/Logo';
import { Sheet } from '../components/Sheet';
import { gameActions, useGame } from '../lib/game';

/**
 * Шторка с двумя галочками для пришедших по ссылке на игру (онбординг у них - после партии).
 * «{кто} зовёт на дуэль» и «Перейти в лобби»; закрыл без принятия - на онбординг.
 */
export function ConsentSheet({ docs }: { docs: DocsInfo | undefined }) {
  const { t } = useTranslation();
  const ask = useGame((s) => s.consent);
  const sending = useGame((s) => Boolean(s.pending.consent));
  const [terms, setTerms] = useState(false);
  const [policy, setPolicy] = useState(false);
  const both = terms && policy;
  const inviter = ask?.inviter ?? null;
  const title = inviter ? t('consent.title', { opp: inviter.name }) : t('consent.titleSelf');

  return (
    <Sheet open={Boolean(ask)} label={title} onClose={gameActions.declineConsent}>
      <div className="flex items-center gap-3.5">
        {inviter ? (
          <Avatar id={inviter.userId} name={inviter.name} photoUrl={inviter.photoUrl} size={52} ring="opp" on="page" />
        ) : (
          <Logo size="m" wordmark={false} />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-0.02em]">{title}</h2>
          <p className="m-0 text-[14px] leading-[1.4] font-medium text-hint">{t('consent.text')}</p>
        </div>
      </div>
      <ConsentChecks docs={docs} terms={terms} policy={policy} onTerms={() => setTerms((v) => !v)} onPolicy={() => setPolicy((v) => !v)} />
      {!both && <span className="-mt-1.5 text-center text-[13px] font-medium text-hint">{t('consent.hint')}</span>}
      <Button disabled={!both || sending || !docs} onClick={() => void gameActions.acceptConsent()}>
        {inviter ? t('consent.play') : t('consent.playSelf')}
      </Button>
    </Sheet>
  );
}
