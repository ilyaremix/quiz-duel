import { randomInt } from 'node:crypto';
import { GAME_ID_LENGTH } from '@quiz-duel/shared';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 10 случайных символов [A-Za-z0-9] (62^10 ≈ 8·10^17 вариантов) - угадать чужую ссылку нельзя. */
export function newGameId(): string {
  let id = '';
  for (let i = 0; i < GAME_ID_LENGTH; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return id;
}
