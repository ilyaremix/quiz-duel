/**
 * Состояние партии на клиенте. Источник правды - сервер: экран рисуется только
 * из последнего снимка game:state, а действия уходят событиями с подтверждением (ack).
 * После любого переподключения клиент запрашивает свежий снимок.
 */
import { create } from 'zustand';
import { copyTextToClipboard, openLink, shareMessage, shareURL } from '@tma.js/sdk-react';
import {
  FINAL_PHASES,
  type ClientToServerEvents,
  type GameCategory,
  type GameErrorCode,
  type GameStateMeta,
  type GameView,
  type PlayerProfile,
} from '@quiz-duel/shared';
import { createSocket, measureClockOffset, type GameSocket } from './socket';

export type LinkErrorKind = 'taken' | 'notFound' | 'expired' | 'cancelled' | 'finished' | 'busy';
export type ToastKind = 'success' | 'error' | 'info';

export interface ToastState {
  id: number;
  kind: ToastKind;
  key: string;
  vars?: Record<string, string>;
}

/** Шторка с документами: по ссылке (кто зовёт и куда войти) или перед своей первой игрой. */
export interface ConsentAsk {
  inviter: (PlayerProfile & { userId: number }) | null;
  gameId: string | null;
  category: GameCategory | null;
}

interface GameStore {
  conn: 'connecting' | 'online' | 'reconnecting' | 'replaced';
  clockOffset: number;
  game: GameView | null;
  /** Игрок ушёл на главную, а дуэль идёт: на главной плашка «Вернуться». */
  hidden: boolean;
  linkError: { kind: LinkErrorKind; busyGameId?: string } | null;
  consent: ConsentAsk | null;
  categorySheet: boolean;
  /** Открыли по ссылке на игру, и вход ещё не решился (лобби, шторка с документами или ошибка). */
  linkEntry: boolean;
  invite: { gameId: string; link: string; preparedMessageId: string | null } | null;
  /** Действия, ответ на которые ещё не пришёл: их кнопки неактивны. */
  pending: Record<string, boolean>;
  toast: ToastState | null;
}

export const useGame = create<GameStore>(() => ({
  conn: 'connecting',
  clockOffset: 0,
  game: null,
  hidden: false,
  linkError: null,
  consent: null,
  categorySheet: false,
  linkEntry: false,
  invite: null,
  pending: {},
  toast: null,
}));

const set = useGame.setState;
const get = useGame.getState;

/** Время сервера по часам телефона с поправкой на их расхождение. */
export const serverNow = () => Date.now() + get().clockOffset;

let toastSeq = 0;
export function showToast(kind: ToastKind, key: string, vars?: Record<string, string>) {
  set({ toast: { id: ++toastSeq, kind, key, vars } });
}

const LINK_ERRORS: Partial<Record<GameErrorCode, LinkErrorKind>> = {
  taken: 'taken',
  not_found: 'notFound',
  expired: 'expired',
  cancelled: 'cancelled',
  finished: 'finished',
  busy: 'busy',
};

const isFinal = (view: GameView) => FINAL_PHASES.includes(view.phase);

// ---------------------------------------------------------------------------

let socket: GameSocket | null = null;
let pendingJoin: string | null = null;
let helloSeen = false;
let consentSender: (() => Promise<void>) | null = null;

type EventName = keyof ClientToServerEvents;
type PayloadOf<E extends EventName> = Parameters<ClientToServerEvents[E]>[0];
type AckOf<E extends EventName> = Extract<Parameters<ClientToServerEvents[E]>[1], (...args: never[]) => unknown>;
type ResultOf<E extends EventName> = Parameters<AckOf<E>>[0];

/** Событие с ответом. Нет связи или сервер молчит 8 с - ошибка internal, кнопка снова активна. */
async function request<E extends EventName>(event: E, payload: PayloadOf<E>, busyKey: string = event): Promise<ResultOf<E>> {
  const s = socket;
  if (!s) return { ok: false, error: 'internal' } as ResultOf<E>;
  set((st) => ({ pending: { ...st.pending, [busyKey]: true } }));
  try {
    // Типы Socket.IO не выводят ack для обобщённого имени события, поэтому приводим вручную.
    const timed = s.timeout(8_000) as unknown as { emitWithAck: (e: string, p: unknown) => Promise<unknown> };
    return (await timed.emitWithAck(event, payload)) as ResultOf<E>;
  } catch {
    return { ok: false, error: 'internal' } as ResultOf<E>;
  } finally {
    set((st) => ({ pending: { ...st.pending, [busyKey]: false } }));
  }
}

/** Снимок с сервера. Устаревший (меньший rev) и чужой неактуальный игнорируются. */
function applyView(view: GameView, meta?: GameStateMeta) {
  const cur = get().game;
  if (cur && cur.id === view.id && view.rev < cur.rev) return;
  if (cur && cur.id !== view.id) return;
  if (!cur && isFinal(view)) return;

  if (cur && meta?.seatFreed && !view.opponent && cur.opponent) {
    if (meta.seatFreed === 'timeout') showToast('info', 'toast.slotFreed');
    else showToast('info', 'toast.oppLeft', { opp: cur.opponent.name });
  }
  set({ game: view });
}

function failure(result: { ok: false; error: GameErrorCode; busyGameId?: string }) {
  const kind = LINK_ERRORS[result.error];
  if (kind) set({ linkError: { kind, busyGameId: result.busyGameId } });
  else showToast('error', 'toast.connection');
}

export const gameActions = {
  /** Запуск: один сокет на всё время жизни приложения. */
  start(initDataRaw: string, startGameId: string | null, sendConsent: () => Promise<void>) {
    if (socket) return;
    consentSender = sendConsent;
    pendingJoin = startGameId;
    set({ linkEntry: Boolean(startGameId) });
    socket = createSocket(initDataRaw);

    socket.on('session:hello', ({ currentGameId }) => {
      set({ conn: 'online' });
      measureClockOffset(socket!)
        .then((clockOffset) => set({ clockOffset }))
        .catch(() => undefined);

      const first = !helloSeen;
      helloSeen = true;
      const cur = get().game;
      if (first && pendingJoin) {
        const id = pendingJoin;
        pendingJoin = null;
        void gameActions.join(id);
      } else if (cur && !isFinal(cur)) {
        void gameActions.resync(cur.id);
      } else if (currentGameId) {
        void gameActions.resync(currentGameId);
      }
    });
    socket.on('game:state', (view, meta) => applyView(view, meta));
    socket.on('session:replaced', () => set({ conn: 'replaced' }));
    socket.on('disconnect', () => {
      if (get().conn !== 'replaced') set({ conn: 'reconnecting' });
    });
    socket.on('connect_error', () => {
      if (get().conn !== 'replaced') set({ conn: helloSeen ? 'reconnecting' : 'connecting' });
    });
  },

  /** «Играть здесь» после session:replaced. */
  takeOver() {
    set({ conn: 'connecting' });
    socket?.connect();
  },

  /** Свежий снимок партии; если место за время отсутствия освободилось - пробуем войти снова. */
  async resync(gameId: string) {
    const res = await request('game:sync', { gameId });
    if (res.ok) {
      if (res.game) set({ game: res.game });
      return;
    }
    if (res.error === 'not_participant') {
      set({ game: null });
      await gameActions.join(gameId);
    } else if (res.error === 'not_found') set({ game: null });
  },

  async create(category: GameCategory) {
    const res = await request('game:create', { category });
    if (res.ok) {
      set({ game: res.game, hidden: false, linkError: null, categorySheet: false, invite: null });
      void gameActions.prefetchInvite(res.game.id);
      return;
    }
    if (res.error === 'consent_required') set({ consent: { inviter: null, gameId: null, category }, categorySheet: false });
    else if (res.error === 'rate_limited') showToast('error', 'toast.connection');
    else failure(res);
  },

  async join(gameId: string) {
    const res = await request('game:join', { gameId });
    set({ linkEntry: false });
    if (res.ok) {
      set({ game: res.game, hidden: false, linkError: null });
      return;
    }
    if (res.error === 'consent_required') set({ consent: { inviter: res.inviter ?? null, gameId, category: null } });
    else failure(res);
  },

  async ready(ready: boolean) {
    const g = get().game;
    if (!g) return;
    const res = await request('game:ready', { gameId: g.id, ready }, 'ready');
    if (res.ok) applyView(res.game);
    else showToast('error', 'toast.connection');
  },

  /** «Отменить игру» создателем: на главную и тост. */
  async cancel() {
    const g = get().game;
    if (!g) return;
    const res = await request('game:cancel', { gameId: g.id });
    if (res.ok || res.error === 'wrong_phase') {
      set({ game: null, invite: null });
      showToast('info', 'toast.cancelled');
    } else showToast('error', 'toast.connection');
  },

  /** «Выйти из лобби»: соперник освобождает место, создатель отменяет игру. */
  async leave() {
    const g = get().game;
    if (!g) return;
    const res = await request('game:leave', { gameId: g.id });
    if (res.ok || res.error === 'wrong_phase' || res.error === 'not_participant') {
      const wasCreator = g.creatorId === g.me.userId;
      set({ game: null, invite: null });
      if (wasCreator) showToast('info', 'toast.cancelled');
    } else showToast('error', 'toast.connection');
  },

  async prefetchInvite(gameId: string) {
    const known = get().invite;
    if (known?.gameId === gameId && known.preparedMessageId) return known;
    const res = await request('game:invite', { gameId }, 'invite');
    if (!res.ok) return null;
    const invite = { gameId, link: res.link, preparedMessageId: res.preparedMessageId };
    set({ invite });
    return invite;
  },

  /** «Пригласить»: карточка бота через shareMessage, иначе - стандартное «Поделиться ссылкой». */
  async shareInvite(shareText: string) {
    const g = get().game;
    if (!g) return;
    const invite = get().invite?.gameId === g.id ? get().invite : await gameActions.prefetchInvite(g.id);
    if (!invite) return showToast('error', 'toast.error');
    if (invite.preparedMessageId && shareMessage.isAvailable()) {
      try {
        await shareMessage(invite.preparedMessageId);
        showToast('success', 'toast.invited');
      } catch {
        // Игрок закрыл окно выбора чата - это не ошибка.
      }
      return;
    }
    if (shareURL.isAvailable()) shareURL(invite.link, shareText);
    else await gameActions.copyLink();
  },

  async copyLink() {
    const g = get().game;
    const invite = g && (get().invite?.gameId === g.id ? get().invite : await gameActions.prefetchInvite(g.id));
    if (!invite) return showToast('error', 'toast.error');
    try {
      await copyTextToClipboard(invite.link);
      showToast('success', 'toast.copied');
    } catch {
      showToast('error', 'toast.error');
    }
  },

  /** Ушёл на главную: из идущей дуэли - с плашкой «Вернуться», из завершённой - насовсем. */
  goHome() {
    const g = get().game;
    if (g && !isFinal(g)) set({ hidden: true, linkError: null });
    else set({ game: null, hidden: false, linkError: null });
  },

  returnToGame() {
    set({ hidden: false });
  },

  /** «Создать свою» на экране ошибки ссылки. */
  createOwn(docsAccepted: boolean) {
    set({ linkError: null, game: null, hidden: false });
    gameActions.openCreate(docsAccepted);
  },

  /** «Вернуться в партию» на экране busy. */
  async backToBusy() {
    const id = get().linkError?.busyGameId;
    set({ linkError: null });
    if (id) await gameActions.resync(id);
  },

  /** «Создать дуэль»: без принятых документов сначала шторка с галочками. */
  openCreate(docsAccepted: boolean) {
    if (!docsAccepted) set({ consent: { inviter: null, gameId: null, category: null } });
    else set({ categorySheet: true });
  },

  closeCategory() {
    set({ categorySheet: false });
  },

  /** Отправляет принятие обоих документов (онбординг и шторка). */
  async acceptDocs(): Promise<boolean> {
    if (!consentSender) return false;
    set((st) => ({ pending: { ...st.pending, consent: true } }));
    try {
      await consentSender();
      return true;
    } catch {
      showToast('error', 'toast.connection');
      return false;
    } finally {
      set((st) => ({ pending: { ...st.pending, consent: false } }));
    }
  },

  async acceptConsent() {
    const ask = get().consent;
    if (!ask || !(await gameActions.acceptDocs())) return;
    set({ consent: null });
    if (ask.gameId) await gameActions.join(ask.gameId);
    else if (ask.category) await gameActions.create(ask.category);
    else set({ categorySheet: true });
  },

  declineConsent() {
    if (!get().consent) return;
    set({ consent: null });
    showToast('info', 'consent.declined');
  },

  /** Документы в Telegraph: Telegram открывает их через Instant View, не выходя из приложения. */
  openDoc(url: string) {
    if (openLink.isAvailable()) openLink(url, { tryInstantView: true });
    else window.open(url, '_blank', 'noopener');
  },
};

