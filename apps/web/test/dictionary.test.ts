import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ru from '../src/locales/ru.json';

/** Разделы словаря, которые лежат в стартовом файле (src/i18n.ts, BOOT). */
const BOOT_SECTIONS = ['app', 's01', 's24'];

describe('словари отдельными файлами', () => {
  it('экраны загрузки и ошибок берут строки только из стартовых разделов - они видны до словаря', () => {
    for (const file of ['screens/LoadingScreen.tsx', 'screens/FallbackScreen.tsx']) {
      const src = readFileSync(join(__dirname, '../src', file), 'utf8');
      const keys = [...src.matchAll(/\bt\(\s*['`]([^'`]+)['`]/g)].map((m) => m[1] ?? '');
      expect(keys.length, file).toBeGreaterThan(0);
      for (const key of keys) expect(BOOT_SECTIONS, `${file}: ${key}`).toContain(key.split('.')[0]);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('словарь скачивается с повторами при обрыве сети, текст появляется после загрузки', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { documentElement: { lang: '' } });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ru });
    vi.stubGlobal('fetch', fetchMock);
    const { default: i18n } = await import('i18next');
    const { initI18n, loadLang } = await import('../src/i18n');

    initI18n('ru');
    await vi.waitFor(() => expect(i18n.isInitialized).toBe(true));
    // До словаря - только стартовые строки.
    expect(i18n.t('s01.long')).toBe(ru.s01.long);
    expect(i18n.t('tabs.shop')).toBe('tabs.shop');

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await loadLang('ru');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(i18n.t('tabs.shop')).toBe(ru.tabs.shop);
  });
});
