/**
 * zod-схемы входящих данных. Сервер проверяет ими каждое событие и запрос:
 * невалидное отклоняется с кодом ошибки, сервер не падает.
 */
import { z } from 'zod';
import { CONSENT_DOCS, type ConsentDoc } from './api.js';
import { GAME_ID_RE } from './links.js';
import { QUESTIONS_PER_GAME } from './questions.js';
import { GAME_CATEGORIES, type GameCategory } from './categories.js';

type Tuple<T> = readonly [T, ...T[]];

const gameId = z.string().regex(GAME_ID_RE);

export const CreateGamePayloadSchema = z.strictObject({
  category: z.enum(GAME_CATEGORIES as unknown as Tuple<GameCategory>),
});

export const GameIdPayloadSchema = z.strictObject({ gameId });

export const SyncPayloadSchema = z.strictObject({ gameId: gameId.optional() });

export const AnswerPayloadSchema = z.strictObject({
  gameId,
  questionIndex: z.number().int().min(0).max(QUESTIONS_PER_GAME - 1),
  optionIndex: z.number().int().min(0).max(3),
});

export const ReadyPayloadSchema = z.strictObject({ gameId, ready: z.boolean() });

export const RematchRespondPayloadSchema = z.strictObject({ gameId, accept: z.boolean() });

export const ConsentRequestSchema = z.strictObject({
  docs: z
    .array(z.enum(CONSENT_DOCS as unknown as Tuple<ConsentDoc>))
    .min(1)
    .max(CONSENT_DOCS.length),
  version: z.string().min(1).max(32),
});
