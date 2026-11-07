/**
 * zod-схемы входящих данных. Сервер проверяет ими каждое событие и запрос:
 * невалидное отклоняется с кодом ошибки, сервер не падает.
 */
import { z } from 'zod';
import { CONSENT_DOCS, type ConsentDoc } from './api.js';
import { GAME_ID_RE } from './links.js';
import { CATEGORIES, GAME_CATEGORIES, type GameCategory } from './categories.js';
import { COUNT_OPTIONS, MAX_QUESTIONS, TIME_OPTIONS, VARIANTS, type Reaction } from './game.js';
import { ALL_REACTIONS, PREMIUM_TOPICS, STARS_PRODUCTS, type PremiumTopic, type StarsProduct } from './economy.js';
import { ALL_EVENT_NAMES, RESERVED_SOURCES } from './admin.js';

type Tuple<T> = readonly [T, ...T[]];

const gameId = z.string().regex(GAME_ID_RE);

const userId = z
  .number()
  .int()
  .positive()
  .max(2 ** 52);

export const RulesSchema = z.strictObject({
  variant: z.enum(VARIANTS),
  timeSec: z.union(TIME_OPTIONS.map((n) => z.literal(n)) as unknown as [z.ZodLiteral<5>, z.ZodLiteral<10>, z.ZodLiteral<15>, z.ZodLiteral<20>]),
  count: z.union(COUNT_OPTIONS.map((n) => z.literal(n)) as unknown as [z.ZodLiteral<5>, z.ZodLiteral<10>, z.ZodLiteral<15>, z.ZodLiteral<20>]),
});

export const CreateGamePayloadSchema = z.strictObject({
  category: z.enum(GAME_CATEGORIES as unknown as Tuple<GameCategory>),
  friendId: userId.optional(),
  rules: RulesSchema.optional(),
});

export const GameIdPayloadSchema = z.strictObject({ gameId });

export const SyncPayloadSchema = z.strictObject({ gameId: gameId.optional() });

export const AnswerPayloadSchema = z.strictObject({
  gameId,
  questionIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_QUESTIONS - 1),
  optionIndex: z.number().int().min(0).max(3),
});

export const ReadyPayloadSchema = z.strictObject({ gameId, ready: z.boolean() });

export const DraftPayloadSchema = z.strictObject({ gameId, category: z.enum(CATEGORIES) });

export const ReactPayloadSchema = z.strictObject({ gameId, emoji: z.enum(ALL_REACTIONS as unknown as Tuple<Reaction>) });

export const RematchRespondPayloadSchema = z.strictObject({ gameId, accept: z.boolean() });

export const ConsentRequestSchema = z.strictObject({
  docs: z
    .array(z.enum(CONSENT_DOCS as unknown as Tuple<ConsentDoc>))
    .min(1)
    .max(CONSENT_DOCS.length),
  version: z.string().min(1).max(32),
});

export const SettingsRequestSchema = z
  .strictObject({
    notifications: z.boolean().optional(),
    writeAccess: z.literal(true).optional(),
    language: z.enum(['auto', 'ru', 'en']).optional(),
    reducedMotion: z.enum(['auto', 'on', 'off']).optional(),
    theme: z.enum(['auto', 'light', 'dark']).optional(),
    haptics: z.boolean().optional(),
    onboarded: z.literal(true).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'empty');

export const EmptyPayloadSchema = z.strictObject({});

// ---------------------------------------------------------------------------
// Обновление 2.0: магазин, задания, реклама, звёзды

const shopItem = z
  .string()
  .min(1)
  .max(16)
  .regex(/^[a-z]+$/);

export const BuyRequestSchema = z.strictObject({ kind: z.enum(['glow', 'pack', 'topic']), item: shopItem });

export const EquipRequestSchema = z.strictObject({ kind: z.enum(['glow', 'pack']), item: shopItem });

export const TaskClaimSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/),
});

export const AdStartRequestSchema = z.strictObject({
  purpose: z.enum(['forced', 'reward', 'topic']),
  topic: z.enum(PREMIUM_TOPICS as unknown as Tuple<PremiumTopic>).optional(),
});

export const AdDoneRequestSchema = z.strictObject({
  id: z
    .string()
    .min(8)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export const InvoiceRequestSchema = z.strictObject({ product: z.enum(STARS_PRODUCTS as unknown as Tuple<StarsProduct>) });

export const FriendIdSchema = z.strictObject({ id: userId });

export const FriendRespondSchema = z.strictObject({ id: userId, accept: z.boolean() });

// ---------------------------------------------------------------------------
// Обновление 2.0: аналитика и админка

export const TrackRequestSchema = z.strictObject({
  events: z
    .array(z.enum(ALL_EVENT_NAMES as unknown as Tuple<string>))
    .min(1)
    .max(50),
});

export const AdminTaskSaveSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/)
    .optional(),
  type: z.enum(['channel', 'play', 'ads', 'story', 'invite']),
  channel: z
    .string()
    .regex(/^@[A-Za-z0-9_]{4,32}$/)
    .nullable(),
  goal: z.number().int().min(1).max(50),
  reward: z.number().int().min(1).max(10_000),
  on: z.boolean(),
  sort: z.number().int().min(0).max(1000).optional(),
  titleRu: z.string().trim().min(1).max(60).nullable(),
  titleEn: z.string().trim().min(1).max(60).nullable(),
});

export const AdminLinkSchema = z.strictObject({
  code: z
    .string()
    .regex(/^[a-z0-9_]{2,24}$/)
    .refine((code) => !RESERVED_SOURCES.includes(code)),
  title: z.string().trim().min(1).max(60),
});

export const AdminCoinsSchema = z.strictObject({
  delta: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((n) => n !== 0),
});

export const AdminBanSchema = z.strictObject({ banned: z.boolean() });

/** «Проверить» в листе задания: бот - админ этого канала? */
export const AdminChannelSchema = z.strictObject({ channel: z.string().regex(/^@[A-Za-z0-9_]{4,32}$/) });
