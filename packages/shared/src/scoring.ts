/** Тайминги партии (мс). Считает их только сервер; клиент лишь показывает. */
export const TIMINGS = {
  /**
   * Отсчёт перед первым вопросом, как в утверждённом прототипе: первые 3 с - в лобби
   * («Оба готовы! Старт через 3…»), последние vsMs - экран VS с крупными 3-2-1.
   */
  countdownMs: 6_000,
  /** Последняя часть отсчёта - экран VS и 3-2-1. */
  vsMs: 3_000,
  /** Время на вопрос, которое видит игрок. */
  questionMs: 15_000,
  /** Допуск на сеть: ответ, отправленный до конца таймера, может дойти чуть позже. */
  answerGraceMs: 300,
  /** Показ верного ответа и очков после вопроса. */
  revealMs: 3_000,
  /** Сколько ждём вернувшегося игрока посреди партии до технической победы соперника. */
  reconnectGraceMs: 30_000,
  /** Соперник офлайн в лобби дольше - место освобождается. */
  lobbyOfflineMs: 60_000,
  /** Лобби без начала партии живёт столько с последнего действия. */
  lobbyTtlMs: 15 * 60_000,
  /** Сколько ждём ответа на предложение реванша. */
  rematchMs: 30_000,
} as const;

/** Быстрая игра: подбор по рейтингу ±100, окно шире на 50 каждые 5 с, через 60 с - «Никого не нашли». */
export const QUEUE = {
  baseRange: 100,
  stepRange: 50,
  stepMs: 5_000,
  timeoutMs: 60_000,
  /** Как часто сервер пересматривает очередь (окна расширяются со временем). */
  tickMs: 1_000,
} as const;

/** Окно рейтинга соперника для игрока, который ищет уже elapsedMs. */
export const queueRange = (elapsedMs: number) => QUEUE.baseRange + QUEUE.stepRange * Math.floor(Math.max(0, elapsedMs) / QUEUE.stepMs);

export const POINTS = {
  /** За любой верный ответ. */
  base: 500,
  /** Максимальный бонус за скорость (ответ мгновенно). */
  speedBonus: 500,
} as const;

/**
 * Очки за ответ: 500 + 500 × (оставшееся время / 15 с), округление до целого.
 * Неверный ответ - 0. Ответ в допуске после конца таймера - 500 (осталось 0 с).
 * elapsedMs - сколько прошло от старта вопроса до получения ответа сервером.
 */
export function pointsFor(correct: boolean, elapsedMs: number, limitMs: number = TIMINGS.questionMs): number {
  if (!correct) return 0;
  const remaining = Math.min(limitMs, Math.max(0, limitMs - elapsedMs));
  return Math.round(POINTS.base + (POINTS.speedBonus * remaining) / limitMs);
}

/** Принимается ли ответ: до конца таймера (limitMs - время на ответ в этой партии) плюс допуск на сеть. */
export function isAnswerInTime(elapsedMs: number, limitMs: number = TIMINGS.questionMs): boolean {
  return elapsedMs >= 0 && elapsedMs <= limitMs + TIMINGS.answerGraceMs;
}

/** Максимум за партию из 10 вопросов. */
export const MAX_GAME_SCORE = 10 * (POINTS.base + POINTS.speedBonus);
