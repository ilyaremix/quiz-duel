import type { ServerClock } from '../src/game/manager.js';

/**
 * Часы сервера для тестов с настоящими сокетами. Время идёт как обычно, но его можно
 * «перемотать»: advance(30_000) - и всё, что сервер ждал эти 30 с, срабатывает сразу.
 * Сокеты и Socket.IO при этом работают на настоящих таймерах.
 */
export class JumpClock implements ServerClock {
  private shift = 0;
  private seq = 0;
  private readonly tasks = new Map<number, { at: number; fn: () => void; real: NodeJS.Timeout }>();

  now = () => Date.now() + this.shift;

  setTimeout = (fn: () => void, ms: number): number => {
    const id = ++this.seq;
    this.arm(id, this.now() + ms, fn);
    return id;
  };

  clearTimeout = (handle: unknown) => {
    const task = this.tasks.get(handle as number);
    if (!task) return;
    clearTimeout(task.real);
    this.tasks.delete(handle as number);
  };

  /** Перемотать время вперёд: наступившие таймеры срабатывают по порядку. */
  async advance(ms: number) {
    this.shift += ms;
    const due = [...this.tasks.entries()].sort((a, b) => a[1].at - b[1].at);
    for (const [id, task] of due) {
      clearTimeout(task.real);
      this.tasks.delete(id);
      if (task.at <= this.now()) task.fn();
      else this.arm(id, task.at, task.fn);
    }
    // Даём очередям партий и сокетам доставить результат.
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  dispose() {
    for (const task of this.tasks.values()) clearTimeout(task.real);
    this.tasks.clear();
  }

  private arm(id: number, at: number, fn: () => void) {
    const real = setTimeout(() => {
      this.tasks.delete(id);
      fn();
    }, Math.max(0, at - this.now()));
    real.unref();
    this.tasks.set(id, { at, fn, real });
  }
}
