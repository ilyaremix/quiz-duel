/**
 * Обновление 2.0: анимированные карточки в сообщениях бота. Ролики 6 с без звука (Telegram показывает их
 * как GIF) лежат на сайте: /bot/<вид>-<язык>.mp4 и обложка .jpg (рисует tools/bot-cards/render.py).
 * После первой отправки Telegram отдаёт file_id - дальше шлём его, ролик заново не скачивается.
 */
import type { Lang } from '@quiz-duel/shared';
import type { GameAlert } from '../game/manager.js';

export const CARD_KINDS = ['invite', 'friend', 'waiting', 'rematch', 'win', 'loss', 'draw', 'daily'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** Размер и длина роликов - для inline-выдачи. */
export const CARD_VIDEO = { width: 640, height: 360, duration: 6 } as const;

/** Какая карточка у уведомления. */
export function cardOfAlert(alert: GameAlert): CardKind {
  switch (alert.kind) {
    case 'joined':
    case 'waitingLobby':
    case 'waitingGame':
      return 'waiting';
    case 'rematch':
      return 'rematch';
    case 'friendInvite':
      return 'friend';
    case 'result':
      return alert.result?.outcome === 'win' ? 'win' : alert.result?.outcome === 'loss' ? 'loss' : 'draw';
  }
}

export interface CardMedia {
  /** Адрес ролика на сайте. */
  url(kind: CardKind, lang: Lang): string;
  thumb(kind: CardKind, lang: Lang): string;
  /** file_id, если ролик уже уходил, иначе адрес. */
  media(kind: CardKind, lang: Lang): string;
  remember(kind: CardKind, lang: Lang, fileId: string | undefined): void;
  forget(kind: CardKind, lang: Lang): void;
}

/** webAppUrl - адрес мини-аппа (https://домен/...): ролики отдаёт тот же сайт. */
export function cardMedia(webAppUrl: string): CardMedia {
  const origin = new URL(webAppUrl).origin;
  const ids = new Map<string, string>();
  const key = (kind: CardKind, lang: Lang) => `${kind}-${lang}`;
  return {
    url: (kind, lang) => `${origin}/bot/${key(kind, lang)}.mp4`,
    thumb: (kind, lang) => `${origin}/bot/${key(kind, lang)}.jpg`,
    media(kind, lang) {
      return ids.get(key(kind, lang)) ?? this.url(kind, lang);
    },
    remember(kind, lang, fileId) {
      if (fileId) ids.set(key(kind, lang), fileId);
    },
    forget(kind, lang) {
      ids.delete(key(kind, lang));
    },
  };
}

/** Ответ sendAnimation: из него берём file_id ролика. */
export const animationFileId = (message: unknown) => (message as { animation?: { file_id?: string } } | null)?.animation?.file_id;
