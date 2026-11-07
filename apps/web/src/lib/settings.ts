/**
 * Настройки игрока. Хранятся на сервере (POST /api/settings) и приходят в /api/me,
 * поэтому действуют на всех устройствах. Экран меняется сразу (без перезагрузки),
 * а если сервер не принял изменение - возвращается как было, с тостом.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { MeResponse, SettingsRequest } from '@quiz-duel/shared';
import { api } from './api';
import { showToast } from './game';

/** Что поменяется у игрока сразу, до ответа сервера. */
export function optimistic(me: MeResponse, patch: SettingsRequest): MeResponse {
  const next = { ...me };
  if (patch.notifications !== undefined) next.notifications = patch.notifications;
  if (patch.language !== undefined) {
    next.language = patch.language;
    next.lang = patch.language === 'auto' ? me.autoLang : patch.language;
  }
  if (patch.reducedMotion !== undefined) next.reducedMotion = patch.reducedMotion;
  return next;
}

let seq = 0;

export async function saveSettings(queryClient: QueryClient, patch: SettingsRequest): Promise<boolean> {
  const before = queryClient.getQueryData<MeResponse>(['me']);
  if (!before) return false;
  const mine = ++seq;
  queryClient.setQueryData<MeResponse>(['me'], optimistic(before, patch));
  try {
    const saved = await api.settings(patch);
    // Пока ждали, игрок мог переключить ещё раз - последнее нажатие главнее.
    if (mine === seq) queryClient.setQueryData<MeResponse>(['me'], (prev) => (prev ? { ...prev, ...saved } : prev));
    return true;
  } catch {
    if (mine === seq) {
      queryClient.setQueryData<MeResponse>(['me'], (prev) => (prev ? { ...prev, ...pick(before, patch) } : prev));
      showToast('error', 'toast.settingsFailed');
    }
    return false;
  }
}

/** Прежние значения только тех полей, что меняли. */
export function pick(me: MeResponse, patch: SettingsRequest): Partial<MeResponse> {
  const out: Partial<MeResponse> = {};
  if (patch.notifications !== undefined) out.notifications = me.notifications;
  if (patch.language !== undefined) {
    out.language = me.language;
    out.lang = me.lang;
  }
  if (patch.reducedMotion !== undefined) out.reducedMotion = me.reducedMotion;
  return out;
}
