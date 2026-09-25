import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Settings {
  stages: { code: string; label: string }[];
  defaultRoute: string[];
  sizeSets: { name: string; sizes: string[] }[];
  categories: string[];
  defectTypes: string[];
  departments: string[];
  positions: string[];
  alerts: { dueSoonDays: number; chequeDays: number; fasonGraceDays: number; wasteRatePct: number };
  workHoursPerDay: number;
}

export interface Me {
  user: { id: string; name: string; email: string; role: string; roleLabel: string; mustChangePassword: boolean };
  tenant: { id: string; name: string };
  permissions: string[];
  settings: Settings;
}

interface Ctx {
  me: Me;
  can: (...perms: string[]) => boolean;
  stageLabel: (code: string) => string;
}

const SessionCtx = createContext<Ctx | null>(null);

export function useMeQuery() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), retry: false, staleTime: 60_000 });
}

export function SessionProvider({ me, children }: { me: Me; children: ReactNode }) {
  const set = new Set(me.permissions);
  const labels = Object.fromEntries(me.settings.stages.map((s) => [s.code, s.label]));
  const value: Ctx = {
    me,
    can: (...perms) => perms.some((p) => set.has(p)),
    stageLabel: (code) => labels[code] ?? code,
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('SessionProvider yok');
  return c;
}
