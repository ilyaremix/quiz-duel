import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MeResponse } from '@quiz-duel/shared';

// lib/settings.ts тянет за собой стор игры и SDK Telegram - здесь проверяем только чистые функции.
const { optimistic, pick } = await import('../src/lib/settings');

const me: MeResponse = {
  id: 1, firstName: 'Илья', lastName: null, username: null, photoUrl: null,
  language: 'auto', lang: 'ru', autoLang: 'ru', reducedMotion: 'auto',
  rating: 1000, games: 0, wins: 0, losses: 0, draws: 0,
  docsAccepted: true, notifications: true, writeAccess: false, serverNow: 0, haptics: true,
};

describe('настройки: экран меняется сразу, до ответа сервера', () => {
  it('явный язык - сразу он; «Авто» - язык Telegram', () => {
    expect(optimistic(me, { language: 'en' })).toMatchObject({ language: 'en', lang: 'en' });
    expect(optimistic({ ...me, language: 'en', lang: 'en' }, { language: 'auto' })).toMatchObject({ language: 'auto', lang: 'ru' });
  });

  it('откат возвращает только изменённые поля', () => {
    expect(pick(me, { language: 'en' })).toEqual({ language: 'auto', lang: 'ru' });
    expect(pick(me, { notifications: false })).toEqual({ notifications: true });
  });
});

describe('локализация: ни одной захардкоженной строки в компонентах', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : path.endsWith('.tsx') ? [path] : [];
    });

  it('в .tsx нет кириллицы вне комментариев', () => {
    const offenders: string[] = [];
    for (const file of files(join(__dirname, '../src'))) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      code.split('\n').forEach((line, i) => {
        if (/[А-Яа-яЁё]/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
