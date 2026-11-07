import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL не задан'),

  BOT_TOKEN: z.string().regex(/^\d+:[\w-]{30,}$/, 'BOT_TOKEN должен быть вида 123456:ABC… из @BotFather'),
  APP_SHORT_NAME: z.string().regex(/^[A-Za-z0-9_]{3,30}$/, 'APP_SHORT_NAME - короткое имя мини-аппа из /newapp'),
  WEB_APP_URL: z.url({ protocol: /^https$/, error: 'WEB_APP_URL должен быть https://…' }),

  /** Сколько секунд initData считается свежим. По ТЗ - не старше 24 часов. */
  INIT_DATA_MAX_AGE_SEC: z.coerce.number().int().positive().default(86_400),
  /**
   * Кому верим в X-Forwarded-For: адреса или подсети через запятую.
   * В docker-compose это подсеть контейнеров (перед сервером стоит Caddy).
   */
  TRUST_PROXY: z.string().default('127.0.0.1'),
  /**
   * Версия Пользовательского соглашения и Политики конфиденциальности.
   * Поменяли тексты - поменяйте версию: игроки снова увидят галочки.
   */
  DOCS_VERSION: z
    .string()
    .regex(/^[\w.-]{1,32}$/)
    // 2026-11-07.2: в документах - монеты, покупки за звёзды, друзья, реклама и статистика (Обновление 2.0).
    .default('2026-11-07.2'),
  /** Адреса документов: страницы в Telegraph на английском (открываются в Telegram через Instant View). */
  TERMS_URL: z.url({ protocol: /^https$/ }).default('https://telegra.ph/Quiz-Duel---Terms-of-Use-11-06'),
  PRIVACY_URL: z.url({ protocol: /^https$/ }).default('https://telegra.ph/Quiz-Duel---Privacy-Policy-11-06'),
  /** Запускать ли бота (в тестах и при локальной вёрстке можно выключить). */
  BOT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * Время последней резервной копии базы (секунды Unix): его пишет сервис backup (deploy/backup.sh)
   * в общую с сервером папку. Нет файла - в /api/health backupAgoSec: null.
   */
  BACKUP_STATUS_FILE: z.string().default('/backups/.last-ok'),
  /** Обновление 2.0: кто видит админку - Telegram id через запятую. Пусто - владелец из автодеплоя. */
  ADMIN_IDS: z.string().default(''),
  DEPLOY_NOTIFY_CHAT_ID: z.string().default(''),
});

/** Админы: ADMIN_IDS, а если пусто - DEPLOY_NOTIFY_CHAT_ID (первый игрок базы - создатель). */
export function adminIdsOf(env: { ADMIN_IDS: string; DEPLOY_NOTIFY_CHAT_ID: string }): Set<number> {
  const list = (env.ADMIN_IDS.trim() || env.DEPLOY_NOTIFY_CHAT_ID.trim())
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[1-9]\d{0,15}$/.test(s));
  return new Set(list.map(Number));
}

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Выводим только имена и причины, без значений: в них есть секреты.
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Неверные переменные окружения:\n${problems}`);
  }
  return parsed.data;
}

/** Origin мини-аппа, единственный, которому открыт CORS. */
export function webOrigin(env: Pick<Env, 'WEB_APP_URL'>): string {
  return new URL(env.WEB_APP_URL).origin;
}

/** Версия и адреса документов для /api/config. */
export function docsInfo(env: Pick<Env, 'DOCS_VERSION' | 'TERMS_URL' | 'PRIVACY_URL'>) {
  return { version: env.DOCS_VERSION, termsUrl: env.TERMS_URL, privacyUrl: env.PRIVACY_URL };
}
