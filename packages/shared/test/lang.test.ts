import { describe, expect, it } from 'vitest';
import { langFromTelegram, resolveLang } from '../src/lang.js';

describe('langFromTelegram', () => {
  it.each(['ru', 'uk', 'be', 'kk', 'RU', 'ru-RU', 'uk_UA'])('%s → ru', (code) => {
    expect(langFromTelegram(code)).toBe('ru');
  });

  it.each(['en', 'de', 'pt-br', 'kz', 'run'])('%s → en', (code) => {
    expect(langFromTelegram(code)).toBe('en');
  });

  it('пустое значение → en', () => {
    expect(langFromTelegram(undefined)).toBe('en');
    expect(langFromTelegram(null)).toBe('en');
    expect(langFromTelegram('')).toBe('en');
  });
});

describe('resolveLang', () => {
  it('явная настройка важнее Telegram', () => {
    expect(resolveLang('en', 'ru')).toBe('en');
    expect(resolveLang('ru', 'de')).toBe('ru');
  });

  it('«Авто» берёт язык Telegram', () => {
    expect(resolveLang('auto', 'be')).toBe('ru');
    expect(resolveLang('auto', 'fr')).toBe('en');
    expect(resolveLang(null, undefined)).toBe('en');
  });
});
