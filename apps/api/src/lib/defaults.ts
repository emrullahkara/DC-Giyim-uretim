// Sektör varsayılanları — her firma Ayarlar ekranından kendi işine göre değiştirir.
export const DEFAULT_SETTINGS = {
  stages: [
    { code: 'KESIM', label: 'Kesim' },
    { code: 'NAKIS', label: 'Nakış' },
    { code: 'BASKI', label: 'Baskı' },
    { code: 'DIKIM', label: 'Dikim' },
    { code: 'ILIK_DUGME', label: 'İlik / Düğme' },
    { code: 'YIKAMA', label: 'Yıkama' },
    { code: 'UTU', label: 'Ütü' },
    { code: 'KALITE', label: 'Kalite Kontrol' },
    { code: 'PAKET', label: 'Paketleme' },
  ],
  defaultRoute: ['KESIM', 'DIKIM', 'UTU', 'KALITE', 'PAKET'],
  sizeSets: [
    { name: 'Harf', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { name: 'Pantolon (bel)', sizes: ['28', '29', '30', '31', '32', '33', '34', '36', '38'] },
    { name: 'Kadın', sizes: ['34', '36', '38', '40', '42', '44', '46'] },
    { name: 'Erkek Takım', sizes: ['46', '48', '50', '52', '54', '56'] },
    { name: 'Çocuk', sizes: ['2-3', '4-5', '6-7', '8-9', '10-11', '12-13'] },
    { name: 'Standart', sizes: ['STD'] },
  ],
  categories: [
    'Pantolon', 'Kot / Denim', 'Gömlek', 'Tişört', 'Sweatshirt', 'Eşofman', 'Elbise', 'Etek', 'Ceket',
    'Takım Elbise', 'Mont', 'Kaban', 'Trençkot', 'Abiye', 'Çocuk', 'İç Giyim', 'İş Elbisesi',
  ],
  defectTypes: [
    'Atlama dikiş', 'Kaçık dikiş', 'Leke', 'Delik / Yırtık', 'Ölçü hatası', 'Renk / ton farkı',
    'Ütü parlaması', 'Etiket hatası', 'İplik ucu', 'Simetri bozukluğu', 'Kumaş hatası',
  ],
  departments: ['Kesimhane', 'Dikimhane', 'Ütü', 'Paketleme', 'Kalite', 'Depo', 'Modelhane', 'İdari'],
  positions: [
    'Makineci', 'Overlokçu', 'Reçmeci', 'Ortacı', 'Kesimci', 'Pastalcı', 'Ütücü', 'Paketçi',
    'Kaliteci', 'Modelist', 'Bant Şefi', 'Temizlikçi',
  ],
  // Uyarı eşikleri
  alerts: {
    dueSoonDays: 3,
    chequeDays: 7,
    fasonGraceDays: 0,
    wasteRatePct: 5,
  },
  workHoursPerDay: 9,
};

export type TenantSettings = typeof DEFAULT_SETTINGS;

export function mergeSettings(raw: unknown): TenantSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<TenantSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    alerts: { ...DEFAULT_SETTINGS.alerts, ...(s.alerts ?? {}) },
  };
}
