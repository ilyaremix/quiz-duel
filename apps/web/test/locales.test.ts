import { describe, expect, it } from 'vitest';
import ru from '../src/locales/ru.json';
import en from '../src/locales/en.json';

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Все ключи словаря в виде "a.b.c"; формы множественного числа сводятся к одному ключу. */
function keys(dict: Record<string, unknown>, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') keys(value as Record<string, unknown>, path).forEach((k) => out.add(k));
    else out.add(path.replace(PLURAL_SUFFIX, ''));
  }
  return out;
}

function placeholders(dict: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      placeholders(value as Record<string, unknown>, path).forEach((v, k) => out.set(k, v));
    } else if (typeof value === 'string') {
      const vars = [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
      out.set(path.replace(PLURAL_SUFFIX, ''), vars.join(','));
    }
  }
  return out;
}

describe('словари RU / EN', () => {
  it('наборы ключей совпадают', () => {
    expect([...keys(ru)].sort()).toEqual([...keys(en)].sort());
  });

  it('у каждой строки одинаковые подстановки {{…}}', () => {
    const ruVars = placeholders(ru);
    const enVars = placeholders(en);
    for (const [key, vars] of ruVars) expect(enVars.get(key), key).toBe(vars);
  });

  it('русские формы множественного числа полные (one / few / many)', () => {
    const forms = Object.keys(ru.hello).filter((k) => k.startsWith('games_'));
    expect(forms).toEqual(expect.arrayContaining(['games_one', 'games_few', 'games_many']));
  });

  it('нет пустых строк', () => {
    const empty = (dict: Record<string, unknown>): boolean =>
      Object.values(dict).some((v) => (typeof v === 'string' ? v.trim() === '' : empty(v as Record<string, unknown>)));
    expect(empty(ru)).toBe(false);
    expect(empty(en)).toBe(false);
  });
});
