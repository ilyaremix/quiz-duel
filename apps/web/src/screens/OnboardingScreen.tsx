import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocsInfo, MeResponse } from '@quiz-duel/shared';
import { Answer } from '../components/Answer';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ConsentChecks } from '../components/ConsentChecks';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { Timer } from '../components/Timer';
import { formatNumber } from '../i18n';
import { gameActions, useGame } from '../lib/game';

type Slide = 1 | 2 | 3;

/** Слайд 1: сообщение в чате и карточка «Вызов на дуэль». */
function ChallengeArt() {
  const { t } = useTranslation();
  return (
    <div className="qd-pop relative flex w-[290px] flex-col gap-2.5">
      <div className="qd-rise max-w-[230px] self-start rounded-[18px_18px_18px_6px] bg-section px-3.5 py-2.5 text-[15px] font-semibold">{t('s02.chat')}</div>
      <div className="qd-rise-2 box-border flex w-[236px] flex-col gap-3 self-end rounded-[20px_20px_6px_20px] bg-section p-3.5 shadow-[0_4px_0_var(--qd-lip)]">
        <div className="flex items-center gap-2.5">
          <Logo size="m" wordmark={false} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-extrabold">{t('s02.card')}</span>
            <span className="text-[12px] font-bold text-hint">{t('cat.science.title')}</span>
          </div>
        </div>
        <Button size="s" tabIndex={-1}>
          {t('s02.accept')}
        </Button>
      </div>
    </div>
  );
}

/** Слайд 2: таймер и верный быстрый ответ. */
function SpeedArt({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  return (
    <div className="qd-pop relative flex w-[300px] flex-col gap-3.5">
      <Timer seconds={12} />
      <div className="qd-rise">
        <Answer text={t('s02.right')} state="correct" points="+950" me={{ id: me.id, name: me.firstName, photoUrl: me.photoUrl }} disabled={false} />
      </div>
      <div className="qd-rise-2">
        <Answer text={t('s02.other')} state="dimmed" />
      </div>
      <div className="flex h-8 items-center gap-1.5 self-center rounded-2xl px-3.5 text-[14px] font-extrabold" style={{ background: 'var(--qd-gold-tint)', color: 'var(--qd-gold-text)' }}>
        <Icon glyph="bolt" size={16} stroke={2.5} />
        {t('s02.fast')}
      </div>
    </div>
  );
}

/** Слайд 3: пьедестал и рост рейтинга. */
function RatingArt({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const [second, third] = t('s02.podium', { returnObjects: true }) as string[];
  const column = 'flex w-full box-border justify-center rounded-[18px_18px_8px_8px] pt-3 font-black';
  return (
    <div className="qd-pop relative flex w-[300px] flex-col items-center gap-[18px]">
      <div className="qd-num flex h-[34px] items-center gap-1.5 rounded-[17px] px-3.5 text-[15px] font-extrabold" style={{ background: 'var(--qd-correct-tint)', color: 'var(--qd-correct-text)' }}>
        {t('s02.rating', { r: formatNumber(me.rating + 16, i18n.language) })}
      </div>
      <div className="grid w-full grid-cols-3 items-end gap-2.5">
        <div className="qd-rise flex flex-col items-center gap-2.5">
          <Avatar id={2} name={second ?? ''} size={48} />
          <div className={`${column} h-[92px] bg-section text-[22px] text-hint`}>2</div>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={56} ring="me" badge="online" />
          <div className={`${column} h-[132px] text-[26px]`} style={{ background: 'var(--qd-gold)', color: 'var(--qd-on-fill)' }}>
            1
          </div>
        </div>
        <div className="qd-rise-2 flex flex-col items-center gap-2.5">
          <Avatar id={3} name={third ?? ''} size={48} />
          <div className={`${column} h-[70px] bg-section text-[22px] text-hint`}>3</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Экран 2: онбординг при первом входе. 3 слайда; «Пропустить» ведёт на 3-й,
 * где две галочки с документами - «Начать играть» неактивна, пока не отмечены обе.
 */
export function OnboardingScreen({ me, docs }: { me: MeResponse; docs: DocsInfo | undefined }) {
  const { t } = useTranslation();
  const [slide, setSlide] = useState<Slide>(1);
  const [terms, setTerms] = useState(false);
  const [policy, setPolicy] = useState(false);
  const sending = useGame((s) => Boolean(s.pending.consent));
  const both = terms && policy;
  const slides = t('s02.slides', { returnObjects: true }) as { title: string; text: string }[];
  const copy = slides[slide - 1] ?? { title: '', text: '' };

  const next = () => {
    if (slide < 3) setSlide((slide + 1) as Slide);
    else if (both) void gameActions.acceptDocs();
  };

  return (
    <main className="qd-screen flex flex-col pt-2!">
      <div className="flex h-11 justify-end">
        {slide !== 3 && (
          <Button variant="ghost" size="s" full={false} onClick={() => setSlide(3)}>
            {t('common.skip')}
          </Button>
        )}
      </div>

      <div className="relative flex grow items-center justify-center">
        <div aria-hidden="true" className="absolute h-[300px] w-[300px] rounded-full bg-brand-tint opacity-40" />
        {slide === 1 && <ChallengeArt key="s1" />}
        {slide === 2 && <SpeedArt key="s2" me={me} />}
        {slide === 3 && <RatingArt key="s3" me={me} />}
      </div>

      <div key={slide} className="qd-rise flex flex-col items-center gap-2.5 px-3 text-center">
        <h1 className="m-0 text-[28px] leading-[1.15] font-black">{copy.title}</h1>
        <p className="m-0 min-h-11 text-[16px] leading-[1.4] font-semibold text-hint">{copy.text}</p>
      </div>

      {slide === 3 && (
        <div className="qd-rise-2 mt-[18px] flex flex-col gap-2">
          <ConsentChecks docs={docs} terms={terms} policy={policy} onTerms={() => setTerms((v) => !v)} onPolicy={() => setPolicy((v) => !v)} />
          {!both && <span className="text-center text-[13px] font-semibold text-hint">{t('consent.hint')}</span>}
        </div>
      )}

      <div aria-hidden="true" className="flex justify-center gap-1.5" style={{ margin: slide === 3 ? '16px 0' : '24px 0' }}>
        {[1, 2, 3].map((i) => (
          <span key={i} className="qd-dot h-2 rounded" style={{ width: i === slide ? 24 : 8, background: i === slide ? 'var(--qd-brand)' : 'var(--qd-surface-2)' }} />
        ))}
      </div>

      <Button disabled={slide === 3 && (!both || sending || !docs)} onClick={next}>
        {slide === 3 ? t('s02.start') : t('common.next')}
      </Button>
    </main>
  );
}
