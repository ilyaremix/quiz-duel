/**
 * Лимиты частоты в памяти процесса: сколько раз ключ (обычно игрок) может что-то сделать за окно.
 * Окно фиксированное: первое действие открывает его, через windowMs счёт начинается заново.
 * Старые окна чистит sweep() - карта не растёт с числом игроков.
 */
export interface Limit {
  max: number;
  windowMs: number;
}

export class WindowLimiter<K = number> {
  private readonly windows = new Map<K, { start: number; count: number }>();

  constructor(private readonly limit: Limit) {}

  /** Учесть действие; false - лимит уже исчерпан (действие не засчитывается). */
  hit(key: K, now: number, cost = 1): boolean {
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.limit.windowMs) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    if (w.count + cost > this.limit.max) return false;
    w.count += cost;
    return true;
  }

  /** Убрать окна, которые уже закончились. */
  sweep(now: number) {
    for (const [key, w] of this.windows) if (now - w.start >= this.limit.windowMs) this.windows.delete(key);
  }

  get size() {
    return this.windows.size;
  }
}
