/**
 * Обновление 2.0: друзья и приглашения. Ссылка-приглашение - startapp=r_<id>:
 * пришедший по ней становится другом, а за его первую партию монеты получают оба.
 * Вызов другу - обычная дуэль по ссылке, только друг получает сообщение от бота и баннер в приложении.
 */
import { create } from 'zustand';
import { shareMessage, shareURL } from '@tma.js/sdk-react';
import type { TFunction } from 'i18next';
import type { ConfigResponse, FriendInviteEvent, MeResponse, PlayerBrief } from '@quiz-duel/shared';
import { api, ApiRequestError, queryKeys } from './api';
import { queryClient } from './queryClient';
import { gameActions, setFriendHooks, showToast, useGame } from './game';
import { haptic } from './telegram';
import { track } from './track';

export function inviteLink(appUrl: string, userId: number) {
  return `${appUrl}?startapp=r_${userId}`;
}

interface FriendsStore {
  /** Входящий вызов на дуэль (баннер). */
  invite: FriendInviteEvent | null;
  /** Кому отправляем вызов: шторка категорий с его именем. */
  target: PlayerBrief | null;
  /** Заявки, ушедшие с этого экрана (до обновления списка). */
  sent: Record<number, boolean>;
}

export const useFriends = create<FriendsStore>(() => ({ invite: null, target: null, sent: {} }));
const set = useFriends.setState;
const get = useFriends.getState;

const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.friends });

function linkOf() {
  const config = queryClient.getQueryData<ConfigResponse>(['config']);
  const me = queryClient.getQueryData<MeResponse>(['me']);
  return config && me ? inviteLink(config.appUrl, me.id) : null;
}

export const friendsActions = {
  /** «Пригласить»: системное «Поделиться» Telegram со ссылкой-приглашением; вне Telegram - копия в буфер. */
  /**
   * «Пригласить»: анимированная карточка бота с кнопкой «Играть» (shareMessage - выбор чата
   * в Telegram). Без бота, вне Telegram или при сбое - ссылка с текстом, в крайнем случае копия.
   */
  async shareInvite(t: TFunction) {
    track('invite');
    try {
      const res = await api.friendInviteMessage();
      if (res.preparedMessageId && shareMessage.isAvailable()) {
        try {
          await shareMessage(res.preparedMessageId);
          showToast('success', 'toast.inviteShared');
        } catch {
          // Закрыл окно выбора чата - не ошибка.
        }
        return;
      }
    } catch {
      // ниже - ссылкой
    }
    const link = linkOf();
    if (!link) return showToast('error', 'toast.connection');
    try {
      if (shareURL.isAvailable()) {
        shareURL(link, t('s25.shareText'));
        return;
      }
    } catch {
      // ниже - копия в буфер
    }
    await friendsActions.copyInvite();
  },

  async copyInvite() {
    const link = linkOf();
    if (!link) return showToast('error', 'toast.connection');
    try {
      await navigator.clipboard.writeText(link);
      showToast('success', 'toast.refCopied');
    } catch {
      showToast('error', 'toast.error');
    }
  },

  /** «В друзья» недавнему сопернику. */
  async request(player: PlayerBrief) {
    set({ sent: { ...get().sent, [player.id]: true } });
    try {
      const res = await api.friendRequest(player.id);
      haptic.select();
      showToast('success', res.result === 'accepted' ? 'toast.friendAdded' : 'toast.requestSent', { name: player.name });
    } catch (error) {
      const { [player.id]: _, ...rest } = get().sent;
      set({ sent: rest });
      showToast('error', error instanceof ApiRequestError && error.status === 403 ? 'toast.friendNotPlayed' : 'toast.connection');
    }
    refresh();
  },

  async respond(player: PlayerBrief, accept: boolean) {
    try {
      await api.friendRespond(player.id, accept);
      if (accept) {
        haptic.success();
        showToast('success', 'toast.friendAdded', { name: player.name });
      }
    } catch {
      showToast('error', 'toast.connection');
    }
    refresh();
  },

  /** «Вызвать»: шторка категорий с именем друга, по «Отправить вызов» - дуэль и уведомление ему. */
  challenge(player: PlayerBrief, docsAccepted: boolean) {
    track('challenge');
    // Друг уже вызвал меня - встречный вызов не шлём, показываем его вызов.
    const inv = get().invite;
    if (inv && inv.from.id === player.id) {
      showToast('info', 'toast.alreadyChallenged', { name: player.name });
      return;
    }
    set({ target: player });
    gameActions.openCreate(docsAccepted);
  },

  clearTarget() {
    set({ target: null });
  },

  /** Вызов пришёл (сокет): баннер, если игрок не в партии. */
  incoming(event: FriendInviteEvent) {
    const g = useGame.getState().game;
    if (g && !['finished', 'cancelled', 'expired'].includes(g.phase)) return;
    haptic.select();
    set({ invite: event });
  },

  async acceptInvite() {
    const inv = get().invite;
    set({ invite: null });
    if (inv) await gameActions.join(inv.gameId);
  },

  dismissInvite() {
    set({ invite: null });
  },

  /** Заявка в друзья или её принятие (сокет). */
  changed(kind: 'request' | 'accepted', from: PlayerBrief) {
    refresh();
    showToast('info', kind === 'request' ? 'toast.friendRequest' : 'toast.friendAdded', { name: from.name });
  },
};

setFriendHooks({
  invite: friendsActions.incoming,
  changed: friendsActions.changed,
  challenged: (c) => {
    const from = get().target;
    set({ target: null });
    if (!from) return showToast('info', 'toast.alreadyChallenged', { name: '' });
    showToast('info', 'toast.alreadyChallenged', { name: from.name });
    haptic.select();
    set({ invite: { gameId: c.gameId, from, category: c.category, rules: c.rules, expiresAt: c.expiresAt } });
  },
});
