import { useTranslation } from 'react-i18next';
import type { DocsInfo } from '@quiz-duel/shared';
import { Checkbox } from './Checkbox';
import { gameActions } from '../lib/game';

function DocLine({ checked, before, link, onToggle, onOpen }: { checked: boolean; before: string; link: string; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className="flex min-h-12 items-center gap-1">
      <Checkbox on={checked} label={before + link} onToggle={onToggle} />
      <p className="m-0 py-1.5 text-[14px] leading-[1.35] font-semibold">
        {before}
        <button type="button" onClick={onOpen} className="qd-link whitespace-nowrap">
          {link}
        </button>
      </p>
    </div>
  );
}

interface ConsentChecksProps {
  docs: DocsInfo | undefined;
  terms: boolean;
  policy: boolean;
  onTerms: () => void;
  onPolicy: () => void;
}

/** Две галочки со ссылками на документы - на 3-м слайде онбординга и в шторке перед входом по ссылке. */
export function ConsentChecks({ docs, terms, policy, onTerms, onPolicy }: ConsentChecksProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t('consent.hint')} className="qd-card flex flex-col rounded-[24px] py-1.5 pr-3.5 pl-1">
      <DocLine
        checked={terms}
        before={t('consent.terms.before')}
        link={t('consent.terms.link')}
        onToggle={onTerms}
        onOpen={() => docs && gameActions.openDoc(docs.termsUrl)}
      />
      <div aria-hidden="true" className="ml-12 h-px bg-separator" />
      <DocLine
        checked={policy}
        before={t('consent.policy.before')}
        link={t('consent.policy.link')}
        onToggle={onPolicy}
        onOpen={() => docs && gameActions.openDoc(docs.privacyUrl)}
      />
    </div>
  );
}
