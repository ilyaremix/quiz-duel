import { io, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from '@quiz-duel/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

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
