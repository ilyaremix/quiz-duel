import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@quiz-duel/shared';
import { Avatar, initialsOf } from '../components/Avatar';
import { ResumeBanner } from '../components/Banner';
import { Button } from '../components/Button';
import { Icon, type IconGlyph } from '../components/Icon';
import { TabBar } from '../components/TabBar';
import { formatNumber } from '../i18n';
import { gameActions, showToast, useGame } from '../lib/game';

function ModeCard({ glyph, tone, title, hint, onPress }: { glyph: IconGlyph; tone: 'brand' | 'gold'; title: string; hint: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="qd-press flex min-h-[104px] cursor-pointer flex-col items-start gap-2.5 rounded-[20px] border-0 bg-section p-4 text-left font-[inherit] text-text"
      style={{ '--qd-shadow': '0 4px 0 var(--qd-lip)' } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={tone === 'brand' ? { background: 'var(--qd-brand-tint)', color: 'var(--qd-brand-text)' } : { background: 'var(--qd-gold-tint)', color: 'var(--qd-gold-text)' }}
      >
        <Icon glyph={glyph} size={20} stroke={2.2} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[16px] font-extrabold">{title}</span>
        <span className="text-[13px] font-semibold text-hint">{hint}</span>
      </span>
    </button>
  );
}

/** Экран 3: главная. Шапка игрока, «Дуэль с другом», быстрая игра и тренировка, последние матчи. */
export function HomeScreen({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const game = useGame((s) => s.game);
  const hidden = useGame((s) => s.hidden);
  const soon = () => showToast('info', 'toast.soon');
  const newbie = me.games === 0;

  const resume = game && hidden;
  const qn = game?.question ? game.question.index + 1 : 1;

  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen qd-screen-in flex flex-col gap-4 pb-[120px]!">
        <header className="flex items-center gap-3">
          <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={52} />
          <div className="flex min-w-0 grow flex-col gap-1">
            <div className="truncate text-[20px] font-extrabold">{t('s03.greeting', { me: me.firstName })}</div>
            <div className="qd-num flex items-center gap-1.5">
              <span className="flex h-6 items-center gap-1 rounded-xl px-2.5 text-[13px] font-extrabold" style={{ background: 'var(--qd-gold-tint)', color: 'var(--qd-gold-text)' }}>
                <Icon glyph="rating" size={13} stroke={2.5} />
                {formatNumber(me.rating, i18n.language)}
              </span>
              {newbie && <span className="flex h-6 items-center rounded-xl bg-section px-2.5 text-[13px] font-bold text-hint">{t('s03.newbie')}</span>}
            </div>
          </div>
          <button
            type="button"
            aria-label={t('s03.settings')}
            onClick={soon}
            className="qd-press flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 bg-section p-0 text-hint"
          >
            <Icon glyph="settings" size={22} />
          </button>
        </header>

        {resume && (
          <ResumeBanner
            title={t('banner.resume.title')}
            text={
              game.opponent
                ? ['waiting', 'lobby'].includes(game.phase)
                  ? t('banner.resume.textLobby', { opp: game.opponent.name })
                  : t('banner.resume.text', { opp: game.opponent.name, n: qn })
                : ''
            }
            action={t('banner.resume.action')}
            onAction={gameActions.returnToGame}
          />
        )}

        <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-[24px] p-5 text-white" style={{ background: 'var(--qd-me)' }}>
          <div aria-hidden="true" className="absolute top-[18px] right-[18px] h-[60px] w-[104px]">
            <div className="absolute top-1 left-0 box-border flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] text-[20px] font-extrabold" style={{ background: '#5B9DFF', borderColor: 'var(--qd-me)' }}>
              {initialsOf(me.firstName)}
            </div>
            <div className="absolute top-1 left-[46px] box-border flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] text-[20px] font-extrabold" style={{ background: 'var(--qd-opp)', borderColor: 'var(--qd-me)', color: '#2A1405' }}>
              ?
            </div>
            <div className="absolute top-10 left-9 flex h-[22px] items-center rounded-[11px] px-[7px] text-[11px] font-black" style={{ background: 'var(--qd-gold)', color: '#2A1F05' }}>
              VS
            </div>
          </div>
          <div className="flex max-w-[210px] flex-col gap-1.5">
            <h1 className="m-0 text-[24px] leading-[1.15] font-extrabold">{t('s03.heroTitle')}</h1>
            <p className="m-0 text-[14px] leading-[1.35] font-semibold" style={{ color: '#E3ECFF' }}>
              {t('s03.heroText')}
            </p>
          </div>
          <Button variant="onColor" onClick={() => gameActions.openCreate(me.docsAccepted)}>
            {t('s03.create')}
          </Button>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <ModeCard glyph="bolt" tone="brand" title={t('s03.quick')} hint={t('s03.quickHint')} onPress={soon} />
          <ModeCard glyph="target" tone="gold" title={t('s03.training')} hint={t('s03.trainingHint')} onPress={soon} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 ml-1 text-[17px] font-extrabold">{t('s03.recent')}</h2>
          <div className="flex flex-col items-center gap-2 rounded-[20px] bg-section p-5 text-center">
            <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-brand-text">
              <Icon glyph="medal" size={24} stroke={2.2} />
            </span>
            <span className="text-[16px] font-extrabold">{t('s03.emptyTitle')}</span>
            <span className="max-w-[280px] text-[13px] leading-[1.4] font-semibold text-hint">{t('s03.emptyText')}</span>
          </div>
        </section>
      </main>

      <div className="fixed right-4 left-4 z-10" style={{ bottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 22px)' }}>
        <div className="mx-auto max-w-[560px]">
          <TabBar active="home" onTab={(tab) => tab !== 'home' && soon()} />
        </div>
      </div>
    </div>
  );
}
