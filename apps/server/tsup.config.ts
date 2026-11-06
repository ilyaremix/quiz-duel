import { defineConfig } from 'tsup';

// Сервер собирается в один файл dist/index.js. Общий пакет @quiz-duel/shared
// хранится как исходники TypeScript, поэтому его встраиваем в сборку;
// остальные зависимости остаются в node_modules.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@quiz-duel/shared'],
});
