import { readFile } from 'node:fs/promises';

/**
 * Когда сделана последняя резервная копия базы (мс). Сервис backup (deploy/backup.sh) после каждой
 * удачной копии пишет в файл время в секундах Unix. Нет файла или в нём не число - null.
 */
export async function lastBackupAt(file: string): Promise<number | null> {
  try {
    const sec = Number((await readFile(file, 'utf8')).trim());
    return Number.isFinite(sec) && sec > 0 ? sec * 1000 : null;
  } catch {
    return null;
  }
}
