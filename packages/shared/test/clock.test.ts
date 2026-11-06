import { describe, expect, it } from 'vitest';
import { measureClockOffset, offsetFromSamples } from '../src/clock.js';

describe('часы клиента', () => {
  it('смещение - по середине самого быстрого запроса', () => {
    // Часы телефона отстают на 7 минут; второй замер шёл быстрее всех.
    const skew = -7 * 60_000;
    const at = (t: number) => t + skew;
    const best = offsetFromSamples([
      { sentAt: at(1_000), receivedAt: at(1_400), serverNow: 1_150 },
      { sentAt: at(2_000), receivedAt: at(2_040), serverNow: 2_020 },
      { sentAt: at(3_000), receivedAt: at(3_300), serverNow: 3_250 },
    ]);
    expect(best).toEqual({ offset: -skew, rttMs: 40 });
  });

  it('битые замеры отбрасываются, без замеров - null', () => {
    expect(offsetFromSamples([{ sentAt: 10, receivedAt: 5, serverNow: 0 }])).toBeNull();
    expect(offsetFromSamples([])).toBeNull();
  });

  it('measureClockOffset спрашивает сервер несколько раз', async () => {
    let calls = 0;
    const serverClock = () => 1_000_000;
    let local = 500;
    const socket = {
      timeout: () => ({
        emitWithAck: async () => {
          calls += 1;
          local += 10;
          return { serverNow: serverClock() };
        },
      }),
    };
    const res = await measureClockOffset(socket, { samples: 4, now: () => local });
    expect(calls).toBe(4);
    expect(res.rttMs).toBe(10);
    expect(res.offset).toBe(1_000_000 - 505);
  });
});
