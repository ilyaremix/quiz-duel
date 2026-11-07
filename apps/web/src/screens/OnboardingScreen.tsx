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
import { useQueryClient } from '@tanstack/react-query';
import { gameActions, useGame } from '../lib/game';
import { saveSettings } from '../lib/settings';

type Slide = 1 | 2 | 3;

/** Слайд 1: сообщение в чате и карточка «Вызов на дуэль» - стекло, собирается каскадом. */
function ChallengeArt() {
  const { t } = useTranslation();
  return (
    <div className="qd-in relative flex w-[296px] flex-col gap-3">
      <div className="qd-in qd-d2 qd-card box-border max-w-[236px] self-start rounded-[20px_20px_20px_6px] px-[15px] py-[11px] text-[15px] leading-[1.35] font-medium">
        {t('s02.chat')}
      </div>
      <div className="qd-in qd-d4 qd-card qd-glint box-border flex w-[244px] flex-col gap-3 self-end rounded-[24px_24px_6px_24px] p-3.5">
        <div className="relative flex items-center gap-2.5">
          <Logo size="m" wordmark={false} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{t('s02.card')}</span>
            <span className="text-[12px] font-medium text-hint">{t('cat.science.title')}</span>
          </div>
        </div>
        <div className="relative">
          <Button size="s" tabIndex={-1}>
            {t('s02.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Слайд 2: таймер и верный быстрый ответ. */
function SpeedArt({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  return (
    <div className="qd-in relative flex w-[306px] flex-col gap-3.5">
      <Timer seconds={12} />
      <div className="qd-in qd-d2">
        <Answer text={t('s02.right')} state="correct" points="+950" me={{ id: me.id, name: me.firstName, photoUrl: me.photoUrl }} />
      </div>
      <div className="qd-in qd-d3">
        <Answer text={t('s02.other')} state="dimmed" />
      </div>
      <span className="qd-in qd-d5 qd-chip qd-chip-gold self-center" style={{ height: 34, padding: '0 14px', borderRadius: 17, fontSize: 14 }}>
        <Icon glyph="bolt" size={16} stroke={2.5} />
        {t('s02.fast')}
      </span>
    </div>
  );
}

/** Слайд 3: пьедестал (золотой столбик со свечением) и рост рейтинга. */
function RatingArt({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const [second, third] = t('s02.podium', { returnObjects: true }) as string[];
  const column = 'qd-card box-border flex w-full justify-center rounded-[20px_20px_10px_10px] pt-3 text-[22px] font-bold';
  return (
    <div className="qd-in relative flex w-[306px] flex-col items-center gap-[18px]">
      <span className="qd-chip qd-chip-ok qd-num" style={{ height: 34, padding: '0 14px', borderRadius: 17, fontSize: 15 }}>
        {t('s02.rating', { r: formatNumber(me.rating + 16, i18n.language) })}
      </span>
      <div className="grid w-full grid-cols-3 items-end gap-2.5">
        <div className="qd-in qd-d2 flex flex-col items-center gap-2.5">
          <Avatar id={2} name={second ?? ''} size={48} />
          <div className={`${column} h-[92px]`} style={{ color: 'var(--qd-silver)' }}>
            2
          </div>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={56} ring="me" badge="online" />
          <div
            className="qd-glint box-border flex h-[132px] w-full justify-center rounded-[20px_20px_10px_10px] pt-3 text-[26px] font-bold"
            style={{
              background: 'radial-gradient(90% 50% at 30% 0%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 70%), linear-gradient(180deg, #FFE08A, #F2B230)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 0 34px var(--qd-gold-glow)',
              color: '#3A2600',
            }}
          >
            1
          </div>
        </div>
        <div className="qd-in qd-d3 flex flex-col items-center gap-2.5">
          <Avatar id={3} name={third ?? ''} size={48} />
          <div className={`${column} h-[70px]`} style={{ color: 'var(--qd-bronze)' }}>
            3
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Экран 2: онбординг при первом входе. 3 слайда; «Пропустить» ведёт на 3-й,
 * где две галочки с документами - «Начать играть» неактивна, пока не отмечены обе.
 * Пришедший по ссылке уже принял документы в шторке перед лобби и видит онбординг
 * после партии - галочки у него уже отмечены.
 */
export function OnboardingScreen({
  me,
  docs,
  docsFailed,
  onRetryDocs,
}: {
  me: MeResponse;
  docs: DocsInfo | undefined;
  /** Не удалось загрузить ссылки на документы - без них принять нельзя, нужен повтор. */
  docsFailed?: boolean;
  onRetryDocs?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [slide, setSlide] = useState<Slide>(1);
  const [terms, setTerms] = useState(me.docsAccepted);
  const [policy, setPolicy] = useState(me.docsAccepted);
  const [finishing, setFinishing] = useState(false);
  const sending = useGame((s) => Boolean(s.pending.consent)) || finishing;
  const both = terms && policy;
  const slides = t('s02.slides', { returnObjects: true }) as { title: string; text: string }[];
  const copy = slides[slide - 1] ?? { title: '', text: '' };

  const finish = async () => {
    setFinishing(true);
    try {
      if (!me.docsAccepted && !(await gameActions.acceptDocs())) return;
      // Онбординг пройден: больше не показываем (на сервере - для всех устройств).
      await saveSettings(queryClient, { onboarded: true });
    } finally {
      setFinishing(false);
    }
  };

  const next = () => {
    if (slide < 3) setSlide((slide + 1) as Slide);
    else if (both) void finish();
  };
  const needDocs = !me.docsAccepted && !docs;

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
        <div
          aria-hidden="true"
          className="qd-halo absolute h-[330px] w-[330px] rounded-full"
          style={{ background: 'radial-gradient(closest-side, var(--qd-brand-glow), rgba(155, 92, 255, 0))' }}
        />
        {slide === 1 && <ChallengeArt key="s1" />}
        {slide === 2 && <SpeedArt key="s2" me={me} />}
        {slide === 3 && <RatingArt key="s3" me={me} />}
      </div>

      <div key={slide} className="qd-in qd-d2 flex flex-col items-center gap-2.5 px-3 text-center">
        <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.02em]">{copy.title}</h1>
        <p className="m-0 min-h-11 text-[16px] leading-[1.4] font-medium text-hint">{copy.text}</p>
      </div>

      {slide === 3 && (
        <div className="qd-in qd-d3 mt-[18px] flex flex-col gap-2">
          <ConsentChecks docs={docs} terms={terms} policy={policy} onTerms={() => setTerms((v) => !v)} onPolicy={() => setPolicy((v) => !v)} />
          {needDocs && docsFailed ? (
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
      )}

      <div aria-hidden="true" className="flex justify-center gap-1.5" style={{ margin: slide === 3 ? '16px 0' : '24px 0' }}>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="qd-dot h-2 rounded"
            style={{
              width: i === slide ? 24 : 8,
              background: i === slide ? 'linear-gradient(90deg, #4F8DFF, #9B5CFF)' : 'var(--qd-dash)',
              boxShadow: i === slide ? '0 0 12px rgba(155, 92, 255, 0.7)' : 'none',
            }}
          />
        ))}
      </div>

      <Button disabled={slide === 3 && (!both || sending || needDocs)} onClick={next}>
        {slide === 3 ? t('s02.start') : t('common.next')}
      </Button>
    </main>
  );
}
