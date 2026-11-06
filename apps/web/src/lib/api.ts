import {
  AUTH_SCHEME,
  type ApiError,
  type ConfigResponse,
  type ConsentRequest,
  type ConsentResponse,
  type MeResponse,
} from '@quiz-duel/shared';

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

export const api = {
  config: () => request<ConfigResponse>('/api/config'),
  me: (initDataRaw: string) => request<MeResponse>('/api/me', initDataRaw),
  consents: (initDataRaw: string, body: ConsentRequest) => request<ConsentResponse>('/api/consents', initDataRaw, body),
};
