import type { Role } from '@prisma/client';

// Tüm yetkiler. Kod içinde yetki kontrolü YALNIZCA bu listeden yapılır.
export const PERMISSIONS = [
  'panel:gor',
  'cari:gor', 'cari:yaz',
  'model:gor', 'model:yaz',
  'siparis:gor', 'siparis:yaz',
  'uretim:gor', 'uretim:yaz', 'uretim:kayit',
  'fason:gor', 'fason:yaz',
  'depo:gor', 'depo:yaz',
  'mamul:gor', 'mamul:yaz',
  'kalite:gor', 'kalite:yaz',
  'personel:gor', 'personel:yaz', 'personel:hassas', 'puantaj:yaz',
  'finans:gor', 'finans:yaz',
  'fiyat:gor',
  'rapor:gor',
  'gorev:gor', 'gorev:yaz',
  'ayar:yonet', 'denetim:gor',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SAHIP: ALL,
  YONETICI: ALL.filter((p) => p !== 'ayar:yonet' && p !== 'denetim:gor'),
  MUHASEBE: [
    'panel:gor', 'cari:gor', 'cari:yaz', 'siparis:gor', 'fason:gor', 'mamul:gor', 'depo:gor',
    'personel:gor', 'personel:hassas', 'finans:gor', 'finans:yaz', 'fiyat:gor', 'rapor:gor',
    'gorev:gor', 'gorev:yaz',
  ],
  URETIM_SEFI: [
    'panel:gor', 'cari:gor', 'model:gor', 'model:yaz', 'siparis:gor', 'uretim:gor', 'uretim:yaz',
    'uretim:kayit', 'fason:gor', 'fason:yaz', 'depo:gor', 'mamul:gor', 'mamul:yaz', 'kalite:gor',
    'kalite:yaz', 'personel:gor', 'puantaj:yaz', 'rapor:gor', 'gorev:gor', 'gorev:yaz',
  ],
  DEPOCU: [
    'panel:gor', 'cari:gor', 'model:gor', 'siparis:gor', 'uretim:gor', 'fason:gor', 'depo:gor',
    'depo:yaz', 'mamul:gor', 'mamul:yaz', 'gorev:gor',
  ],
  KALITECI: ['panel:gor', 'model:gor', 'uretim:gor', 'uretim:kayit', 'kalite:gor', 'kalite:yaz', 'gorev:gor'],
  OPERATOR: ['model:gor', 'uretim:gor', 'uretim:kayit', 'gorev:gor'],
};

export const ROLE_LABELS: Record<Role, string> = {
  SAHIP: 'Firma Sahibi',
  YONETICI: 'Yönetici',
  MUHASEBE: 'Muhasebe',
  URETIM_SEFI: 'Üretim / Atölye Şefi',
  DEPOCU: 'Depo Sorumlusu',
  KALITECI: 'Kalite Kontrol',
  OPERATOR: 'Bant / Operatör',
};

export function permissionsOf(role: Role): Set<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

// Fiyat/maliyet alanları: 'fiyat:gor' yetkisi olmayanlara gönderilmez.
export const PRICE_KEYS = new Set([
  'unitPrice', 'salePrice', 'overheadPct', 'pieceRate', 'rate', 'cost', 'costs', 'amount',
  'totalAmount', 'earnings', 'revenue', 'balance', 'unitCost', 'margin', 'materialCost', 'laborCost', 'receivable', 'payable',
]);
// Personelin hassas alanları: 'personel:hassas' olmadan gönderilmez.
export const SENSITIVE_EMPLOYEE_KEYS = new Set(['nationalId', 'iban', 'wage']);
