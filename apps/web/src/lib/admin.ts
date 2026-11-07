/**
 * Обновление 2.0: админка. Открывается из «Настроек» (видят только админы) или по ссылке
 * startapp=admin из команды /admin у бота. Раздел и период живут здесь, данные - в TanStack Query.
 */
import { create } from 'zustand';
import type { AdminPeriod, AdminPlayerRow, AdminTask } from '@quiz-duel/shared';
import { scrollToTop } from './telegram';
import { track } from './track';

export const ADMIN_TABS = ['overview', 'retention', 'events', 'sources', 'money', 'tasks', 'players'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];
export const PERIODS: readonly AdminPeriod[] = [7, 30, 90];

/** Какая шторка открыта поверх раздела. */
export type AdminSheet = { kind: 'task'; task: AdminTask | null } | { kind: 'link' } | { kind: 'player'; player: AdminPlayerRow } | null;

interface AdminStore {
  open: boolean;
  tab: AdminTab;
  days: AdminPeriod;
  sheet: AdminSheet;
}

export const useAdmin = create<AdminStore>(() => ({ open: false, tab: 'overview', days: 30, sheet: null }));

export const adminKeys = {
  all: ['admin'] as const,
  overview: (days: AdminPeriod) => ['admin', 'overview', days] as const,
  retention: ['admin', 'retention'] as const,
  events: (days: AdminPeriod) => ['admin', 'events', days] as const,
  sources: (days: AdminPeriod) => ['admin', 'sources', days] as const,
  money: (days: AdminPeriod) => ['admin', 'money', days] as const,
  tasks: ['admin', 'tasks'] as const,
  players: (q: string, filter: string) => ['admin', 'players', q, filter] as const,
  player: (id: number) => ['admin', 'player', id] as const,
};

export const adminActions = {
  open() {
    if (useAdmin.getState().open) return;
    useAdmin.setState({ open: true, sheet: null });
    track('admin');
    scrollToTop();
  },
  close() {
    useAdmin.setState({ open: false, sheet: null });
  },
  setTab(tab: AdminTab) {
    useAdmin.setState({ tab, sheet: null });
    scrollToTop();
  },
  setDays(days: AdminPeriod) {
    useAdmin.setState({ days });
  },
  openSheet(sheet: AdminSheet) {
    useAdmin.setState({ sheet });
  },
  closeSheet() {
    useAdmin.setState({ sheet: null });
  },
};
