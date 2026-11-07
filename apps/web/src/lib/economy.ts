/**
 * Обновление 2.0: монеты, магазин, задания, реклама и оплата звёздами.
 * Всё считает сервер; здесь - кэш кошелька, шторки магазина и экран рекламы.
 */
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { invoice, openTelegramLink, shareStory } from '@tma.js/sdk-react';
import type { TFunction } from 'i18next';
import {
  isPremiumTopic,
  type AdPurpose,
  type PremiumTopic,
  type ShopKind,
  type StarsProduct,
  type TaskView,
  type WalletResponse,
} from '@quiz-duel/shared';
import i18n from 'i18next';
import { api, ApiRequestError, queryKeys } from './api';
import { queryClient } from './queryClient';
import { setAdGate, showToast } from './game';
import { haptic } from './telegram';
import { track } from './track';

/** Слово по числу: «1 монета», «5 монет» (формы - plural.* в словаре). */
export function pw(t: TFunction, n: number, word: string): string {
  return t(`plural.${word}`, { count: n });
}

const fmt = (n: number) => new Intl.NumberFormat(i18n.language).format(n);

export function useWallet() {
  return useQuery({ queryKey: queryKeys.wallet, queryFn: api.wallet, staleTime: 15_000 });
}

const setWallet = (wallet: WalletResponse) => queryClient.setQueryData(queryKeys.wallet, wallet);
const wallet = () => queryClient.getQueryData<WalletResponse>(queryKeys.wallet);

/** Сервер сообщил, что кошелёк изменился (оплата, награда за друга, конец партии). */
export function walletChanged() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
}

export type ShopItemRef = { kind: ShopKind | 'adFree' | 'coins'; id: string };

export interface AdState {
  purpose: AdPurpose;
  topic?: PremiumTopic;
  /** Что сделать после ролика (обязательная реклама перед новой игрой). */
  then?: () => void;
  phase: 'loading' | 'playing' | 'confirm' | 'done' | 'failed';
  id: string | null;
  sec: number;
  src: string;
  reward: number;
}

interface ShopStore {
  /** Раздел магазина: задания или товары. */
  section: 'earn' | 'items';
  /** Открытая шторка товара. */
  item: ShopItemRef | null;
  /** Экран рекламы. */
  ad: AdState | null;
  /** Задания-каналы, на которые уже нажали «Перейти»: теперь кнопка «Проверить». */
  checking: Record<string, boolean>;
  /** Идут запросы: кнопки неактивны. */
  busy: Record<string, boolean>;
  /** Обязательный ролик отложили (закрыли) - покажем снова перед следующей игрой. */
  adSkipped: boolean;
}

export const useShop = create<ShopStore>(() => ({
  section: 'earn',
  item: null,
  ad: null,
  checking: {},
  busy: {},
  adSkipped: false,
}));

const set = useShop.setState;
const get = useShop.getState;

async function guarded<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  if (get().busy[key]) return null;
  set({ busy: { ...get().busy, [key]: true } });
  try {
    return await fn();
  } finally {
    const { [key]: _, ...rest } = get().busy;
    set({ busy: rest });
  }
}

/** Отказ сервера - понятный тост. */
function failed(error: unknown, t: TFunction, price?: number) {
  const reason = error instanceof ApiRequestError ? error.reason : null;
  if (reason === 'no_coins' && price !== undefined) {
    const short = Math.max(0, price - (wallet()?.coins ?? 0));
    showToast('error', 'toast.notEnough', { n: fmt(short), coins: pw(t, short, 'coin') });
  } else if (reason === 'not_subscribed') showToast('error', 'toast.subMissing');
  else if (reason === 'cannot_verify') showToast('error', 'toast.subCantCheck');
  else if (reason === 'already_claimed') {
    walletChanged();
    showToast('info', 'toast.alreadyClaimed');
  } else if (reason === 'limit') showToast('info', 'toast.adLimit');
  else showToast('error', 'toast.connection');
}

export const shop = {
  setSection(section: 'earn' | 'items') {
    set({ section });
  },

  openItem(item: ShopItemRef) {
    set({ item });
  },

  closeItem() {
    set({ item: null });
  },

  async claimDaily(t: TFunction) {
    track('daily');
    await guarded('daily', async () => {
      try {
        const res = await api.daily();
        setWallet(res.wallet);
        haptic.success();
        showToast('success', 'toast.claimed', { n: fmt(res.reward), coins: pw(t, res.reward, 'coin') }, 'coin');
      } catch (error) {
        failed(error, t);
      }
    });
  },

  async claimTask(task: TaskView, t: TFunction) {
    await guarded(`task:${task.id}`, async () => {
      try {
        const res = await api.claimTask(task.id);
        setWallet(res.wallet);
        haptic.success();
        const vars = { n: fmt(res.reward), coins: pw(t, res.reward, 'coin') };
        if (task.type === 'channel') showToast('success', 'toast.subOk', vars, 'coin');
        else if (task.type === 'story') showToast('success', 'toast.storyDone', vars, 'coin');
        else showToast('success', 'toast.claimed', vars, 'coin');
        const { [task.id]: _, ...rest } = get().checking;
        set({ checking: rest });
      } catch (error) {
        failed(error, t);
      }
    });
  },

  /** «Перейти» в канал: дальше кнопка «Проверить» (подписку проверит бот). */
  openChannel(task: TaskView) {
    const name = (task.channel ?? '').replace(/^@/, '');
    if (!name) return;
    const url = `https://t.me/${name}`;
    track('taskCh');
    try {
      if (openTelegramLink.isAvailable()) openTelegramLink(url);
      else window.open(url, '_blank');
    } catch {
      window.open(url, '_blank');
    }
    set({ checking: { ...get().checking, [task.id]: true } });
    showToast('info', 'toast.channelOpen');
  },

  /** История в Telegram (только Premium): фон и ссылка на игру; награда - по возвращении. */
  async postStory(task: TaskView, appUrl: string, t: TFunction) {
    track('taskStory');
    try {
      if (!shareStory.isAvailable()) {
        showToast('error', 'toast.storyUnavailable');
        return;
      }
      shareStory(`${window.location.origin}/story.jpg`, {
        text: t('s27.storyText'),
        widgetLink: { url: appUrl, name: 'Quiz Duel' },
      });
    } catch {
      showToast('error', 'toast.storyUnavailable');
      return;
    }
    // Проверить публикацию нельзя: забираем награду, когда игрок вернулся из редактора истории.
    window.setTimeout(() => void shop.claimTask(task, t), 1500);
  },

  async buy(kind: ShopKind, item: string, price: number, t: TFunction) {
    track(kind === 'glow' ? 'buyGlow' : kind === 'pack' ? 'buyPack' : 'buyTopic');
    await guarded(`buy:${kind}:${item}`, async () => {
      try {
        const res = await api.buy(kind, item);
        setWallet(res);
        haptic.success();
        if (kind === 'topic' && isPremiumTopic(item)) {
          showToast('success', 'toast.topicOwned', { name: t(`cat.${item}.title`) });
          set({ item: null });
        } else showToast('success', 'toast.bought');
      } catch (error) {
        failed(error, t, price);
      }
    });
  },

  async equip(kind: 'glow' | 'pack', item: string, t: TFunction) {
    await guarded(`equip:${kind}`, async () => {
      try {
        const res = await api.equip(kind, item);
        setWallet(res);
        haptic.select();
        showToast('success', 'toast.equipped', { name: t(kind === 'glow' ? `s27.glows.${item}` : `s27.packs.${item}`) });
        set({ item: null });
      } catch (error) {
        failed(error, t);
      }
    });
  },

  /** Оплата звёздами: окно Telegram; монеты зачисляет сервер, когда придёт successful_payment. */
  async pay(product: StarsProduct, t: TFunction) {
    track(product === 'adfree' ? 'buyAdFree' : 'buyCoins');
    await guarded(`pay:${product}`, async () => {
      let url: string;
      try {
        url = (await api.invoice(product)).url;
      } catch (error) {
        failed(error, t);
        return;
      }
      let status: string;
      try {
        status = invoice.openUrl.isAvailable() ? await invoice.openUrl(url) : 'failed';
      } catch {
        status = 'failed';
      }
      if (status === 'paid') {
        haptic.success();
        set({ item: null });
        showToast('success', product === 'adfree' ? 'toast.adFree' : 'toast.coinsPaid', undefined, product === 'adfree' ? undefined : 'coin');
        // Зачисление приходит от бота через секунду-другую: обновляем кошелёк, пока не увидим его.
        const before = wallet();
        for (const ms of [600, 1200, 2400, 4800]) {
          await new Promise((r) => window.setTimeout(r, ms));
          const fresh = await queryClient.fetchQuery({ queryKey: queryKeys.wallet, queryFn: api.wallet, staleTime: 0 });
          if (!before || fresh.coins !== before.coins || fresh.adFree !== before.adFree) break;
        }
      } else if (status === 'failed') showToast('error', 'toast.payFailed');
    });
  },

  // -------------------------------------------------------------------------
  // Реклама

  /** Открыть ролик: просмотр начинается на сервере, засчитывается только досмотренный до конца. */
  async watchAd(purpose: AdPurpose, opts: { topic?: PremiumTopic; then?: () => void } = {}) {
    if (get().ad) return;
    track('adWatch');
    set({ ad: { purpose, topic: opts.topic, then: opts.then, phase: 'loading', id: null, sec: 15, src: '/ads/ad1.mp4', reward: 0 }, item: null });
    try {
      const res = await api.adStart(purpose, opts.topic);
      const cur = get().ad;
      if (!cur) return;
      set({ ad: { ...cur, id: res.id, sec: res.sec, src: res.src, phase: 'playing' } });
    } catch (error) {
      const reason = error instanceof ApiRequestError ? error.reason : null;
      const then = get().ad?.then;
      set({ ad: null });
      if (reason === 'ad_free') {
        walletChanged();
        then?.();
      } else if (reason === 'limit') showToast('info', 'toast.adLimit');
      else showToast('error', 'toast.connection');
    }
  },

  /** Ролик доигран: сервер проверит, что прошло достаточно времени. */
  async adFinished() {
    const cur = get().ad;
    if (!cur?.id || cur.phase === 'done') return;
    try {
      const res = await api.adDone(cur.id);
      setWallet(res.wallet);
      haptic.success();
      track('adDone');
      set({ ad: { ...cur, phase: 'done', reward: res.reward }, adSkipped: false });
    } catch (error) {
      const reason = error instanceof ApiRequestError ? error.reason : null;
      if (reason === 'too_early') {
        // Часы телефона спешат: дошлём ещё раз чуть позже.
        window.setTimeout(() => void shop.adFinished(), 1200);
        return;
      }
      set({ ad: { ...cur, phase: 'failed' } });
    }
  },

  /** Крестик: подтверждение - просмотр не засчитается. */
  askCloseAd() {
    const cur = get().ad;
    if (!cur || cur.phase === 'done') return shop.closeAd();
    if (cur.phase === 'loading' || cur.phase === 'failed') {
      set({ ad: null });
      return;
    }
    set({ ad: { ...cur, phase: 'confirm' } });
  },

  resumeAd() {
    const cur = get().ad;
    if (cur?.phase === 'confirm') set({ ad: { ...cur, phase: 'playing' } });
  },

  /** Ролик не загрузился: просмотр не засчитан. */
  adBroken() {
    const cur = get().ad;
    if (cur && cur.phase !== 'done') set({ ad: { ...cur, phase: 'failed' } });
  },

  /** Закрыть: досмотренный - дальше (новая игра), брошенный - не засчитан. */
  closeAd(runThen = true) {
    const cur = get().ad;
    if (!cur) return;
    set({ ad: null });
    if (cur.phase === 'done') {
      if (runThen) cur.then?.();
      return;
    }
    if (cur.purpose === 'forced') set({ adSkipped: true });
    track('adSkip');
    showToast('info', 'toast.adNotCounted');
  },

  /**
   * Перед новой игрой: если пора обязательный ролик - сначала он, потом игра.
   * true - ролик открыт, игру начнёт он сам.
   */
  gate(then: () => void): boolean {
    const w = wallet();
    if (!w?.adDue || w.adFree || get().ad) return false;
    void shop.watchAd('forced', { then });
    return true;
  },
};

/** Тема открыта у игрока: куплена навсегда или есть билет на 1 игру. */
export function topicAccess(w: WalletResponse | undefined, topic: PremiumTopic): 'owned' | 'pass' | 'locked' {
  if (!w) return 'locked';
  if (w.owned.topic.includes(topic)) return 'owned';
  if (w.passes.includes(topic)) return 'pass';
  return 'locked';
}

setAdGate(shop.gate);
