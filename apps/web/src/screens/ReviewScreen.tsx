import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ReviewQuestion, ReviewSide } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon, type IconGlyph } from '../components/Icon';
import { Notice } from '../components/Notice';
import { formatNumber } from '../i18n';
import { api, queryKeys } from '../lib/api';
import { formatSec } from '../lib/format';
import { gameActions } from '../lib/game';
import { onBack } from '../lib/telegram';

interface Cell {
  glyph: IconGlyph;
  fg: string;
  pts: string;
  note: string;
  label: string;
}

/** Экран 14: разбор партии - 10 карточек: вопрос, верный ответ, ответ и время каждого, очки. */
export function ReviewScreen({ gameId }: { gameId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const review = useQuery({ queryKey: queryKeys.review(gameId), queryFn: () => api.review(gameId), staleTime: Infinity, retry: 1 });

  // Системная «Назад» Telegram возвращает туда, откуда открыли (итоги или профиль).
  useEffect(() => onBack(gameActions.closeReview), []);

  const cell = (side: ReviewSide, q: ReviewQuestion, who: string): Cell => {
    if (side.position === null) {
      return { glyph: 'clock', fg: 'var(--tg-theme-hint-color)', pts: '0', note: t('s14.late'), label: t('s14.aLate', { who }) };
    }
    const time = formatSec(side.timeMs ?? 0, t, lang);
    if (side.correct) {
      return {
        glyph: 'check',
        fg: 'var(--qd-correct-text)',
        pts: `+${formatNumber(side.points, lang)}`,
        note: t('s14.ok', { t: time }),
        label: t('s14.aOk', { who, t: time, n: side.points }),
      };
    }
    const a = q.options[side.position] ?? '';
    return { glyph: 'close', fg: 'var(--qd-wrong-text)', pts: '0', note: `${a} · ${time}`, label: t('s14.aBad', { who, a }) };
  };

  if (review.isPending) {
    return (
      <main className="qd-screen qd-fade-in flex flex-col gap-3.5" aria-busy="true" aria-label={t('s14.loading')}>
        <h1 className="m-0 text-[28px] font-black">{t('s14.title')}</h1>
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden="true" className="qd-skel h-[148px] rounded-[20px] bg-section" />
        ))}
      </main>
    );
  }
  if (review.isError) {
    return (
      <main className="qd-screen qd-fade-in flex flex-col">
        <div className="grow" />
        <Notice glyph="alert" title={t('s14.error')} text={t('toast.loadFailed')} />
        <div className="grow" />
        <div className="flex flex-col gap-2">
          <Button onClick={() => void review.refetch()}>{t('common.retry')}</Button>
          <Button variant="ghost" size="s" onClick={gameActions.closeReview}>
            {t('common.back')}
          </Button>
        </div>
      </main>
    );
  }

  const r = review.data;
  const qs = r.questions;
  const result = t(`result.${r.outcome}`);
  const you = t('common.you');

  return (
    <main className="qd-screen qd-screen-in flex flex-col gap-3.5">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-black">{t('s14.title')}</h1>
        <p className="qd-num m-0 text-[14px] font-bold text-hint">
          {t('s14.sub', {
            cat: t(`cat.${r.category}.title`),
            result,
            score: `${formatNumber(r.myScore, lang)} : ${formatNumber(r.oppScore, lang)}`,
          })}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2.5">
        {[
          { p: r.me, label: you, ring: 'me' as const, n: qs.filter((q) => q.me.correct).length, fg: 'var(--qd-me-text)' },
          { p: r.opponent, label: r.opponent.name, ring: 'opp' as const, n: qs.filter((q) => q.opp.correct).length, fg: 'var(--qd-opp-text)' },
        ].map((x) => (
          <div key={x.ring} className="box-border flex h-12 items-center gap-2.5 rounded-2xl bg-section pr-3 pl-2">
            <Avatar id={x.p.id} name={x.p.name} photoUrl={x.p.photoUrl} size={32} ring={x.ring} on="none" />
            <span className="min-w-0 truncate text-[15px] font-extrabold">{x.label}</span>
            <span className="qd-num ml-auto text-[15px] font-extrabold" style={{ color: x.fg }}>
              {x.n}/{qs.length}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 pb-2">
        {qs.map((q, i) => (
          <article key={q.index} className="flex shrink-0 flex-col gap-2.5 rounded-[20px] bg-section p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="qd-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-black text-hint">{i + 1}</span>
              <span className="pt-1 text-[15px] leading-[1.3] font-extrabold">{q.text}</span>
            </div>
            <div className="box-border flex min-h-[30px] items-center gap-1.5 self-start rounded-[15px] py-1 pr-3 pl-2 text-[14px] font-extrabold" style={{ background: 'var(--qd-correct-tint)', color: 'var(--qd-correct-text)' }}>
              <Icon glyph="check" size={16} stroke={3} />
              {q.options[q.correctPosition]}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { c: cell(q.me, q, you), p: r.me, ring: 'me' as const },
                { c: cell(q.opp, q, r.opponent.name), p: r.opponent, ring: 'opp' as const },
              ].map(({ c, p, ring }) => (
                <div key={ring} role="group" aria-label={c.label} className="flex flex-col gap-1 rounded-[14px] bg-surface-2 px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <Avatar id={p.id} name={p.name} photoUrl={p.photoUrl} size={22} ring={ring} on="none" />
                    <span className="flex" style={{ color: c.fg }}>
                      <Icon glyph={c.glyph} size={14} stroke={3} />
                    </span>
                    <span className="qd-num ml-auto text-[15px] font-black" style={{ color: c.fg }}>
                      {c.pts}
                    </span>
                  </div>
                  <span className="truncate text-[12px] font-bold text-hint">{c.note}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <Button variant="secondary" size="m" onClick={gameActions.closeReview}>
        {t('common.back')}
      </Button>
    </main>
  );
}
