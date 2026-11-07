import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AD_FREE_STARS } from '@quiz-duel/shared';
import { Button } from '../components/Button';
import { CATEGORY_LOOK } from '../components/Category';
import { Icon, type IconGlyph } from '../components/Icon';
import { formatNumber } from '../i18n';
import { pw, shop, useShop } from '../lib/economy';

const PILL = 'box-border flex h-7 items-center gap-1 rounded-[14px] px-[11px] text-white';
const PILL_BG = { background: 'rgba(0,0,0,.45)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)' };

/**
 * Экран 30: реклама на весь экран. Сверху полоса досмотра, «Реклама», остаток и звук; крестик - с подтверждением.
 * Засчитывается только досмотренный ролик: сервер сам меряет время с начала просмотра.
 * Внизу - что даст просмотр: монеты, тема на 1 игру или (обязательный ролик после 3-й партии) «Без рекламы».
 */
export function AdScreen() {
  const { t, i18n } = useTranslation();
  const ad = useShop((s) => s.ad);
  const video = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [played, setPlayed] = useState(0);
  const finished = useRef(false);

  const id = ad?.id ?? null;
  useEffect(() => {
    finished.current = false;
    setPlayed(0);
  }, [id]);

  // Ролик стоит, пока открыто подтверждение закрытия (и пока он грузится).
  const playing = ad?.phase === 'playing';
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) void v.play().catch(() => undefined);
    else v.pause();
  }, [playing, id]);

  if (!ad) return null;
  const sec = ad.sec;
  const progress = Math.min(1, played / sec);
  const left = Math.max(0, Math.ceil(sec - played));
  const topicLook = ad.topic ? CATEGORY_LOOK[ad.topic] : null;
  const topicName = ad.topic ? t(`cat.${ad.topic}.title`) : '';
  const reward = 15;

  const foot: { text: string; glyph: IconGlyph; ball: string; glow: string; ink: string } =
    ad.purpose === 'reward'
      ? { text: t('s30.reward', { n: reward, coins: pw(t, reward, 'coin') }), glyph: 'coin', ball: '#FFD36B', glow: 'var(--qd-gold-glow)', ink: '#3A2600' }
      : ad.purpose === 'topic'
        ? { text: t('s30.rewardTopic'), glyph: 'unlock', ball: topicLook?.ball ?? '#5B5BF6', glow: topicLook?.glow ?? 'rgba(91,91,246,.55)', ink: '#FFFFFF' }
        : { text: t('s30.forced'), glyph: 'ad', ball: '#FF6A88', glow: 'rgba(255,106,136,.5)', ink: '#FFFFFF' };
  const done =
    ad.purpose === 'reward'
      ? {
          text: t('s30.done.reward', { n: ad.reward, coins: pw(t, ad.reward, 'coin') }),
          glyph: 'coin' as IconGlyph,
          ball: '#FFD36B',
          glow: 'var(--qd-gold-glow)',
          ink: '#3A2600',
          color: 'var(--qd-gold-text)',
        }
      : ad.purpose === 'topic'
        ? {
            text: t('s30.done.topic', { name: topicName }),
            glyph: 'unlock' as IconGlyph,
            ball: '#3BE58B',
            glow: 'var(--qd-ok-glow)',
            ink: '#04261A',
            color: 'var(--qd-correct-text)',
          }
        : {
            text: t('s30.done.forced'),
            glyph: 'check' as IconGlyph,
            ball: '#3BE58B',
            glow: 'var(--qd-ok-glow)',
            ink: '#04261A',
            color: 'var(--tg-theme-hint-color)',
          };

  // Считаем реально проигранное время: ролик на паузе (свернули Telegram) не идёт.
  const onTime = () => {
    const v = video.current;
    if (v && ad.phase === 'playing') setPlayed((p) => Math.max(p, v.currentTime));
  };
  const onEnded = () => {
    setPlayed(sec);
    if (finished.current) return;
    finished.current = true;
    void shop.adFinished();
  };

  return (
    <div role="region" aria-label={t('s30.aria')} className="qd-dark fixed inset-0 z-[60] overflow-hidden bg-black text-white">
      <video
        ref={video}
        src={ad.src}
        poster="/ads/ad1.jpg"
        autoPlay
        muted={muted}
        playsInline
        loop={false}
        aria-hidden="true"
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onError={shop.adBroken}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[150px]"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.62), rgba(0,0,0,0))' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[220px]"
        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,.72), rgba(0,0,0,0))' }}
      />

      <header
        className="absolute right-4 left-4 z-[2] flex flex-col gap-2.5"
        style={{ top: 'calc(var(--tg-viewport-safe-area-inset-top, 0px) + var(--tg-viewport-content-safe-area-inset-top, 0px) + 16px)' }}
      >
        <div
          role="progressbar"
          aria-label={t('s30.left', { t: `0:${String(left).padStart(2, '0')}` })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-1 overflow-hidden rounded-sm"
          style={{ background: 'rgba(255,255,255,.25)' }}
        >
          <div className="qd-ad-bar h-1 rounded-sm bg-white" style={{ width: `${Math.round(progress * 100)}%`, boxShadow: '0 0 8px rgba(255,255,255,.8)' }} />
        </div>
        <div className="flex items-center gap-2">
          <span className={`${PILL} text-[12px] font-extrabold tracking-[0.04em] uppercase`} style={PILL_BG}>
            {t('s30.label')}
          </span>
          <span className={`${PILL} qd-num text-[13px] font-bold`} style={PILL_BG}>
            <Icon glyph="clock" size={13} stroke={2.5} />
            {t('s30.left', { t: `0:${String(left).padStart(2, '0')}` })}
          </span>
          <div className="grow" />
          <button
            type="button"
            aria-label={muted ? t('s30.soundOn') : t('s30.soundOff')}
            onClick={() => setMuted((m) => !m)}
            className="qd-press flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-white"
            style={PILL_BG}
          >
            <Icon glyph={muted ? 'mute' : 'sound'} size={19} stroke={2.3} />
          </button>
          <button
            type="button"
            aria-label={t('s30.closeAria')}
            onClick={shop.askCloseAd}
            className="qd-press flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-white"
            style={PILL_BG}
          >
            <Icon glyph="close" size={18} stroke={2.6} />
          </button>
        </div>
      </header>

      <footer
        className="absolute right-4 left-4 z-[2] flex flex-col items-center gap-2.5 text-center"
        style={{ bottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 28px)' }}
      >
        <span
          className="box-border inline-flex min-h-9 max-w-full items-center gap-2 rounded-[18px] py-1.5 pr-3.5 pl-1.5 text-[14px] font-semibold"
          style={{ background: 'rgba(0,0,0,.5)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.22)' }}
        >
          <span
            aria-hidden="true"
            className="qd-ball h-[26px] w-[26px]"
            style={{ '--qd-ball': foot.ball, '--qd-ball-glow': foot.glow, color: foot.ink } as CSSProperties}
          >
            <Icon glyph={foot.glyph} size={14} stroke={2.6} />
          </span>
          {foot.text}
        </span>
        {ad.purpose === 'forced' && ad.phase === 'playing' && (
          <button
            type="button"
            onClick={() => {
              shop.closeAd();
              shop.openItem({ kind: 'adFree', id: 'adfree' });
            }}
            className="qd-press box-border inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[18px] border-0 pr-3.5 pl-[5px] text-[13px] font-bold text-white"
            style={{ background: 'rgba(255,255,255,.14)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.3)' }}
          >
            <span
              aria-hidden="true"
              className="qd-ball h-[26px] w-[26px]"
              style={{ '--qd-ball': '#FFC93D', '--qd-ball-glow': 'rgba(255,201,61,.55)', color: '#3A2200' } as CSSProperties}
            >
              <Icon glyph="star" size={14} stroke={2.6} />
            </span>
            {t('s30.noAds')} · {formatNumber(AD_FREE_STARS, i18n.language)}
          </button>
        )}
      </footer>

      {(ad.phase === 'loading' || ad.phase === 'failed') && (
        <div className="absolute inset-0 z-[3] flex items-center justify-center">
          {ad.phase === 'failed' ? (
            <div
              className="qd-pop mx-8 flex flex-col items-center gap-3 rounded-[30px] px-[18px] pt-[22px] pb-[18px] text-center"
              style={{ background: 'var(--qd-glass-solid)', boxShadow: 'var(--qd-glass-edge)' }}
            >
              <span className="text-[16px] font-bold">{t('toast.adNotCounted')}</span>
              <Button size="m" onClick={() => shop.closeAd()}>
                {t('common.close')}
              </Button>
            </div>
          ) : (
            <span aria-hidden="true" className="qd-skel h-14 w-14 rounded-full" style={{ background: 'rgba(255,255,255,.2)' }} />
          )}
        </div>
      )}

      {ad.phase === 'confirm' && (
        <>
          <div aria-hidden="true" className="qd-backdrop-in absolute inset-0 z-[4]" style={{ background: 'rgba(0,0,0,.55)' }} />
          <div className="absolute top-1/2 right-8 left-8 z-[5] -translate-y-1/2">
            <section
              role="alertdialog"
              aria-label={t('s30.confirm.title')}
              className="qd-pop mx-auto flex max-w-[420px] flex-col items-center gap-2.5 rounded-[30px] px-[18px] pt-[22px] pb-[18px] text-center text-text"
              style={{ background: 'var(--qd-glass-solid)', boxShadow: 'var(--qd-glass-edge)' }}
            >
              <span
                aria-hidden="true"
                className="qd-ball h-[52px] w-[52px]"
                style={{ '--qd-ball': '#FFD36B', '--qd-ball-glow': 'var(--qd-gold-glow)', color: '#3A2600' } as CSSProperties}
              >
                <Icon glyph="alert" size={25} stroke={2.3} />
              </span>
              <h2 className="mt-1 mb-0 text-[20px] font-bold tracking-[-0.02em]">{t('s30.confirm.title')}</h2>
              <p className="mt-0 mb-1.5 text-[14px] leading-[1.4] font-medium text-hint">
                {ad.purpose === 'forced' ? t('s30.confirm.forced') : t('s30.confirm.reward')}
              </p>
              <div className="flex w-full flex-col gap-2">
                <Button size="m" icon={<Icon glyph="play" size={18} stroke={2.4} />} onClick={shop.resumeAd}>
                  {t('s30.confirm.stay')}
                </Button>
                <Button variant="danger" size="m" onClick={() => shop.closeAd()}>
                  {t('s30.confirm.leave')}
                </Button>
              </div>
            </section>
          </div>
        </>
      )}

      {ad.phase === 'done' && (
        <>
          <div aria-hidden="true" className="qd-backdrop-in absolute inset-0 z-[4]" style={{ background: 'rgba(4,5,16,.72)' }} />
          <div className="absolute right-4 left-4 z-[5] flex flex-col gap-3" style={{ bottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 28px)' }}>
            <section
              role="status"
              className="qd-pop mx-auto flex w-full max-w-[560px] flex-col items-center gap-2 rounded-[30px] px-[18px] pt-6 pb-[18px] text-center text-text"
              style={{ background: 'var(--qd-glass-solid)', boxShadow: 'var(--qd-glass-edge)' }}
            >
              <span
                aria-hidden="true"
                className="qd-ball qd-trophy h-[76px] w-[76px]"
                style={{ '--qd-ball': done.ball, '--qd-ball-glow': done.glow, color: done.ink } as CSSProperties}
              >
                <Icon glyph={done.glyph} size={36} stroke={2.6} />
              </span>
              <h2 className="qd-in qd-d2 mt-1.5 mb-0 text-[26px] font-bold tracking-[-0.02em]">{t('s30.done.title')}</h2>
              <p className="qd-in qd-d3 mt-0 mb-2 text-[15px] font-semibold" style={{ color: done.color }}>
                {done.text}
              </p>
              <div className="flex w-full flex-col gap-2">
                <Button onClick={() => shop.closeAd()}>{t('s30.done.next')}</Button>
                {ad.purpose === 'forced' && (
                  <Button
                    variant="secondary"
                    size="m"
                    icon={<Icon glyph="star" size={18} stroke={2.4} />}
                    onClick={() => {
                      shop.closeAd(false);
                      shop.openItem({ kind: 'adFree', id: 'adfree' });
                    }}
                  >
                    {t('s30.done.upsell')}
                  </Button>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
