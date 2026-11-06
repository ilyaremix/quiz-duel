/**
 * Типы событий Socket.IO. Общие для клиента и сервера, поэтому
 * имя события или его данные нельзя поменять только с одной стороны.
 * На этапе 1 здесь только приветствие и синхронизация часов;
 * игровые события добавятся на этапах 4-6.
 */

export interface SessionHello {
  userId: number;
  serverNow: number;
}

export interface TimeSyncAck {
  serverNow: number;
}

export interface ServerToClientEvents {
  'session:hello': (payload: SessionHello) => void;
}

export interface ClientToServerEvents {
  'time:sync': (ack: (payload: TimeSyncAck) => void) => void;
}

/** Данные, которые сервер кладёт в socket.data после проверки initData. */
export interface SocketData {
  userId: number;
}

/** Путь Socket.IO, одинаковый у клиента, сервера и прокси. */
export const SOCKET_PATH = '/socket.io';
