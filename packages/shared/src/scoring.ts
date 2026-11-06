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
export function pointsFor(correct: boolean, elapsedMs: number): number {
  if (!correct) return 0;
  const remaining = Math.min(TIMINGS.questionMs, Math.max(0, TIMINGS.questionMs - elapsedMs));
  return Math.round(POINTS.base + (POINTS.speedBonus * remaining) / TIMINGS.questionMs);
}

/** Принимается ли ответ: до конца таймера плюс допуск на сеть. */
export function isAnswerInTime(elapsedMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs <= TIMINGS.questionMs + TIMINGS.answerGraceMs;
}

/** Максимум за партию из 10 вопросов. */
export const MAX_GAME_SCORE = 10 * (POINTS.base + POINTS.speedBonus);
