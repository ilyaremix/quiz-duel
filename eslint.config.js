// ESLint: ошибки, которых не ловит TypeScript, - правила хуков React, лишние переменные и импорты,
// `any`. Оформление - забота Prettier (.prettierrc.json), его правил здесь нет (eslint-config-prettier).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', '**/coverage', 'apps/server/src/generated'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // let { s, now } = …, где меняется только s, - нормально: const для части не разбить.
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    // Классические правила хуков. Правила React Compiler (refs, purity, set-state-in-effect) не включены:
    // компилятор в проекте не используется, а без него эти приёмы (последнее значение в ref для анимации
    // закрытия, Date.now() для таймера) корректны.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  prettier,
);
