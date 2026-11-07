import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { friendsActions, useFriends } from '../lib/friends';
import { serverNow } from '../lib/game';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { CATEGORY_LOOK } from './Category';
import { Icon } from './Icon';

/**
 * Экран 26: друг зовёт на дуэль - баннер сверху поверх любой вкладки. «Принять» - сразу в лобби,
 * «Позже» - баннер прячется (вызов остаётся в боте). Полоса - сколько ещё живёт вызов.
 */
export function InviteBanner() {
  const { t } = useTranslation();
  const invite = useFriends((s) => s.invite);
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!invite) return;
    const id = window.setInterval(() => setNow(serverNow()), 1000);
    return () => window.clearInterval(id);
  }, [invite]);
  useEffect(() => {
    if (invite && now > invite.expiresAt) friendsActions.dismissInvite();
  }, [invite, now]);
  if (!invite) return null;

  const total = 15 * 60_000;
  const left = Math.max(0, invite.expiresAt - now);
  const pct = Math.round((left / total) * 100);
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  const look = CATEGORY_LOOK[invite.category];
  const meta = t('s26.duelMeta', {
    cat: t(`cat.${invite.category}.title`),
    mode: t(`s32.mode.${invite.rules.variant}.t`),
    n: invite.rules.count,
    questions: t('plural.question', { count: invite.rules.count }),
  });

  return (
    <div
      className="qd-toast-in fixed right-4 left-4 z-40"
      style={{ top: 'calc(var(--tg-viewport-safe-area-inset-top, 0px) + var(--tg-viewport-content-safe-area-inset-top, 0px) + 12px)' }}
    >
      <section
        role="alertdialog"
        aria-label={t('s26.aria')}
        className="mx-auto box-border flex max-w-[560px] flex-col gap-3 rounded-[28px] p-3.5 text-text"
        style={{ background: 'var(--qd-glass-solid)', boxShadow: 'var(--qd-glass-edge), 0 18px 40px rgba(3,4,20,.45)' }}
      >
        <div className="flex items-center gap-3">
          <Avatar id={invite.from.id} name={invite.from.name} photoUrl={invite.from.photoUrl} size={48} ring="opp" on="none" glow={invite.from.glow} />
          <div className="flex min-w-0 grow flex-col gap-[3px]">
            <span className="text-[16px] leading-[1.25] font-bold tracking-[-0.01em]">{t('s26.duelTitle', { name: invite.from.name })}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-hint">
              <span
                aria-hidden="true"
                className="qd-ball h-[18px] w-[18px]"
                style={{ '--qd-ball': look.ball, '--qd-ball-glow': look.glow, color: look.ink } as CSSProperties}
              >
                <Icon glyph={look.glyph} size={10} stroke={2.8} />
              </span>
              <span className="min-w-0 truncate">{meta}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label={t('s26.progress', { t: `${mm}:${String(ss).padStart(2, '0')}` })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-[5px] overflow-hidden rounded-[3px]"
            style={{ background: 'var(--qd-track)' }}
          >
            <div
              className="h-[5px] rounded-[3px]"
              style={{
                width: `${pct}%`,
                transition: 'width 1000ms linear',
                background: 'linear-gradient(90deg, #FF8A3D, #FF6A88)',
                boxShadow: '0 0 8px rgba(255,138,61,.6)',
              }}
            />
          </div>
          <span className="qd-num text-[12px] font-semibold text-hint">{t('s26.progress', { t: `${mm}:${String(ss).padStart(2, '0')}` })}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="s" onClick={friendsActions.dismissInvite}>
            {t('s26.later')}
          </Button>
          <Button variant="onColor" size="s" icon={<Icon glyph="duel" size={18} stroke={2.4} />} onClick={() => void friendsActions.acceptInvite()}>
            {t('s26.accept')}
          </Button>
        </div>
      </section>
    </div>
  );
}
