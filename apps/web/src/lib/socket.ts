import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from '@quiz-duel/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type SocketStatus =
  | { state: 'connecting' }
  | { state: 'connected'; userId: number; clockOffsetMs: number }
  | { state: 'error' };

export function createSocket(initDataRaw: string): GameSocket {
  return io({
    path: SOCKET_PATH,
    auth: { initData: initDataRaw },
    // Сначала WebSocket; long polling - запасной путь для строгих сетей.
    transports: ['websocket', 'polling'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 4_000,
  });
}

/**
 * Смещение часов: serverNow - середина интервала запроса.
 * Таймеры партии на следующих этапах считаются по нему, а не по часам телефона.
 */
export async function measureClockOffset(socket: GameSocket): Promise<number> {
  const sentAt = Date.now();
  const { serverNow } = await socket.timeout(5_000).emitWithAck('time:sync');
  const receivedAt = Date.now();
  return Math.round(serverNow - (sentAt + receivedAt) / 2);
}

export function useSocketStatus(initDataRaw: string | null): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>({ state: 'connecting' });

  useEffect(() => {
    if (!initDataRaw) return;
    const socket = createSocket(initDataRaw);

    socket.on('session:hello', ({ userId }) => {
      measureClockOffset(socket)
        .then((clockOffsetMs) => setStatus({ state: 'connected', userId, clockOffsetMs }))
        .catch(() => setStatus({ state: 'connected', userId, clockOffsetMs: 0 }));
    });
    socket.on('connect_error', () => setStatus({ state: 'error' }));
    socket.on('disconnect', () => setStatus({ state: 'connecting' }));

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [initDataRaw]);

  return status;
}
