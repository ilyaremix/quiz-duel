import { useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AD_FREE_STARS,
  COIN_PACKS,
  GLOW_PRICES,
  PACK_PRICES,
  REACTION_PACKS,
  TOPIC_PRICE,
  isGlow,
  isPack,
  isPremiumTopic,
  type MeResponse,
  type StarsProduct,
} from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { CATEGORY_LOOK } from '../components/Category';
import { Icon, type IconGlyph } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { CoinDot } from '../components/Shop';
import { CoinPackArt, ReactionGlyph } from '../components/Art';
import { formatNumber } from '../i18n';
import { pw, shop, topicAccess, useShop, useWallet } from '../lib/economy';

interface Look {
  title: string;
  sub: string;
  stage: string;
  sample?: string;
  halo: string;
  price: number;
  stars: boolean;
  ball?: { glyph: IconGlyph; ball: string; glow: string; ink: string };
}

/**
 * Экран 28: шторка товара. Превью (свечение на аватарке, реакции, тема), баланс и кнопка:
 * купить / не хватает монет / надеть / надето. Монеты и «Без рекламы» - оплата звёздами в окне Telegram.
 * Тема: ещё и «Сыграть 1 раз» за рекламу (экран 33).
 */
export function ItemSheet({ me }: { me: MeResponse }) {
  const { t, i18n } = useTranslation();
  const open = useShop((s) => s.item);
  // Пока шторка уезжает, в ней остаётся последний товар.
  const last = useRef(open);
  if (open) last.current = open;
  const item = open ?? last.current;
  const busy = useShop((s) => s.busy);
  const wallet = useWallet();
  const w = wallet.data;
  const lang = i18n.language;
  const num = (n: number) => formatNumber(n, lang);

  let look: Look | null = null;
  let product: StarsProduct | null = null;
  if (item?.kind === 'glow' && isGlow(item.id)) {
    const id = item.id;
    look = {
      title: t(`s27.glows.${id}`),
      sub: t('s27.sec.glow'),
      stage: t('s28.glowStage'),
      price: GLOW_PRICES[id],
      stars: false,
      halo: id === 'gold' ? 'rgba(255,211,107,.32)' : id === 'fire' ? 'rgba(255,106,61,.3)' : id === 'ice' ? 'rgba(160,220,255,.28)' : 'rgba(34,211,238,.26)',
    };
  } else if (item?.kind === 'pack' && isPack(item.id)) {
    look = { title: t(`s27.packs.${item.id}`), sub: t('s27.sec.packs'), stage: t('s28.packStage'), price: PACK_PRICES[item.id], stars: false, halo: 'rgba(255,138,61,.24)' };
  } else if (item?.kind === 'topic' && isPremiumTopic(item.id)) {
    const c = CATEGORY_LOOK[item.id];
    look = {
      title: t(`cat.${item.id}.title`),
      sub: t('s27.sec.topics'),
      stage: t('s28.topicMeta'),
      sample: t('s33.sample', { q: t(`s33.samples.${item.id}`) }),
      price: TOPIC_PRICE,
      stars: false,
      halo: c.glow,
      ball: c,
    };
  } else if (item?.kind === 'coins') {
    const c = COIN_PACKS.find((x) => x.id === item.id) ?? COIN_PACKS[1];
    product = `coins_${c.id}` as StarsProduct;
    look = {
      title: t('s28.coinsT', { n: num(c.coins), coins: pw(t, c.coins, 'coin') }),
      sub: t(`s27.coinPacks.${c.id}`),
      stage: t('s28.coinsD'),
      price: c.stars,
      stars: true,
      halo: 'rgba(255,211,107,.3)',
      ball: { glyph: 'coin', ball: '#FFD36B', glow: 'rgba(255,211,107,.55)', ink: '#3A2600' },
    };
  } else if (item?.kind === 'adFree') {
    product = 'adfree';
    look = {
      title: t('s28.adFreeT'),
      sub: t('s27.sec.adFree'),
      stage: t('s28.adFreeD'),
      price: AD_FREE_STARS,
      stars: true,
      halo: 'rgba(255,106,136,.26)',
      ball: { glyph: 'ad', ball: '#FF6A88', glow: 'rgba(255,106,136,.5)', ink: '#FFFFFF' },
    };
  }

  const coins = w?.coins ?? 0;
  let state: 'buy' | 'short' | 'owned' | 'equipped' = 'buy';
  if (w && item?.kind === 'glow') state = w.glow === item.id ? 'equipped' : w.owned.glow.includes(item.id as never) ? 'owned' : 'buy';
  if (w && item?.kind === 'pack') state = w.pack === item.id ? 'equipped' : w.owned.pack.includes(item.id as never) ? 'owned' : 'buy';
  if (w && item?.kind === 'topic' && isPremiumTopic(item.id)) state = topicAccess(w, item.id) === 'owned' ? 'owned' : 'buy';
  if (w && item?.kind === 'adFree' && w.adFree) state = 'owned';
  if (look && state === 'buy' && !look.stars && coins < look.price) state = 'short';
  const wearable = item?.kind === 'glow' || item?.kind === 'pack';
  const isTopic = item?.kind === 'topic' && isPremiumTopic(item.id);
  const passReady = isTopic && w ? topicAccess(w, item.id as never) === 'pass' : false;

  let mainLabel = look ? (look.stars ? t('s28.pay', { n: num(look.price) }) : t('s28.buy', { n: num(look.price) })) : '';
  let mainGlyph: IconGlyph = look?.stars ? 'star' : 'coin';
  let mainDisabled = state === 'short';
  let onMain = () => {
    if (!item || !look) return;
    if (product) void shop.pay(product, t);
    else if (item.kind === 'glow' || item.kind === 'pack' || item.kind === 'topic') void shop.buy(item.kind, item.id, look.price, t);
  };
  if (state === 'owned') {
    mainLabel = wearable ? t('s28.equip') : t('s28.owned');
    mainGlyph = wearable ? 'sparkle' : 'check';
    mainDisabled = !wearable;
    onMain = () => {
      if (item && (item.kind === 'glow' || item.kind === 'pack')) void shop.equip(item.kind, item.id, t);
    };
  }
  if (state === 'equipped') {
    mainLabel = t('s28.equipped');
    mainGlyph = 'check';
    mainDisabled = true;
  }
  const pending = item ? Object.keys(busy).some((k) => k.endsWith(`:${item.id}`) || k === `pay:${product}` || k.startsWith('equip:')) : false;
  const short = look ? Math.max(0, look.price - coins) : 0;

  return (
    <Sheet open={Boolean(open && look)} label={look?.title ?? t('s28.aria')} onClose={shop.closeItem}>
      {look && item && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="m-0 text-[22px] font-bold tracking-[-0.02em]">{look.title}</h2>
              <p className="m-0 text-[14px] font-medium text-hint">{look.sub}</p>
            </div>
            <button type="button" aria-label={t('common.close')} onClick={shop.closeItem} className="qd-press qd-icon-btn h-11 w-11">
              <Icon glyph="close" size={18} stroke={2.5} />
            </button>
          </div>

          <div className="qd-card relative flex min-h-[196px] flex-col items-center justify-center gap-3.5 overflow-hidden rounded-[28px] px-4 py-[22px] text-center">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-[46%] left-1/2 -mt-[130px] -ml-[130px] h-[260px] w-[260px] rounded-full"
              style={{ background: `radial-gradient(closest-side, ${look.halo}, rgba(0,0,0,0))` }}
            />
            {item.kind === 'glow' && isGlow(item.id) && (
              <div className="qd-bob relative">
                <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={96} ring="me" on="none" glow={item.id} />
              </div>
            )}
            {item.kind === 'pack' && isPack(item.id) && (
              <div className="relative grid grid-cols-3 gap-3">
                {REACTION_PACKS[item.id].map((e, i) => (
                  <span
                    key={e}
                    className="qd-bob flex h-[62px] w-[62px] items-center justify-center rounded-full"
                    style={{ background: 'var(--qd-sheen), var(--qd-glass)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45), 0 0 0 2px var(--qd-ring-gap)', animationDelay: `${i * 160}ms` }}
                  >
                    <ReactionGlyph r={e} size={44} live />
                  </span>
                ))}
              </div>
            )}
            {item.kind === 'coins' && (
              <div className="qd-bob relative">
                <CoinPackArt id={(COIN_PACKS.find((x) => x.id === item.id) ?? COIN_PACKS[1]).id} size={112} live />
              </div>
            )}
            {look.ball && item.kind !== 'coins' && (
              <span
                aria-hidden="true"
                className="qd-ball qd-bob relative h-[92px] w-[92px]"
                style={{ '--qd-ball': look.ball.ball, '--qd-ball-glow': look.ball.glow, color: look.ball.ink } as CSSProperties}
              >
                <Icon glyph={look.ball.glyph} size={44} stroke={2} />
              </span>
            )}
            <span className="relative text-[13px] leading-[1.4] font-semibold text-hint">{look.stage}</span>
            {look.sample && <span className="relative max-w-[300px] text-[14px] leading-[1.4] font-medium italic">{look.sample}</span>}
          </div>

          <div role="status" className="flex items-center justify-center gap-1.5 text-[14px] font-semibold" style={{ color: state === 'short' ? 'var(--qd-wrong-text)' : 'var(--tg-theme-hint-color)' }}>
            <CoinDot size={20} star={look.stars} />
            {look.stars
              ? t('s29.aria')
              : state === 'short'
                ? t('s28.short', { n: num(short), coins: pw(t, short, 'coin') })
                : t('s28.balance', { n: num(coins), coins: pw(t, coins, 'coin') })}
          </div>

          <div className="flex flex-col gap-2.5">
            {isTopic && state !== 'owned' && (
              <Button
                variant="secondary"
                size="m"
                icon={<Icon glyph={passReady ? 'check' : 'play'} size={18} stroke={2.4} />}
                disabled={passReady}
                onClick={() => void shop.watchAd('topic', { topic: item.id as never })}
              >
                {passReady ? t('s04.pass') : `${t('s33.once.t')} · ${t('s33.once.a')}`}
              </Button>
            )}
            <Button icon={<Icon glyph={mainGlyph} size={22} stroke={2.4} />} disabled={mainDisabled || pending} onClick={onMain}>
              {mainLabel}
            </Button>
            {state === 'short' && (
              <Button
                variant="secondary"
                size="m"
                icon={<Icon glyph="gift" size={18} stroke={2.4} />}
                onClick={() => {
                  shop.closeItem();
                  shop.setSection('earn');
                }}
              >
                {t('s28.earn')}
              </Button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
