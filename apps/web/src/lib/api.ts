import { AUTH_SCHEME, type ApiError, type ConfigResponse, type MeResponse } from '@quiz-duel/shared';

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

async function request<T>(path: string, initDataRaw?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: initDataRaw ? { Authorization: `${AUTH_SCHEME} ${initDataRaw}` } : {},
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
};
