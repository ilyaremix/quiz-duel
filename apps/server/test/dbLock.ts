/**
 * Тесты на настоящем Postgres чистят общие таблицы, поэтому файлы с ними идут по очереди:
 * каждый держит advisory-блокировку на своём соединении, пока не закончится.
 * Остальные тесты (без базы) при этом идут параллельно.
 */
import pg from 'pg';

export async function lockDb(url: string): Promise<() => Promise<void>> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('SELECT pg_advisory_lock(424242)');
  return async () => {
    await client.query('SELECT pg_advisory_unlock(424242)').catch(() => undefined);
    await client.end().catch(() => undefined);
  };
}
