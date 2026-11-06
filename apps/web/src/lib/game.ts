/**
 * Состояние партии на клиенте. Источник правды - сервер: экран рисуется только
 * из последнего снимка game:state, а действия уходят событиями с подтверждением (ack).
 * После любого переподключения клиент запрашивает свежий снимок.
 */
import { create } from 'zustand';
import { copyTextToClipboard, openLink, shareMessage, shareURL } from '@tma.js/sdk-react';
import {
  ACTIVE_PHASES,
  FINAL_PHASES,
  measureClockOffset,
  TIMINGS,
  type ClientToServerEvents,
  type GameCategory,
  type GameErrorCode,
  type GameStateMeta,
  type GameView,
  type PlayerProfile,
  type Reaction,
  REACTION_COOLDOWN_MS,
} from '@quiz-duel/shared';
import { createSocket, type GameSocket } from './socket';
import { haptic, onResume } from './telegram';
import type { IconGlyph } from '../components/Icon';

export type LinkErrorKind = 'taken' | 'notFound' | 'expired' | 'cancelled' | 'finished' | 'busy';
export type ToastKind = 'success' | 'error' | 'info' | 'achievement';

export interface ToastState {
  id: number;
  kind: ToastKind;
  key: string;
  vars?: Record<string, string>;
  glyph?: IconGlyph;
}

/** Шторка с документами: по ссылке (кто зовёт и куда войти) или перед своей первой игрой. */
export interface ConsentAsk {
  inviter: (PlayerProfile & { userId: number }) | null;
  gameId: string | null;
  category: GameCategory | null;
  /** После принятия - тренировка, а не дуэль. */
  solo?: boolean;
  /** После принятия - быстрая игра. */
  quick?: boolean;
}

interface GameStore {
  /**
   * replaced - партию забрало другое устройство этого игрока («Играть здесь» вернёт её);
   * auth - сервер не принял initData (устарел после суток с открытым приложением): «Откройте заново».
   */
  conn: 'connecting' | 'online' | 'reconnecting' | 'replaced' | 'auth';
  clockOffset: number;
  game: GameView | null;
  /** Игрок ушёл на главную, а дуэль идёт: на главной плашка «Вернуться». */
  hidden: boolean;
  linkError: { kind: LinkErrorKind; busyGameId?: string } | null;
  consent: ConsentAsk | null;
  categorySheet: boolean;
  /** Для чего выбирают категорию: дуэль с другом или тренировка. */
  categoryMode: 'duel' | 'solo';
  /** Открыли по ссылке на игру, и вход ещё не решился (лобби, шторка с документами или ошибка). */
  linkEntry: boolean;
  invite: { gameId: string; link: string; preparedMessageId: string | null } | null;
  /** Действия, ответ на которые ещё не пришёл: их кнопки неактивны. */
  pending: Record<string, boolean>;
  toast: ToastState | null;
  /**
   * Мой выбор, который уже ушёл на сервер, но ещё не подтверждён снимком.
   * Нужен только для мгновенного отклика на тап; засчитывает ответ сервер.
   */
  picked: { gameId: string; index: number; position: number } | null;
  /** Открыт диалог «Выйти из партии?». */
  exitAsk: boolean;
  /** Вкладка нижнего меню, когда партии на экране нет. */
  tab: Tab;
  /** Открыт разбор партии (с итогов или из истории в профиле). */
  review: string | null;
  /** Открыта шторка профиля соперника (userId). */
  oppSheet: number | null;
  /** Открыт экран ачивок (из профиля). */
  achievements: boolean;
  /** Последняя реакция каждого игрока текущей партии (пузырь у аватарки). */
  bubbles: Record<number, { id: number; emoji: Reaction; at: number }>;
  /** До какого времени строка реакций неактивна (кулдаун 2 с). */
  reactUntil: number;
  /** Быстрая игра: идёт поиск (с какого времени по часам сервера, мой рейтинг) или «Никого не нашли». */
  search: { since: number; rating: number } | 'notFound' | null;
}

export type Tab = 'home' | 'rating' | 'profile';

export const useGame = create<GameStore>(() => ({
  conn: 'connecting',
  clockOffset: 0,
  game: null,
  hidden: false,
  linkError: null,
  consent: null,
  categorySheet: false,
  categoryMode: 'duel',
  linkEntry: false,
  invite: null,
  pending: {},
  toast: null,
  picked: null,
  exitAsk: false,
  tab: 'home',
  review: null,
  oppSheet: null,
  achievements: false,
  bubbles: {},
  reactUntil: 0,
  search: null,
}));

const set = useGame.setState;
const get = useGame.getState;

/** Время сервера по часам телефона с поправкой на их расхождение. */
export const serverNow = () => Date.now() + get().clockOffset;

let toastSeq = 0;
let bubbleSeq = 0;
export function showToast(kind: ToastKind, key: string, vars?: Record<string, string>, glyph?: IconGlyph) {
  set({ toast: { id: ++toastSeq, kind, key, vars, glyph } });
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

/** Функция SDK доступна в этом клиенте Telegram (вне Telegram проверка сама бросает ошибку). */
const can = (fn: { isAvailable: () => boolean }) => {
  try {
    return fn.isAvailable();
  } catch {
    return false;
  }
};

/** Копирование: через Telegram, а вне его (или в старом клиенте) - через браузер. */
async function copyText(text: string) {
  try {
    await copyTextToClipboard(text);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

// ---------------------------------------------------------------------------

let socket: GameSocket | null = null;
let pendingJoin: string | null = null;
let helloSeen = false;
let consentSender: (() => Promise<void>) | null = null;
/** Смещение часов уже измерено по time:sync (до этого - грубая оценка по приветствию). */
let clockMeasured = false;

type EventName = keyof ClientToServerEvents;
type PayloadOf<E extends EventName> = Parameters<ClientToServerEvents[E]>[0];
type AckOf<E extends EventName> = Extract<Parameters<ClientToServerEvents[E]>[1], (...args: never[]) => unknown>;
type ResultOf<E extends EventName> = Parameters<AckOf<E>>[0];

/** Событие с ответом. Нет связи или сервер молчит 8 с - ошибка internal, кнопка снова активна. */
async function request<E extends EventName>(
  event: E,
  payload: PayloadOf<E>,
  busyKey: string = event,
  timeoutMs = 8_000,
): Promise<ResultOf<E>> {
  const s = socket;
  if (!s) return { ok: false, error: 'internal' } as ResultOf<E>;
  set((st) => ({ pending: { ...st.pending, [busyKey]: true } }));
  try {
    // Типы Socket.IO не выводят ack для обобщённого имени события, поэтому приводим вручную.
    const timed = s.timeout(timeoutMs) as unknown as { emitWithAck: (e: string, p: unknown) => Promise<unknown> };
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
  if (cur && cur.id !== view.id) {
    // Реванш принят: с итогов сразу в отсчёт новой партии той же пары.
    if (isFinal(cur) && view.rematchOf === cur.id && !isFinal(view)) {
      if (cur.rematch?.byMe) showToast('success', 'toast.rmAccepted');
      set({ game: view, hidden: false, review: null, oppSheet: null, picked: null, exitAsk: false });
    }
    return;
  }
  if (!cur && isFinal(view)) return;
  if (!cur && get().search) set({ search: null });
  // Пометка «реванш принят» пришла раньше самой партии (обрыв) - забираем её сами.
  if (view.rematch?.status === 'accepted' && view.rematch.nextGameId && cur?.rematch?.status !== 'accepted') {
    void fetchRematch(view.rematch.nextGameId, view.id);
  }

  if (cur && meta?.seatFreed && !view.opponent && cur.opponent) {
    if (meta.seatFreed === 'timeout') showToast('info', 'toast.slotFreed');
    else showToast('info', 'toast.oppLeft', { opp: cur.opponent.name });
  }
  // Игрок на главной, а партия отменилась (никто не ответил): плашке «Вернуться» вести некуда.
  if (cur && get().hidden && (view.phase === 'cancelled' || view.phase === 'expired')) {
    set({ game: null, hidden: false });
    return;
  }
  // Партия закончилась (или ещё не началась) - диалог выхода больше не нужен.
  const exitAsk = get().exitAsk && ACTIVE_PHASES.includes(view.phase);
  set({ game: view, exitAsk });
}

/** Новая партия реванша по её id (если её снимок не дошёл сам). */
async function fetchRematch(nextId: string, fromId: string) {
  const res = await request('game:sync', { gameId: nextId });
  const cur = get().game;
  if (res.ok && res.game && cur?.id === fromId) applyView(res.game);
}

/** Часы сервера: 3 замера time:sync, берётся самый быстрый. Сбитые часы телефона не мешают таймеру. */
async function syncClock(timeoutMs = 5_000): Promise<boolean> {
  const s = socket;
  if (!s?.connected) return false;
  try {
    const { offset } = await measureClockOffset(s, { timeoutMs });
    clockMeasured = true;
    set({ clockOffset: offset });
    return true;
  } catch {
    return false;
  }
}

/**
 * Мой выбор после переподключения. Если сервер его не получил (ушёл в момент обрыва),
 * а вопрос ещё идёт - отправляем ещё раз: ответ идемпотентен, второй раз не засчитают.
 * Если вопрос уже закрыт - подсветка больше не нужна.
 */
function reconcilePick(view: GameView) {
  const p = get().picked;
  if (!p || p.gameId !== view.id) return;
  if (view.phase !== 'question' || view.question?.index !== p.index) return set({ picked: null });
  if (view.myAnswer || get().pending.answer || get().conn !== 'online') return;
  if (serverNow() > view.question.endsAt + TIMINGS.answerGraceMs) return set({ picked: null });
  void sendAnswer(view.id, p.index, p.position);
}

async function sendAnswer(gameId: string, index: number, position: number) {
  const res = await request('game:answer', { gameId, questionIndex: index, optionIndex: position }, 'answer');
  if (res.ok) {
    applyView(res.game);
    return;
  }
  if (res.error !== 'internal' && res.error !== 'rate_limited') {
    // Сервер отказал явно (опоздал, вопрос уже закрыт) - выбор не засчитан, подсветку снимаем.
    const now = get().picked;
    if (now && now.gameId === gameId && now.index === index) set({ picked: null });
  }
  // Нет ответа сервера - неизвестно, дошёл ли выбор: свежий снимок решит, нужно ли отправить ещё раз.
  void gameActions.resync(gameId);
}

/**
 * Вернулись из фона. Сокет может «думать», что жив, хотя телефон давно потерял
 * соединение (iOS и Android усыпляют свёрнутые приложения): короткий time:sync
 * проверяет связь и заодно уточняет часы. Не ответил за 3 с - переподключаемся сразу,
 * не дожидаясь пинга. После этого - свежий снимок партии.
 */
async function wake() {
  const s = socket;
  const conn = get().conn;
  if (!s || conn === 'replaced' || conn === 'auth' || conn === 'connecting') return;
  if (!s.connected) {
    if (!s.active) s.connect();
    return;
  }
  if (!(await syncClock(3_000))) {
    if (!s.connected || get().conn === 'replaced') return;
    set({ conn: 'reconnecting' });
    s.disconnect().connect();
    return;
  }
  const cur = get().game;
  if (cur && (!isFinal(cur) || cur.phase === 'finished')) await gameActions.resync(cur.id);
}

/** Реванш не вышел: соперник ушёл, предложение уже закрыто, нет связи - экран обновит свежий снимок. */
function rematchFailed(error: GameErrorCode, gameId: string) {
  if (error === 'opponent_left') showToast('info', 'toast.rmGone');
  else if (error === 'internal' || error === 'rate_limited') showToast('error', 'toast.connection');
  void gameActions.resync(gameId);
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

    socket.on('session:hello', ({ currentGameId, resultsGameId, serverNow: helloNow }) => {
      // Грубая поправка сразу (точность - задержка сети), точная - тремя замерами ниже.
      if (!clockMeasured) set({ clockOffset: helloNow - Date.now() });
      set({ conn: 'online' });
      void syncClock();

      const first = !helloSeen;
      helloSeen = true;
      const cur = get().game;
      if (first && pendingJoin) {
        const id = pendingJoin;
        pendingJoin = null;
        void gameActions.join(id);
      } else if (cur && (!isFinal(cur) || cur.phase === 'finished')) {
        // Итоги тоже: за время обрыва соперник мог предложить реванш или уйти.
        void gameActions.resync(cur.id);
      } else if (currentGameId) {
        void gameActions.resync(currentGameId);
      } else if (!first && typeof get().search === 'object' && get().search) {
        // Переподключились во время поиска: сервер вычеркнул нас из очереди - встаём снова.
        void gameActions.quickJoin(true);
      } else if (first && resultsGameId) {
        // Закрыли приложение посреди дуэли, а она закончилась без нас: сразу итоги, а не главная.
        void gameActions.resync(resultsGameId);
      }
    });
    socket.on('game:state', (view, meta) => applyView(view, meta));
    socket.on('queue:matched', ({ gameId }) => {
      set({ search: null });
      haptic.success();
      void gameActions.resync(gameId);
    });
    socket.on('queue:timeout', () => {
      if (get().search) set({ search: 'notFound' });
    });
    socket.on('game:reaction', ({ gameId, userId, emoji }) => {
      if (get().game?.id !== gameId) return;
      set((st) => ({ bubbles: { ...st.bubbles, [userId]: { id: ++bubbleSeq, emoji, at: Date.now() } } }));
    });
    socket.on('session:replaced', () => set({ conn: 'replaced' }));
    socket.on('disconnect', () => {
      if (get().conn !== 'replaced') set({ conn: 'reconnecting' });
    });
    socket.on('connect_error', (error: Error & { data?: { error?: string } }) => {
      if (get().conn === 'replaced') return;
      // Подпись initData не прошла (или устарела): повтор не поможет, нужен новый вход из бота.
      const code = error.data?.error;
      if (code === 'invalid_init_data' || code === 'unauthorized') {
        socket?.disconnect();
        set({ conn: 'auth' });
        return;
      }
      set({ conn: helloSeen ? 'reconnecting' : 'connecting' });
    });
    onResume(() => void wake());
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
      if (res.game) {
        const cur = get().game;
        // Пока ждали ответа, могли перейти в реванш - старый снимок его не перебивает.
        if (cur && cur.id !== res.game.id && !(isFinal(cur) && res.game.rematchOf === cur.id)) return;
        if (cur && cur.id === res.game.id && res.game.rev < cur.rev) return;
        set({ game: res.game });
        reconcilePick(res.game);
        if (res.game.rematch?.status === 'accepted' && res.game.rematch.nextGameId) void fetchRematch(res.game.rematch.nextGameId, res.game.id);
      }
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

  /** «Поделиться результатом»: карточка бота через shareMessage, иначе - «Поделиться ссылкой» с текстом. */
  async shareResult(fallbackText: string) {
    const g = get().game;
    if (!g || g.phase !== 'finished') return;
    const res = await request('game:share', { gameId: g.id }, 'share');
    if (!res.ok) return showToast('error', 'toast.connection');
    if (res.preparedMessageId && can(shareMessage)) {
      try {
        await shareMessage(res.preparedMessageId);
        showToast('success', 'toast.shared');
      } catch {
        // Закрыл окно выбора чата - не ошибка.
      }
      return;
    }
    try {
      if (!can(shareURL)) throw new Error('shareURL unavailable');
      shareURL(res.link, fallbackText);
    } catch {
      try {
        await copyText(`${fallbackText}\n${res.link}`);
        showToast('success', 'toast.copiedResult');
      } catch {
        showToast('error', 'toast.error');
      }
    }
  },

  /** «Пригласить»: карточка бота через shareMessage, иначе - стандартное «Поделиться ссылкой». */
  async shareInvite(shareText: string) {
    const g = get().game;
    if (!g) return;
    const invite = get().invite?.gameId === g.id ? get().invite : await gameActions.prefetchInvite(g.id);
    if (!invite) return showToast('error', 'toast.error');
    if (invite.preparedMessageId && can(shareMessage)) {
      try {
        await shareMessage(invite.preparedMessageId);
        showToast('success', 'toast.invited');
      } catch {
        // Игрок закрыл окно выбора чата - это не ошибка.
      }
      return;
    }
    try {
      if (!can(shareURL)) throw new Error('shareURL unavailable');
      shareURL(invite.link, shareText);
    } catch {
      await gameActions.copyLink();
    }
  },

  async copyLink() {
    const g = get().game;
    const invite = g && (get().invite?.gameId === g.id ? get().invite : await gameActions.prefetchInvite(g.id));
    if (!invite) return showToast('error', 'toast.error');
    try {
      await copyText(invite.link);
      showToast('success', 'toast.copied');
    } catch {
      showToast('error', 'toast.error');
    }
  },

  /** Ушёл на главную: из идущей дуэли - с плашкой «Вернуться», из завершённой - насовсем. */
  goHome() {
    const g = get().game;
    if (g && !isFinal(g)) set({ hidden: true, linkError: null, tab: 'home' });
    else {
      // С итогов: сервер отмечает, что игрок ушёл, - реванш ему больше не предложат.
      if (g?.phase === 'finished') void request('game:leave', { gameId: g.id });
      set({ game: null, hidden: false, linkError: null, review: null, oppSheet: null, tab: 'home' });
    }
  },

  setTab(tab: Tab) {
    set({ tab, review: null, achievements: false });
    window.scrollTo(0, 0);
  },

  openReview(gameId: string) {
    set({ review: gameId, oppSheet: null });
  },

  closeReview() {
    set({ review: null });
  },

  openOpp(userId: number) {
    set({ oppSheet: userId });
  },

  closeOpp() {
    set({ oppSheet: null });
  },

  openAchievements() {
    set({ achievements: true });
    window.scrollTo(0, 0);
  },

  closeAchievements() {
    set({ achievements: false });
  },

  // -------------------------------------------------------------------------
  // Реванш

  /** «Реванш». Если соперник уже предложил - это согласие, новая партия придёт отдельным снимком. */
  async rematchOffer() {
    const g = get().game;
    if (!g || g.phase !== 'finished') return;
    const res = await request('rematch:offer', { gameId: g.id }, 'rematch');
    if (res.ok) applyView(res.game);
    else rematchFailed(res.error, g.id);
  },

  async rematchRespond(accept: boolean) {
    const g = get().game;
    if (!g || g.phase !== 'finished') return;
    const res = await request('rematch:respond', { gameId: g.id, accept }, 'rematch');
    if (res.ok) applyView(res.game);
    else rematchFailed(res.error, g.id);
  },

  async rematchCancel() {
    const g = get().game;
    if (!g || g.phase !== 'finished') return;
    const res = await request('rematch:cancel', { gameId: g.id }, 'rematch');
    if (res.ok) applyView(res.game);
    else rematchFailed(res.error, g.id);
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
    else set({ categorySheet: true, categoryMode: 'duel' });
  },

  /** «Тренировка»: та же шторка категорий, но кнопка «Начать тренировку». */
  openSolo(docsAccepted: boolean) {
    if (!docsAccepted) set({ consent: { inviter: null, gameId: null, category: null, solo: true } });
    else set({ categorySheet: true, categoryMode: 'solo' });
  },

  /** «Быстрая игра»: встать в очередь (экран 7). Соперник найден - придёт снимок лобби. */
  async quickJoin(docsAccepted: boolean) {
    if (!docsAccepted) return set({ consent: { inviter: null, gameId: null, category: null, quick: true } });
    const res = await request('queue:join', {}, 'queue');
    if (res.ok) {
      if (!get().game || isFinal(get().game!)) set({ search: { since: res.since, rating: res.rating }, game: null, hidden: false, review: null });
      return;
    }
    if (res.error === 'consent_required') set({ consent: { inviter: null, gameId: null, category: null, quick: true } });
    else if (res.error === 'busy') set({ linkError: { kind: 'busy', busyGameId: res.busyGameId }, search: null });
    else showToast('error', 'toast.connection');
  },

  /** «Отмена» поиска (и «На главную» с «Никого не нашли»). */
  quickLeave() {
    const was = get().search;
    set({ search: null });
    if (was && was !== 'notFound') void request('queue:leave', {}, 'queue');
  },

  /** Тренировка в категории: сразу первый вопрос (сервер - тот же движок, без соперника и рейтинга). */
  async startSolo(category: GameCategory) {
    const res = await request('solo:start', { category });
    if (res.ok) {
      set({ game: res.game, hidden: false, linkError: null, categorySheet: false, review: null, picked: null, exitAsk: false });
      return;
    }
    if (res.error === 'consent_required') set({ consent: { inviter: null, gameId: null, category, solo: true }, categorySheet: false });
    else if (res.error === 'busy') set({ linkError: { kind: 'busy', busyGameId: res.busyGameId }, categorySheet: false });
    else showToast('error', 'toast.connection');
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
    if (ask.quick) await gameActions.quickJoin(true);
    else if (ask.gameId) await gameActions.join(ask.gameId);
    else if (ask.category) await (ask.solo ? gameActions.startSolo(ask.category) : gameActions.create(ask.category));
    else set({ categorySheet: true, categoryMode: ask.solo ? 'solo' : 'duel' });
  },

  declineConsent() {
    if (!get().consent) return;
    set({ consent: null });
    showToast('info', 'consent.declined');
  },

  // -------------------------------------------------------------------------
  // Партия

  /**
   * Тап по варианту. Выбор сразу подсвечивается, но засчитывает его только сервер
   * (время и очки - по его часам). Отказ (опоздал, вопрос уже закрыт) - подсветка
   * снимается. Нет ответа (обрыв связи) - после переподключения выбор уходит ещё раз
   * (reconcilePick), сервер примет только первый.
   */
  async answer(position: number) {
    const g = get().game;
    const q = g?.question;
    if (!g || !q || g.phase !== 'question' || g.myAnswer || get().conn !== 'online' || get().exitAsk) return;
    const picked = get().picked;
    if (picked && picked.gameId === g.id && picked.index === q.index) return;
    set({ picked: { gameId: g.id, index: q.index, position } });
    haptic.select();
    await sendAnswer(g.id, q.index, position);
  },

  /** Реакция сопернику. Кнопки сразу гаснут на 2 с; если сервер отказал - снова активны. */
  async react(emoji: Reaction) {
    const g = get().game;
    if (!g || get().reactUntil > Date.now()) return;
    set({ reactUntil: Date.now() + REACTION_COOLDOWN_MS });
    haptic.select();
    const res = await request('game:react', { gameId: g.id, emoji }, 'react');
    if (!res.ok && res.error !== 'rate_limited') set({ reactUntil: 0 });
  },

  openExit() {
    const g = get().game;
    if (g && ACTIVE_PHASES.includes(g.phase)) set({ exitAsk: true });
  },

  closeExit() {
    set({ exitAsk: false });
  },

  /** «Выйти» в диалоге: сдача, сопернику сразу техническая победа. */
  async forfeit() {
    const g = get().game;
    if (!g) return;
    const res = await request('game:forfeit', { gameId: g.id });
    set({ exitAsk: false });
    // Из тренировки - сразу на главную, без сохранения попытки.
    if (res.ok && g.mode === 'solo') set({ game: null, hidden: false, tab: 'home' });
    else if (res.ok) applyView(res.game);
    else if (res.error === 'wrong_phase') void gameActions.resync(g.id);
    else showToast('error', 'toast.connection');
  },

  /** Документы в Telegraph: Telegram открывает их через Instant View, не выходя из приложения. */
  openDoc(url: string) {
    if (can(openLink)) openLink(url, { tryInstantView: true });
    else window.open(url, '_blank', 'noopener');
  },
};

