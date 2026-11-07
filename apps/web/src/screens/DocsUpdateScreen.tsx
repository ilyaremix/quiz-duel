import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocsInfo } from '@quiz-duel/shared';
import { Ball, BALLS } from '../components/Ball';
import { Button } from '../components/Button';
import { ConsentChecks } from '../components/ConsentChecks';
import { Icon, type IconGlyph } from '../components/Icon';
import { Notice } from '../components/Notice';
import { gameActions, useGame } from '../lib/game';

/** Что нового в документах - у каждого пункта свой шар. */
const NEWS: { glyph: IconGlyph; ball: keyof typeof BALLS }[] = [
  { glyph: 'coin', ball: 'gold' },
  { glyph: 'users', ball: 'ok' },
  { glyph: 'ad', ball: 'bad' },
  { glyph: 'chart', ball: 'me' },
];

/**
 * Вышла новая версия Правил и Политики, а онбординг игрок уже проходил: вместо трёх слайдов -
 * один экран «Мы обновили документы» с тем, что изменилось, и двумя галочками.
 */
export function DocsUpdateScreen({ docs, docsFailed, onRetryDocs }: { docs: DocsInfo | undefined; docsFailed?: boolean; onRetryDocs?: () => void }) {
  const { t } = useTranslation();
  const [terms, setTerms] = useState(false);
  const [policy, setPolicy] = useState(false);
  const sending = useGame((s) => Boolean(s.pending.consent));
  const both = terms && policy;
  const news = t('docsUpdate.news', { returnObjects: true }) as string[];

  return (
    <main className="qd-screen flex flex-col gap-4 pt-6!">
      <div className="qd-in flex grow flex-col items-center justify-center gap-5">
        <Notice glyph="doc" tone="brand" title={t('docsUpdate.title')} text={t('docsUpdate.text')} />
        <ul className="qd-in qd-d2 m-0 flex w-full max-w-[360px] list-none flex-col gap-2 p-0">
          {NEWS.map((n, i) => (
            <li key={n.glyph} className="qd-card flex items-center gap-3 rounded-[20px] py-2 pr-3 pl-2">
              <Ball size={34} {...BALLS[n.ball]}>
                <Icon glyph={n.glyph} size={17} stroke={2.4} />
              </Ball>
              <span className="text-[14px] leading-[1.35] font-semibold">{news[i]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="qd-in qd-d3 flex flex-col gap-2">
        <ConsentChecks docs={docs} terms={terms} policy={policy} onTerms={() => setTerms((v) => !v)} onPolicy={() => setPolicy((v) => !v)} />
        {!docs && docsFailed ? (
          <div className="flex items-center justify-center gap-2">
            <span className="text-[13px] font-medium text-hint">{t('s02.docsFailed')}</span>
            <Button variant="ghost" size="s" full={false} onClick={onRetryDocs}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          !both && <span className="text-center text-[13px] font-medium text-hint">{t('consent.hint')}</span>
        )}
      </div>
      <Button icon={<Icon glyph="check" size={22} stroke={2.6} />} disabled={!both || sending || !docs} onClick={() => void gameActions.acceptDocs()}>
        {t('docsUpdate.accept')}
      </Button>
    </main>
  );
}
