import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocsInfo } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { Logo } from '../components/Logo';
import { Sheet } from '../components/Sheet';
import { gameActions, useGame } from '../lib/game';

function DocLine({ checked, before, link, onToggle, onOpen }: { checked: boolean; before: string; link: string; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className="flex min-h-12 items-center gap-1">
      <Checkbox on={checked} label={before + link} onToggle={onToggle} />
      <p className="m-0 py-1.5 text-[14px] leading-[1.35] font-semibold">
        {before}
        <button
          type="button"
          onClick={onOpen}
          className="inline cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] whitespace-nowrap text-link underline underline-offset-2"
        >
          {link}
        </button>
      </p>
    </div>
  );
}

/**
 * Шторка с двумя галочками: Пользовательское соглашение и Политика конфиденциальности.
 * По ссылке - «{кто} зовёт на дуэль» и «Перейти в лобби»; без принятия играть нельзя.
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
          <h2 className="m-0 text-[22px] leading-[1.2] font-black">{title}</h2>
          <p className="m-0 text-[14px] leading-[1.4] font-semibold text-hint">{t('consent.text')}</p>
        </div>
      </div>
      <div role="group" aria-label={t('consent.hint')} className="flex flex-col rounded-[20px] bg-section py-1.5 pr-3.5 pl-1">
        <DocLine
          checked={terms}
          before={t('consent.terms.before')}
          link={t('consent.terms.link')}
          onToggle={() => setTerms((v) => !v)}
          onOpen={() => docs && gameActions.openDoc(docs.termsUrl)}
        />
        <div aria-hidden="true" className="ml-12 h-px bg-separator" />
        <DocLine
          checked={policy}
          before={t('consent.policy.before')}
          link={t('consent.policy.link')}
          onToggle={() => setPolicy((v) => !v)}
          onOpen={() => docs && gameActions.openDoc(docs.privacyUrl)}
        />
      </div>
      {!both && <span className="-mt-1.5 text-center text-[13px] font-semibold text-hint">{t('consent.hint')}</span>}
      <Button disabled={!both || sending || !docs} onClick={() => void gameActions.acceptConsent()}>
        {inviter ? t('consent.play') : t('consent.playSelf')}
      </Button>
    </Sheet>
  );
}
