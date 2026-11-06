import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@quiz-duel/shared';
import type { FastifyBaseLogger } from 'fastify';
import { InitDataError, verifyInitData } from './auth/initData.js';
import { authErrorBody } from './auth/fastify.js';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface SocketDeps {
  botToken: string;
  maxAgeSec: number;
  origin: string;
  log: FastifyBaseLogger;
}

/** Комната игрока: все его вкладки и устройства. */
export const userRoom = (userId: number) => `user:${userId}`;

export function attachSocket(httpServer: HttpServer, deps: SocketDeps): IoServer {
  const io: IoServer = new Server(httpServer, {
    path: SOCKET_PATH,
    cors: { origin: deps.origin, methods: ['GET', 'POST'] },
    // Игровые события маленькие; большой пакет - это ошибка или атака.
    maxHttpBufferSize: 16 * 1024,
    serveClient: false,
  });

  // Без верного initData соединение не устанавливается вообще.
  io.use((socket, next) => {
    const raw: unknown = socket.handshake.auth?.initData;
    try {
      const verified = verifyInitData(typeof raw === 'string' ? raw : undefined, deps.botToken, {
        maxAgeSec: deps.maxAgeSec,
      });
      socket.data.userId = verified.user.id;
      next();
    } catch (error) {
      const err = new Error('unauthorized') as Error & { data?: unknown };
      err.data = error instanceof InitDataError ? authErrorBody(error) : { error: 'internal' };
      if (!(error instanceof InitDataError)) deps.log.error({ err: error }, 'socket auth failed');
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    void socket.join(userRoom(userId));
    socket.emit('session:hello', { userId, serverNow: Date.now() });

    socket.on('time:sync', (ack) => {
      if (typeof ack === 'function') ack({ serverNow: Date.now() });
    });
  });

  return io;
}
