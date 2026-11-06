import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InitDataError, verifyInitData, type InitDataFailure } from '../src/auth/initData.js';
import { readInitDataHeader } from '../src/auth/fastify.js';
import { BOT_TOKEN, ilya, makeInitData } from './helpers.js';

const DAY = 86_400;
const now = Date.UTC(2026, 10, 6, 12, 0, 0);
const nowSec = Math.floor(now / 1000);

function rejectReason(raw: string | undefined, token = BOT_TOKEN, at = now): InitDataFailure | 'accepted' {
  try {
    verifyInitData(raw, token, { maxAgeSec: DAY, now: at });
    return 'accepted';
  } catch (error) {
    if (error instanceof InitDataError) return error.reason;
    throw error;
  }
}

describe('verifyInitData', () => {
  it('принимает данные, подписанные токеном бота', () => {
    const raw = makeInitData({ authDateSec: nowSec - 60, extra: { start_param: 'g_AbCdEf1234' } });
    const result = verifyInitData(raw, BOT_TOKEN, { maxAgeSec: DAY, now });
    expect(result.user).toMatchObject({ id: ilya.id, first_name: 'Илья', username: 'ilya' });
    expect(result.startParam).toBe('g_AbCdEf1234');
    expect(result.authDate.getTime()).toBe((nowSec - 60) * 1000);
  });

  it('совпадает с эталонным алгоритмом Telegram (независимая реализация)', () => {
    const user = JSON.stringify({ id: 42, first_name: 'Ann' });
    const fields = { auth_date: String(nowSec), query_id: 'q1', user };
    const dcs = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${fields[k as keyof typeof fields]}`)
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const hash = createHmac('sha256', secret).update(dcs).digest('hex');
    const raw = new URLSearchParams({ ...fields, hash }).toString();
    expect(verifyInitData(raw, BOT_TOKEN, { maxAgeSec: DAY, now }).user.id).toBe(42);
  });

  it('отклоняет пустые данные', () => {
    expect(rejectReason(undefined)).toBe('missing');
    expect(rejectReason('')).toBe('missing');
  });

  it('отклоняет подпись другим токеном', () => {
    const raw = makeInitData({ authDateSec: nowSec, token: '999:AAH-another-bot-token-not-ours-000000' });
    expect(rejectReason(raw)).toBe('bad_hash');
  });

  it('отклоняет подмену пользователя после подписи', () => {
    const raw = makeInitData({ authDateSec: nowSec });
    const params = new URLSearchParams(raw);
    params.set('user', JSON.stringify({ ...ilya, id: 777 }));
    expect(rejectReason(params.toString())).toBe('bad_hash');
  });

  it('отклоняет подмену auth_date после подписи', () => {
    const raw = makeInitData({ authDateSec: nowSec - 2 * DAY });
    const params = new URLSearchParams(raw);
    params.set('auth_date', String(nowSec));
    expect(rejectReason(params.toString())).toBe('bad_hash');
  });

  it('отклоняет дописанное поле', () => {
    const raw = makeInitData({ authDateSec: nowSec });
    expect(rejectReason(`${raw}&start_param=g_hijacked00`)).toBe('bad_hash');
  });

  it('отклоняет повтор ключа', () => {
    const raw = makeInitData({ authDateSec: nowSec });
    expect(rejectReason(`${raw}&user=${encodeURIComponent('{"id":1,"first_name":"x"}')}`)).toBe('malformed');
  });

  it('отклоняет отсутствующий или кривой hash', () => {
    const raw = makeInitData({ authDateSec: nowSec });
    const params = new URLSearchParams(raw);
    params.delete('hash');
    expect(rejectReason(params.toString())).toBe('malformed');
    params.set('hash', 'zz');
    expect(rejectReason(params.toString())).toBe('malformed');
  });

  it('принимает данные возрастом ровно 24 часа и отклоняет старше', () => {
    expect(rejectReason(makeInitData({ authDateSec: nowSec - DAY }))).toBe('accepted');
    expect(rejectReason(makeInitData({ authDateSec: nowSec - DAY - 1 }))).toBe('expired');
  });

  it('отклоняет auth_date из будущего дальше допуска', () => {
    expect(rejectReason(makeInitData({ authDateSec: nowSec + 60 }))).toBe('accepted');
    expect(rejectReason(makeInitData({ authDateSec: nowSec + 3600 }))).toBe('from_future');
  });

  it('отклоняет данные без пользователя или с неверным id', () => {
    expect(rejectReason(makeInitData({ authDateSec: nowSec, user: null }))).toBe('no_user');
    const badId = makeInitData({ authDateSec: nowSec, extra: { user: '{"id":"1","first_name":"x"}' } });
    expect(rejectReason(badId)).toBe('no_user');
  });

  it('отклоняет слишком длинную строку', () => {
    expect(rejectReason('a='.padEnd(10_000, 'x'))).toBe('malformed');
  });
});

describe('readInitDataHeader', () => {
  it('понимает схему tma в любом регистре', () => {
    expect(readInitDataHeader('tma abc=1')).toBe('abc=1');
    expect(readInitDataHeader('TMA abc=1')).toBe('abc=1');
  });

  it('игнорирует другие схемы и пустые значения', () => {
    expect(readInitDataHeader(undefined)).toBeUndefined();
    expect(readInitDataHeader('Bearer abc')).toBeUndefined();
    expect(readInitDataHeader('tma ')).toBeUndefined();
    expect(readInitDataHeader('tma')).toBeUndefined();
  });
});
