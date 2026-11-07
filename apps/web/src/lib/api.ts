// Тела запросов - типы из shared (… satisfies BuyRequest): поменяли контракт - клиент не соберётся.
import {
  AUTH_SCHEME,
  type AdDoneResponse,
  type AdminLinkRequest,
  type AdStartRequest,
  type BuyRequest,
  type EquipRequest,
  type FriendIdRequest,
  type FriendRespondRequest,
  type InvoiceRequest,
  type FriendInviteMessageResponse,
  type AdPurpose,
  type AdStartResponse,
  type AdminEvents,
  type AdminMoney,
  type AdminOverview,
  type AdminPeriod,
  type AdminPlayer,
  type AdminPlayerRow,
  type AdminRetention,
  type AdminSources,
  type AdminTask,
  type AdminTaskSaveRequest,
  type TaskConfigView,
  type ClaimResponse,
  type FriendsResponse,
  type PremiumTopic,
  type ShopKind,
  type StarsProduct,
  type WalletResponse,
  type AchievementsResponse,
  type ApiError,
  type ConfigResponse,
  type ConsentRequest,
  type ConsentResponse,
  type LeaderboardResponse,
  type MeResponse,
  type PlayerResponse,
  type ProfileResponse,
  type ReviewResponse,
  type SettingsRequest,
  type SettingsResponse,
} from '@quiz-duel/shared';
import { setTrackAuth } from './track';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(`API ${status}: ${body?.error ?? 'network'}`);
    this.name = 'ApiRequestError';
  }

  /** initData отклонён - нужно открыть приложение заново. */
  get isAuth() {
    return this.status === 401;
  }

  /** Причина отказа магазина (no_coins, already_claimed...). */
  get reason() {
    return this.body?.reason ?? null;
  }
}

const TIMEOUT_MS = 10_000;

async function request<T>(path: string, initDataRaw?: string, body?: unknown): Promise<T> {
  let response: Response;
  const headers: Record<string, string> = initDataRaw ? { Authorization: `${AUTH_SCHEME} ${initDataRaw}` } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiRequestError(0, null);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(response.status, body);
  }
  return (await response.json()) as T;
}

/** initData текущей сессии: экраны после партии запрашивают данные без пробрасывания его через пропсы. */
let sessionAuth = '';
export function setSessionAuth(initDataRaw: string) {
  sessionAuth = initDataRaw;
  setTrackAuth(initDataRaw);
}

export const api = {
  config: () => request<ConfigResponse>('/api/config'),
  me: (initDataRaw: string) => request<MeResponse>('/api/me', initDataRaw),
  consents: (initDataRaw: string, body: ConsentRequest) => request<ConsentResponse>('/api/consents', initDataRaw, body),
  profile: () => request<ProfileResponse>('/api/profile', sessionAuth),
  leaderboard: () => request<LeaderboardResponse>('/api/leaderboard', sessionAuth),
  player: (id: number) => request<PlayerResponse>(`/api/players/${id}`, sessionAuth),
  settings: (body: SettingsRequest) => request<SettingsResponse>('/api/settings', sessionAuth, body),
  achievements: () => request<AchievementsResponse>('/api/achievements', sessionAuth),
  review: (gameId: string) => request<ReviewResponse>(`/api/games/${encodeURIComponent(gameId)}/review`, sessionAuth),
  // Обновление 2.0: монеты и магазин
  wallet: () => request<WalletResponse>('/api/wallet', sessionAuth),
  daily: () => request<ClaimResponse>('/api/daily', sessionAuth, {}),
  claimTask: (id: string) => request<ClaimResponse>('/api/tasks/claim', sessionAuth, { id }),
  buy: (kind: ShopKind, item: string) => request<WalletResponse>('/api/shop/buy', sessionAuth, { kind, item } satisfies BuyRequest),
  equip: (kind: EquipRequest['kind'], item: string) => request<WalletResponse>('/api/shop/equip', sessionAuth, { kind, item } satisfies EquipRequest),
  adStart: (purpose: AdPurpose, topic?: PremiumTopic) =>
    request<AdStartResponse>('/api/ads/start', sessionAuth, (topic ? { purpose, topic } : { purpose }) satisfies AdStartRequest),
  adDone: (id: string) => request<AdDoneResponse>('/api/ads/done', sessionAuth, { id }),
  invoice: (product: StarsProduct) => request<{ url: string }>('/api/stars/invoice', sessionAuth, { product } satisfies InvoiceRequest),
  // Друзья
  friends: () => request<FriendsResponse>('/api/friends', sessionAuth),
  friendRequest: (id: number) => request<{ result: 'sent' | 'accepted' | 'already' }>('/api/friends/request', sessionAuth, { id } satisfies FriendIdRequest),
  friendRespond: (id: number, accept: boolean) => request<{ ok: true }>('/api/friends/respond', sessionAuth, { id, accept } satisfies FriendRespondRequest),
  friendInviteMessage: () => request<FriendInviteMessageResponse>('/api/friends/invite', sessionAuth, {}),
  friendRemove: (id: number) => request<{ ok: true }>('/api/friends/remove', sessionAuth, { id } satisfies FriendIdRequest),
  // Админка
  admin: {
    overview: (days: AdminPeriod) => request<AdminOverview>(`/api/admin/overview?days=${days}`, sessionAuth),
    retention: () => request<AdminRetention>('/api/admin/retention', sessionAuth),
    events: (days: AdminPeriod) => request<AdminEvents>(`/api/admin/events?days=${days}`, sessionAuth),
    sources: (days: AdminPeriod) => request<AdminSources>(`/api/admin/sources?days=${days}`, sessionAuth),
    money: (days: AdminPeriod) => request<AdminMoney>(`/api/admin/money?days=${days}`, sessionAuth),
    tasks: () => request<AdminTask[]>('/api/admin/tasks', sessionAuth),
    saveTask: (body: AdminTaskSaveRequest) => request<TaskConfigView>('/api/admin/tasks', sessionAuth, body),
    removeTask: (id: string) => request<{ ok: true }>('/api/admin/tasks/remove', sessionAuth, { id }),
    checkChannel: (channel: string) => request<{ botAdmin: boolean | null }>('/api/admin/channel', sessionAuth, { channel }),
    createLink: (code: string, title: string) => request<{ url: string }>('/api/admin/links', sessionAuth, { code, title } satisfies AdminLinkRequest),
    players: (q: string, filter: string) =>
      request<AdminPlayerRow[]>(`/api/admin/players?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}`, sessionAuth),
    player: (id: number) => request<AdminPlayer>(`/api/admin/players/${id}`, sessionAuth),
    coins: (id: number, delta: number) => request<{ coins: number }>(`/api/admin/players/${id}/coins`, sessionAuth, { delta }),
    ban: (id: number, banned: boolean) => request<{ ok: true }>(`/api/admin/players/${id}/ban`, sessionAuth, { banned }),
  },
};

/** Ключи кэша TanStack Query: после партии профиль и рейтинг сбрасываются. */
export const queryKeys = {
  profile: ['profile'] as const,
  leaderboard: ['leaderboard'] as const,
  player: (id: number) => ['player', id] as const,
  review: (gameId: string) => ['review', gameId] as const,
  achievements: ['achievements'] as const,
  wallet: ['wallet'] as const,
  friends: ['friends'] as const,
};
