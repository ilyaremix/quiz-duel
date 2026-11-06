import type { TFunction } from 'i18next';
import { formatNumber } from '../i18n';

/** Миллисекунды → «3,3 с» / «3.3 s». */
export function formatSec(ms: number, t: TFunction, lang: string): string {
  const value = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.round(ms / 100) / 10);
  return t('units.sec', { t: value });
}

/** Изменение рейтинга со знаком: «+16», «−14», «0». */
export function signed(n: number, lang: string): string {
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n), lang)}`;
}

/** Процент или «-», если считать не из чего. */
export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '-';
}

/** Когда была партия: «сегодня», «вчера», иначе дата «3 нояб.» / «Nov 3». */
export function formatWhen(at: number, t: TFunction, lang: string, now = Date.now()): string {
  const day = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  if (diff <= 0) return t('when.today');
  if (diff === 1) return t('when.yesterday');
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(at));
}
