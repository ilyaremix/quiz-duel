/**
 * Обновление 2.0: режим и настройки дуэли - панель вверху шторки выбора темы (раньше - отдельная
 * шторка 32). Помним последний выбор на этом устройстве: следующая дуэль создаётся с ним же,
 * «Сбросить» - назад к Классике 10 × 15 с. Панель раскрыта или свёрнута - тоже помним (до перезапуска).
 */
import { create } from 'zustand';
import { COUNT_OPTIONS, DEFAULT_RULES, TIME_OPTIONS, VARIANTS, type GameRules } from '@quiz-duel/shared';

const KEY = 'qd.rules';

function load(): GameRules {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<GameRules> | null;
    if (
      v &&
      (VARIANTS as readonly string[]).includes(v.variant ?? '') &&
      (TIME_OPTIONS as readonly number[]).includes(v.timeSec ?? 0) &&
      (COUNT_OPTIONS as readonly number[]).includes(v.count ?? 0)
    ) {
      return v as GameRules;
    }
  } catch {
    // нет хранилища - по умолчанию
  }
  return DEFAULT_RULES;
}

interface SetupStore {
  rules: GameRules;
  /** Панель «Режим и настройки» раскрыта. */
  expanded: boolean;
}

export const useSetup = create<SetupStore>(() => ({ rules: load(), expanded: false }));

export const setupActions = {
  toggle() {
    useSetup.setState((s) => ({ expanded: !s.expanded }));
  },
  set(patch: Partial<GameRules>) {
    const rules = { ...useSetup.getState().rules, ...patch };
    useSetup.setState({ rules });
    try {
      localStorage.setItem(KEY, JSON.stringify(rules));
    } catch {
      // не страшно
    }
  },
  reset() {
    setupActions.set(DEFAULT_RULES);
  },
};
