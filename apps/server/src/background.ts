/**
 * Фоновые дела и страховка процесса.
 *
 * Node завершает процесс, если отказ промиса никто не поймал. Для дела «вдогонку» (уведомление,
 * проход таймера), результата которого никто не ждёт, это значит: одна ошибка базы - и сервер
 * перезапускается, обрывая все идущие партии. Поэтому такие дела запускаются только через
 * background(): сбой пишется в журнал и остаётся сбоем одного дела.
 */
interface ErrorLog {
  error(obj: object, msg: string): void;
}

export function background(log: ErrorLog, what: string, job: () => unknown): void {
  Promise.resolve()
    .then(job)
    .catch((error: unknown) => log.error({ err: error, what }, 'background job failed'));
}

const describe = (error: unknown) => (error instanceof Error ? (error.stack ?? error.message) : String(error)).slice(0, 300);

export interface ProcessGuardHooks {
  /** Сообщить владельцу (бот). */
  alert?: (kind: 'unhandledRejection' | 'uncaughtException', detail: string) => void;
  /** Штатно остановить сервер: после необработанного исключения его состояние неизвестно. */
  fatal: (error: unknown) => void;
}

/**
 * Последний рубеж, если ошибку всё же пропустили.
 * - Непойманный отказ промиса - это пропущенный catch в одном фоновом деле: общее состояние он не
 *   ломает, поэтому пишем в журнал, сообщаем владельцу и работаем дальше (иначе из-за одного
 *   уведомления оборвались бы партии у всех).
 * - Необработанное исключение могло прервать код на середине: дописываем начатое и останавливаемся,
 *   Docker поднимет процесс заново.
 */
export function guardProcess(proc: Pick<NodeJS.EventEmitter, 'on'>, log: ErrorLog & { fatal(obj: object, msg: string): void }, hooks: ProcessGuardHooks) {
  proc.on('unhandledRejection', (reason: unknown) => {
    log.error({ err: reason }, 'unhandled rejection');
    hooks.alert?.('unhandledRejection', describe(reason));
  });
  proc.on('uncaughtException', (error: unknown) => {
    log.fatal({ err: error }, 'uncaught exception');
    hooks.alert?.('uncaughtException', describe(error));
    hooks.fatal(error);
  });
}
