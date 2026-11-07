import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, GameView } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { CATEGORY_LOOK } from '../components/Category';
import { Icon } from '../components/Icon';
import { useServerNow } from '../hooks/useServerNow';
import { gameActions, useGame } from '../lib/game';

/**
 * Экран 31: «Микс» - выбор темы. Каждому выпало 3 темы, на выбор 10 с (не успел - выберется сама),
 * потом показ обеих тем и сразу VS. Вопросы - поровну из темы каждого.
 */
export function DraftScreen({ game }: { game: GameView }) {
  const { t } = useTranslation();
  const now = useServerNow(250);
  const pending = useGame((s) => Boolean(s.pending['game:draft']));
  const draft = game.draft!;
  const opp = game.opponent;
  const sec = Math.max(0, Math.ceil(((game.phaseEndsAt ?? now) - now) / 1000));
  const urgent = sec <= 3 && !draft.revealed;
  const pick = draft.myPick;
  const look = (id: Category) => ({ ...CATEGORY_LOOK[id], title: t(`cat.${id}.title`), hint: t(`cat.${id}.hint`) });
  const per = draft.myPick && draft.oppPick && draft.myPick !== draft.oppPick ? Math.ceil(game.rules.count / 2) : game.rules.count;
  const same = draft.myPick === draft.oppPick;

  return (
    <main className="qd-screen qd-fade-in flex flex-col gap-[18px]">
      <header className="qd-in flex flex-col items-center gap-3.5 text-center">
        <span className="qd-chip h-[30px]! rounded-[15px]! pr-3 pl-[5px]">
          <span aria-hidden="true" className="qd-ball h-5 w-5" style={{ '--qd-ball': '#9B5CFF', color: '#FFFFFF', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.6), 0 0 10px var(--qd-brand-glow)' } as CSSProperties}>
            <Icon glyph="shuffle" size={12} stroke={2.6} />
          </span>
          {t('s31.badge')}
        </span>
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} size={44} ring="me" on="none" glow={game.me.glow} badge={pick ? 'ready' : 'none'} />
            <span className="text-[14px] font-bold" style={{ color: 'var(--qd-me-text)' }}>
              {t('common.you')}
            </span>
          </div>
          <div role="timer" aria-label={t('s31.timerAria', { t: sec })} className="relative h-16 w-16">
            <svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
              <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" style={{ stroke: 'var(--qd-track)' }} />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="175.9"
                strokeDashoffset={(175.9 * (1 - Math.min(10, sec) / 10)).toFixed(1)}
                style={{ stroke: urgent ? 'var(--qd-wrong)' : 'var(--qd-brand-text)', transition: 'stroke-dashoffset 250ms linear' }}
              />
            </svg>
            <span className="qd-num absolute inset-0 flex items-center justify-center text-[22px] font-extrabold">{draft.revealed ? '✓' : sec}</span>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2.5">
            <span className="min-w-0 text-right text-[13px] leading-[1.25] font-semibold" style={{ color: draft.oppPicked ? 'var(--qd-correct-text)' : 'var(--qd-opp-text)' }}>
              {draft.oppPicked ? t('s31.chosen', { opp: opp?.name ?? '' }) : t('s31.choosing', { opp: opp?.name ?? '' })}
            </span>
            {opp && <Avatar id={opp.userId} name={opp.name} photoUrl={opp.photoUrl} size={44} ring="opp" on="none" glow={opp.glow} badge={draft.oppPicked ? 'ready' : 'none'} />}
          </div>
        </div>
      </header>

      {!draft.revealed ? (
        <>
          <div className="qd-in qd-d1 flex flex-col gap-1.5 text-center">
            <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">{t('s31.title')}</h1>
            <p className="mx-2.5 my-0 text-[14px] leading-[1.4] font-medium text-hint">{t('s31.sub')}</p>
          </div>
          <div role="radiogroup" aria-label={t('s31.title')} className="flex flex-col gap-3">
            {draft.offers.map((id, i) => {
              const l = look(id);
              const on = pick === id;
              const dim = pick !== null && !on;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={pick !== null || pending}
                  onClick={() => void gameActions.draft(id)}
                  className="qd-press qd-cascade box-border flex min-h-[92px] w-full cursor-pointer items-center gap-3.5 rounded-[28px] border-0 py-3.5 pr-4 pl-3.5 text-left text-text disabled:cursor-default"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    background: on ? 'var(--qd-brand-glass)' : 'var(--qd-sheen), var(--qd-glass)',
                    boxShadow: on ? 'var(--qd-brand-edge)' : 'var(--qd-glass-edge)',
                    opacity: dim ? 0.45 : 1,
                  }}
                >
                  <span aria-hidden="true" className="qd-ball h-14 w-14" style={{ '--qd-ball': l.ball, '--qd-ball-glow': l.glow, color: l.ink } as CSSProperties}>
                    <Icon glyph={l.glyph} size={27} stroke={2.2} />
                  </span>
                  <span className="flex min-w-0 grow flex-col gap-[3px]">
                    <span className="text-[18px] font-bold tracking-[-0.01em]">{l.title}</span>
                    <span className="text-[13px] leading-[1.3] font-medium text-hint">{l.hint}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="box-border flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                    style={{
                      border: on ? '0' : '2px solid var(--qd-dash)',
                      background: on ? 'radial-gradient(circle at 32% 25%, rgba(255,255,255,.55), rgba(255,255,255,0) 50%), #9B5CFF' : 'transparent',
                      boxShadow: on ? '0 0 14px var(--qd-brand-glow)' : 'none',
                    }}
                  >
                    {on && <Icon glyph="check" size={15} stroke={3.5} />}
                  </span>
                </button>
              );
            })}
          </div>
          <p role="status" className="m-0 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-hint">
            <Icon glyph={pick ? 'check' : 'clock'} size={15} stroke={2.4} />
            {pick === null ? t('s31.hint') : draft.oppPicked ? t('s31.chosen', { opp: opp?.name ?? '' }) : t('s31.waiting')}
          </p>
        </>
      ) : (
        <>
          <div className="qd-in qd-d1 mt-2 flex flex-col gap-1.5 text-center">
            <h1 className="m-0 text-[30px] font-bold tracking-[-0.02em]" style={{ textShadow: 'var(--qd-text-glow)' }}>
              {t('s31.reveal.title')}
            </h1>
            <p className="m-0 text-[15px] font-medium text-hint">
              {same ? t('s31.reveal.same') : t('s31.reveal.sub', { n: per, questions: t('plural.question', { count: per }) })}
            </p>
          </div>
          <div className="relative mt-1.5 grid grid-cols-2 gap-3">
            {[
              { id: draft.myPick, label: t('s31.reveal.mine'), cls: 'qd-card-me qd-slide-l', color: 'var(--qd-me-text)', style: undefined },
              {
                id: draft.oppPick,
                label: t('s31.reveal.opp'),
                cls: 'qd-slide-r',
                color: 'var(--qd-opp-text)',
                style: { background: 'linear-gradient(155deg, rgba(255,138,61,.3), rgba(255,138,61,.06)), var(--qd-glass)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.4), inset 0 0 0 1.5px rgba(255,138,61,.55), 0 0 30px var(--qd-opp-glow)' },
              },
            ].map((side, i) => {
              const l = look(side.id ?? draft.offers[0]!);
              return (
                <div key={i} className={`${side.cls} flex flex-col items-center gap-2.5 rounded-[28px] px-3 pt-[18px] pb-4 text-center`} style={side.style}>
                  <span className="text-[12px] font-bold tracking-[0.06em] uppercase" style={{ color: side.color }}>
                    {side.label}
                  </span>
                  <span aria-hidden="true" className="qd-ball qd-bob h-[72px] w-[72px]" style={{ '--qd-ball': l.ball, '--qd-ball-glow': l.glow, color: l.ink, animationDelay: i ? '-900ms' : undefined } as CSSProperties}>
                    <Icon glyph={l.glyph} size={34} stroke={2.1} />
                  </span>
                  <span className="text-[16px] leading-[1.2] font-bold">{l.title}</span>
                </div>
              );
            })}
            <span aria-hidden="true" className="qd-vs qd-pop-late absolute top-1/2 left-1/2 z-[2] h-[30px] -translate-x-1/2 -translate-y-1/2 rounded-[15px] px-[11px] text-[13px]">
              +
            </span>
          </div>
        </>
      )}
    </main>
  );
}
