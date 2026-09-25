export const ORDER_STATUS: Record<string, string> = {
  TASLAK: 'Taslak', ONAYLANDI: 'Onaylandı', URETIMDE: 'Üretimde', KISMI_SEVK: 'Kısmi sevk', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal',
};
export const ORDER_TYPE: Record<string, string> = { SATIS: 'Mağaza satışı', FASON_ALINAN: 'Marka fason işi' };
export const WO_STATUS: Record<string, string> = { PLANLANDI: 'Planlandı', DEVAM: 'Devam ediyor', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal' };
export const STAGE_STATUS: Record<string, string> = { BEKLIYOR: 'Bekliyor', DEVAM: 'Devam', TAMAM: 'Tamam' };
export const FASON_STATUS: Record<string, string> = { GONDERILDI: 'Gönderildi', KISMI_DONDU: 'Kısmi döndü', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal' };
export const PARTY_ROLE: Record<string, string> = { MUSTERI: 'Müşteri', TEDARIKCI: 'Tedarikçi', FASONCU: 'Fasoncu' };
export const MATERIAL_TYPE: Record<string, string> = { KUMAS: 'Kumaş', ASTAR: 'Astar', AKSESUAR: 'Aksesuar', IPLIK: 'İplik', ETIKET: 'Etiket', AMBALAJ: 'Ambalaj', DIGER: 'Diğer' };
export const UNITS: Record<string, string> = { METRE: 'Metre', KG: 'Kg', ADET: 'Adet', TOP: 'Top', PAKET: 'Paket', KONI: 'Koni', DUZINE: 'Düzine' };
export const MOVEMENT_TYPE: Record<string, string> = { GIRIS: 'Giriş', CIKIS: 'Çıkış', IADE: 'İade', SAYIM: 'Sayım', FIRE: 'Fire', FASONA_CIKIS: 'Fasona çıkış' };
export const MODEL_STATUS: Record<string, string> = { NUMUNE: 'Numune', ONAYLI: 'Onaylı', URETIMDE: 'Üretimde', ARSIV: 'Arşiv' };
export const WAGE_TYPE: Record<string, string> = { AYLIK: 'Aylık maaş', GUNLUK: 'Yevmiye (günlük)', PARCA_BASI: 'Parça başı' };
export const ATTENDANCE: Record<string, string> = { GELDI: 'Geldi', YARIM_GUN: 'Yarım gün', GELMEDI: 'Gelmedi', IZINLI: 'İzinli', RAPORLU: 'Raporlu' };
export const TX_TYPE: Record<string, string> = { SATIS_FATURASI: 'Satış faturası', ALIS_FATURASI: 'Alış faturası', FASON_FATURASI: 'Fason faturası', TAHSILAT: 'Tahsilat', ODEME: 'Ödeme' };
export const PAY_METHOD: Record<string, string> = { NAKIT: 'Nakit', HAVALE: 'Havale/EFT', CEK: 'Çek', SENET: 'Senet', KREDI_KARTI: 'Kredi kartı', DIGER: 'Diğer' };
export const CHEQUE_STATUS: Record<string, string> = { PORTFOYDE: 'Portföyde', CIRO_EDILDI: 'Ciro edildi', TAHSIL_EDILDI: 'Tahsil edildi', ODENDI: 'Ödendi', KARSILIKSIZ: 'Karşılıksız', IADE: 'İade' };
export const RISK: Record<string, { label: string; tone: Tone }> = {
  GECIKTI: { label: 'Gecikti', tone: 'red' },
  RISKLI: { label: 'Riskli', tone: 'amber' },
  YAKIN: { label: 'Termin yakın', tone: 'blue' },
  NORMAL: { label: 'Yolunda', tone: 'green' },
  KAPALI: { label: 'Kapalı', tone: 'gray' },
};
export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'brand';

export const statusTone = (s: string): Tone =>
  ({
    TASLAK: 'gray', ONAYLANDI: 'blue', URETIMDE: 'violet', KISMI_SEVK: 'amber', TAMAMLANDI: 'green', IPTAL: 'gray',
    PLANLANDI: 'blue', DEVAM: 'violet', BEKLIYOR: 'gray', TAMAM: 'green',
    GONDERILDI: 'blue', KISMI_DONDU: 'amber',
    PORTFOYDE: 'blue', CIRO_EDILDI: 'violet', TAHSIL_EDILDI: 'green', ODENDI: 'green', KARSILIKSIZ: 'red', IADE: 'gray',
    NUMUNE: 'amber', ONAYLI: 'blue', ARSIV: 'gray',
  } as Record<string, Tone>)[s] ?? 'gray';
