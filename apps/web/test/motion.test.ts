import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isLowEndAndroid, motionReduced } from '../src/lib/motion';

describe('режим без анимаций: Авто / Вкл / Выкл', () => {
  it('«Вкл» и «Выкл» - явный выбор, системная настройка не важна', () => {
    expect(motionReduced('on', false, false)).toBe(true);
    expect(motionReduced('off', true, true)).toBe(false);
  });

  it('«Авто» = «Уменьшить движение» в системе или слабый Android', () => {
    expect(motionReduced('auto', false, false)).toBe(false);
    expect(motionReduced('auto', true, false)).toBe(true);
    expect(motionReduced('auto', false, true)).toBe(true);
  });

  it('класс устройства LOW из User-Agent Telegram для Android', () => {
    const ua = (cls: string) =>
      `Mozilla/5.0 (Linux; Android 13; SM-A515F Build/TP1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Telegram-Android/11.4.2 (Samsung SM-A515F; Android 13; SDK 33; ${cls})`;
    expect(isLowEndAndroid(ua('LOW'))).toBe(true);
    expect(isLowEndAndroid(ua('AVERAGE'))).toBe(false);
    expect(isLowEndAndroid(ua('HIGH'))).toBe(false);
    expect(isLowEndAndroid('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148')).toBe(false);
    // LOW в названии модели - не класс устройства.
    expect(isLowEndAndroid('Telegram-Android/11.4.2 (LOWRIDER X1; Android 13; SDK 33; HIGH)')).toBe(false);
  });
});

describe('styles.css: у каждой анимации есть правило в режиме без анимаций', () => {
  const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('режим - класс qd-rm, а не только системный media query', () => {
    expect(css).not.toMatch(/@media\s*\(prefers-reduced-motion/);
  });

  it('каждый класс с animation перечислен в правилах .qd-rm', () => {
    const animated = new Set<string>();
    for (const m of css.matchAll(/([^{}]+)\{[^{}]*\banimation:\s*qd-(?!rm-|fade-in 160|bubble-fade)[^;]*;/g)) {
      for (const sel of (m[1] ?? '').split(',')) {
        const cls = sel.trim().match(/^\.(qd-[\w-]+)(::after)?$/);
        if (cls?.[1]) animated.add(cls[1]);
      }
    }
    const rm = new Set([...css.matchAll(/\.qd-rm \.(qd-[\w-]+)/g)].map((m) => m[1] ?? ''));
    const missing = [...animated].filter((c) => !rm.has(c));
    expect(animated.size).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });
});
