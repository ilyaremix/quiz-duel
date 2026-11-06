import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Локально берём переменные из корневого .env; в Docker они уже в окружении.
const rootEnv = resolve(import.meta.dirname, '../../.env');
if (!process.env.DATABASE_URL && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // prisma generate база не нужна, поэтому без DATABASE_URL не падаем;
    // migrate без адреса базы сам выдаст понятную ошибку.
    url: process.env.DATABASE_URL ?? '',
  },
});
