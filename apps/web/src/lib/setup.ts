/**
 * Обновление 2.0: режим и настройки дуэли (шторка 32). Помним последний выбор на этом устройстве:
 * следующая дуэль создаётся с ним же, «Сбросить» - назад к Классике 10 × 15 с.
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
  open: boolean;
}

export const useSetup = create<SetupStore>(() => ({ rules: load(), open: false }));

export const setupActions = {
  open() {
    useSetup.setState({ open: true });
  },
  close() {
    useSetup.setState({ open: false });
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
