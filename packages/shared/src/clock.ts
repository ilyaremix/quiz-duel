/**
 * Часы клиента против часов сервера. Таймеры партии считаются по времени сервера:
 * часы телефона могут быть сбиты на минуты, а сервер - единственный источник правды.
 *
 * Смещение = serverNow - середина интервала запроса. Из нескольких замеров берём
 * тот, у которого запрос шёл быстрее всех: у него меньше всего погрешность.
 */

export interface ClockSample {
  /** Время клиента в момент отправки запроса. */
  sentAt: number;
  /** Время клиента в момент получения ответа. */
  receivedAt: number;
  /** Время сервера из ответа. */
  serverNow: number;
}

/** Смещение по лучшему замеру (самый короткий запрос туда и обратно). */
export function offsetFromSamples(samples: readonly ClockSample[]): { offset: number; rttMs: number } | null {
  let best: ClockSample | null = null;
  for (const s of samples) {
    if (s.receivedAt < s.sentAt) continue;
    if (!best || s.receivedAt - s.sentAt < best.receivedAt - best.sentAt) best = s;
  }
  if (!best) return null;
  return { offset: Math.round(best.serverNow - (best.sentAt + best.receivedAt) / 2), rttMs: best.receivedAt - best.sentAt };
}

/** То, что нужно от сокета: событие time:sync с ответом. Без зависимости от socket.io-client. */
export interface TimeSyncSocket {
  timeout(ms: number): { emitWithAck(event: 'time:sync'): Promise<{ serverNow: number }> };
}

/**
 * Несколько замеров time:sync подряд → смещение часов клиента.
 * now - часы клиента (в тестах подставляются сбитые).
 */
export async function measureClockOffset(
  socket: TimeSyncSocket,
  options: { samples?: number; timeoutMs?: number; now?: () => number } = {},
): Promise<{ offset: number; rttMs: number }> {
  const now = options.now ?? Date.now;
  const samples: ClockSample[] = [];
  for (let i = 0; i < (options.samples ?? 3); i++) {
    const sentAt = now();
    const { serverNow } = await socket.timeout(options.timeoutMs ?? 5_000).emitWithAck('time:sync');
    samples.push({ sentAt, receivedAt: now(), serverNow });
  }
  const best = offsetFromSamples(samples);
  if (!best) throw new Error('no clock samples');
  return best;
}
