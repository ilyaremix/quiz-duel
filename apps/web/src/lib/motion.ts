/**
 * Режим без анимаций. Настройка игрока «Авто / Вкл / Выкл» хранится на сервере (users.reduced_motion).
 * «Авто» включает режим, если в системе стоит «Уменьшить движение» (prefers-reduced-motion)
 * или Telegram на Android пометил устройство как слабое (класс производительности LOW в User-Agent).
 * Режим - это класс qd-rm на <html>: по нему CSS оставляет только мягкие fade (styles.css).
 */
import { create } from 'zustand';
import type { MotionSetting } from '@quiz-duel/shared';

const QUERY = '(prefers-reduced-motion: reduce)';
const KEY = 'qd.motion';

/**
 * Telegram для Android дописывает в User-Agent класс устройства:
 * «Telegram-Android/11.4.2 (Samsung SM-A515F; Android 13; SDK 33; LOW)» - LOW, AVERAGE или HIGH.
 */
export function isLowEndAndroid(userAgent: string): boolean {
  return /Telegram-Android\/[\d.]+\s*\([^)]*;\s*LOW\s*\)/i.test(userAgent);
}

/** Итог: включён ли режим при этой настройке и этом устройстве. */
export function motionReduced(setting: MotionSetting, systemReduce: boolean, lowEnd: boolean): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return systemReduce || lowEnd;
}

function cached(): MotionSetting {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

interface MotionStore {
  setting: MotionSetting;
  system: boolean;
  lowEnd: boolean;
}

const media = typeof window !== 'undefined' ? window.matchMedia?.(QUERY) : undefined;

export const useMotion = create<MotionStore>(() => ({
  // До ответа сервера - настройка с прошлого входа, чтобы анимации не мигнули.
  setting: cached(),
  system: media?.matches ?? false,
  lowEnd: typeof navigator !== 'undefined' && isLowEndAndroid(navigator.userAgent),
}));

const reducedNow = (s: MotionStore) => motionReduced(s.setting, s.system, s.lowEnd);

function apply(s: MotionStore) {
  document.documentElement.classList.toggle('qd-rm', reducedNow(s));
}

if (typeof document !== 'undefined') {
  apply(useMotion.getState());
  useMotion.subscribe(apply);
  media?.addEventListener('change', () => useMotion.setState({ system: media.matches }));
}

/** Настройка пришла с сервера или игрок поменял её в настройках. */
export function setMotionSetting(setting: MotionSetting) {
  useMotion.setState({ setting });
  try {
    localStorage.setItem(KEY, setting);
  } catch {
    // Без хранилища просто подождём /api/me при следующем входе.
  }
}

/** Включён ли сейчас режим без анимаций - для анимаций, которые рисует код (счётчики, таймер). */
export function useReducedMotion(): boolean {
  return useMotion(reducedNow);
}

/** Что даст «Авто» на этом устройстве (подсказка в настройках). */
export function useAutoReduced(): boolean {
  return useMotion((s) => s.system || s.lowEnd);
}
