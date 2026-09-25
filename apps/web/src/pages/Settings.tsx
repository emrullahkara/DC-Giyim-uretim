import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Copy, KeyRound, Lock, Plus, Save, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession, type Settings as TenantSettings } from '@/lib/session';
import { fmtDateTime } from '@/lib/format';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, SearchBox, Table, Tabs, cx, useConfirm, type Column } from '@/components/ui';

type Tab = 'firma' | 'kullanicilar' | 'yetki' | 'denetim';

interface UserRow { id: string; email: string; name: string; role: string; active: boolean; lastLoginAt?: string | null; createdAt: string; mustChangePassword: boolean; lockedUntil?: string | null }
interface RoleRow { role: string; label: string; permissions: string[] }
interface AuditRow { id: string; userName?: string | null; action: string; entity: string; entityId?: string | null; ip?: string | null; createdAt: string; meta?: unknown }

const PERMISSION_LABELS: Record<string, string> = {
  'panel:gor': 'Kontrol kulesini (ana panel) görme',
  'cari:gor': 'Müşteri, tedarikçi ve fasoncu kartlarını görme',
  'cari:yaz': 'Cari kart ekleme ve düzenleme',
  'model:gor': 'Model kartlarını ve reçeteleri görme',
  'model:yaz': 'Model ekleme, reçete ve operasyon düzenleme',
  'siparis:gor': 'Siparişleri görme',
  'siparis:yaz': 'Sipariş açma ve düzenleme',
  'uretim:gor': 'İş emirlerini ve atölye panosunu görme',
  'uretim:yaz': 'İş emri açma, termin ve rota düzenleme',
  'uretim:kayit': 'Aşama üretim kaydı (adet/fire) girme',
  'fason:gor': 'Fason işlerini ve fasoncu karnesini görme',
  'fason:yaz': 'Fasona iş gönderme, dönüş girme, kapatma',
  'depo:gor': 'Kumaş ve malzeme stoğunu görme',
  'depo:yaz': 'Kumaş/malzeme giriş-çıkış ve sayım yapma',
  'mamul:gor': 'Mamul stoğunu ve sevkiyatları görme',
  'mamul:yaz': 'Mamul girişi ve sevkiyat yapma',
  'kalite:gor': 'Kalite kontrol kayıtlarını görme',
  'kalite:yaz': 'Kalite kontrol kaydı girme ve silme',
  'personel:gor': 'Personel listesini ve puantajı görme',
  'personel:yaz': 'Personel ekleme ve düzenleme',
  'personel:hassas': 'TC kimlik, IBAN ve ücret bilgilerini görme',
  'puantaj:yaz': 'Günlük puantaj (devam) girme',
  'finans:gor': 'Cari hesap, tahsilat, ödeme ve çekleri görme',
  'finans:yaz': 'Fatura, tahsilat, ödeme ve çek kaydı girme',
  'fiyat:gor': 'Fiyat, maliyet ve tutarları görme',
  'rapor:gor': 'Raporları görme ve dışa aktarma',
  'gorev:gor': 'Görevleri görme',
  'gorev:yaz': 'Görev atama ve düzenleme',
  'ayar:yonet': 'Firma ayarları ve kullanıcı yönetimi',
  'denetim:gor': 'Denetim kaydını (kim ne yaptı) görme',
};

const PERMISSION_GROUPS: { title: string; perms: string[] }[] = [
  { title: 'Genel', perms: ['panel:gor', 'rapor:gor', 'gorev:gor', 'gorev:yaz'] },
  { title: 'Sipariş & model', perms: ['siparis:gor', 'siparis:yaz', 'model:gor', 'model:yaz', 'cari:gor', 'cari:yaz'] },
  { title: 'Üretim', perms: ['uretim:gor', 'uretim:yaz', 'uretim:kayit', 'fason:gor', 'fason:yaz', 'kalite:gor', 'kalite:yaz'] },
  { title: 'Depo', perms: ['depo:gor', 'depo:yaz', 'mamul:gor', 'mamul:yaz'] },
  { title: 'Personel', perms: ['personel:gor', 'personel:yaz', 'personel:hassas', 'puantaj:yaz'] },
  { title: 'Finans', perms: ['finans:gor', 'finans:yaz', 'fiyat:gor'] },
  { title: 'Yönetim', perms: ['ayar:yonet', 'denetim:gor'] },
];

const ROLE_DESC: Record<string, string> = {
  SAHIP: 'Her şeyi görür ve yönetir; kullanıcı, ayar ve denetim kaydı dahil.',
  YONETICI: 'Fiyatlar ve finans dahil tüm işleri yürütür; ayarlara ve denetim kaydına erişemez.',
  MUHASEBE: 'Cari, finans, çek, fiyat ve personel ücretlerini görür; üretime müdahale etmez.',
  URETIM_SEFI: 'Sipariş, iş emri, fason, kalite ve puantajı yönetir; fiyat ve finansı görmez.',
  DEPOCU: 'Kumaş/malzeme ve mamul depo hareketleri, sevkiyat; fiyat görmez.',
  KALITECI: 'Kalite kontrol kayıtları ve aşama üretim kaydı girer.',
  OPERATOR: 'Yalnızca iş emirlerini görür ve üretim kaydı girer.',
};

const ACTION_LABELS: Record<string, string> = {
  GIRIS: 'Giriş yaptı', GIRIS_BASARISIZ: 'Hatalı giriş denemesi', CIKIS: 'Çıkış yaptı', SIFRE_DEGISTI: 'Şifre değiştirdi', SIFRE_SIFIRLA: 'Şifre sıfırlandı',
  KULLANICI_EKLE: 'Kullanıcı ekledi', KULLANICI_GUNCELLE: 'Kullanıcı güncelledi', AYAR_GUNCELLE: 'Ayarları güncelledi',
  FASON_GONDER: 'Fasona iş gönderdi', FASON_DONUS: 'Fason dönüşü girdi', FASON_KAPAT: 'Fason işini eksikle kapattı', FASON_IPTAL: 'Fason işini iptal etti', FASON_GUNCELLE: 'Fason işini güncelledi',
  KALITE_KAYIT: 'Kalite kaydı girdi', KALITE_SIL: 'Kalite kaydı sildi', IS_EMRI_EKLE: 'İş emri açtı', IS_EMRI_GUNCELLE: 'İş emri güncelledi',
};
const ENTITY_LABELS: Record<string, string> = {
  User: 'Kullanıcı', Tenant: 'Firma', FasonJob: 'Fason işi', QualityCheck: 'Kalite kaydı', WorkOrder: 'İş emri', Order: 'Sipariş', Party: 'Cari',
  StyleModel: 'Model', Material: 'Malzeme', Shipment: 'Sevkiyat', Employee: 'Personel', Transaction: 'Finans hareketi', Cheque: 'Çek', Task: 'Görev',
};
const actionLabel = (a: string) => ACTION_LABELS[a] ?? a.toLocaleLowerCase('tr').replace(/_/g, ' ').replace(/^./, (c) => c.toLocaleUpperCase('tr'));

const TR_MAP: Record<string, string> = { ç: 'C', Ç: 'C', ğ: 'G', Ğ: 'G', ı: 'I', I: 'I', İ: 'I', i: 'I', ö: 'O', Ö: 'O', ş: 'S', Ş: 'S', ü: 'U', Ü: 'U' };
const stageCode = (label: string) =>
  label
    .replace(/[çÇğĞıIİiöÖşŞüÜ]/g, (c) => TR_MAP[c] ?? c)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20) || 'ASAMA';

export default function SettingsPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<Tab>('firma');
  const tabs: { value: Tab; label: string }[] = [
    { value: 'firma', label: 'Firma & üretim' },
    { value: 'kullanicilar', label: 'Kullanıcılar' },
    { value: 'yetki', label: 'Yetki tablosu' },
  ];
  if (can('denetim:gor')) tabs.push({ value: 'denetim', label: 'Denetim kaydı' });
  return (
    <div>
      <PageHeader title="Ayarlar" subtitle="Firma bilgileri, üretim aşamaları, kullanıcılar ve yetkiler" />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'firma' && <CompanyTab />}
      {tab === 'kullanicilar' && <UsersTab />}
      {tab === 'yetki' && <PermissionsTab />}
      {tab === 'denetim' && can('denetim:gor') && <AuditTab />}
    </div>
  );
}

// ───────────────────────── Firma & üretim
function ChipList({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean).filter((s) => !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-ink-100 py-1 pl-2.5 pr-1 text-xs font-medium text-ink-800">
            {v}
            <button type="button" className="rounded p-0.5 text-ink-400 hover:bg-ink-200 hover:text-red-600" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`${v} sil`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        {!value.length && <span className="text-xs text-ink-400">Liste boş</span>}
      </div>
      <div className="flex gap-2">
        <input className="input" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={placeholder} />
        <button type="button" className="btn-outline" onClick={add} disabled={!text.trim()}>
          <Plus className="size-4" /> Ekle
        </button>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, hint, min, max, step }: { label: string; value: number; onChange: (n: number) => void; hint?: ReactNode; min: number; max: number; step?: number }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input num" type="number" min={min} max={max} step={step ?? 1} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
    </Field>
  );
}

function CompanyTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<{ name: string; settings: TenantSettings }>('/admin/settings') });
  const [name, setName] = useState('');
  const [s, setS] = useState<TenantSettings | null>(null);
  const [sizeText, setSizeText] = useState<string[]>([]);
  const [newStage, setNewStage] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (data) {
      setName(data.name);
      setS(structuredClone(data.settings));
      setSizeText(data.settings.sizeSets.map((x) => x.sizes.join(', ')));
    }
  }, [data]);

  const save = useAction(
    (body: { name: string; settings: TenantSettings }) => api.put('/admin/settings', body),
    { success: 'Ayarlar kaydedildi.', invalidate: [['admin-settings']], onDone: () => qc.invalidateQueries({ queryKey: ['me'] }) },
  );

  if (isLoading || (!s && !error)) return <Loading />;
  if (error || !s) return <ErrorBox error={error} />;

  const up = (patch: Partial<TenantSettings>) => setS({ ...s, ...patch });
  const codes = new Set(s.stages.map((x) => x.code));

  const addStage = () => {
    const label = newStage.trim();
    if (!label) return;
    let code = stageCode(label);
    if (code.length < 2) code = `${code}_1`;
    let i = 2;
    const base = code.slice(0, 17);
    while (codes.has(code)) code = `${base}_${i++}`;
    up({ stages: [...s.stages, { code, label }] });
    setNewStage('');
  };
  const moveStage = (i: number, d: -1 | 1) => {
    const arr = [...s.stages];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    up({ stages: arr });
  };
  const removeStage = (code: string) => up({ stages: s.stages.filter((x) => x.code !== code), defaultRoute: s.defaultRoute.filter((c) => c !== code) });

  const moveRoute = (i: number, d: -1 | 1) => {
    const arr = [...s.defaultRoute];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    up({ defaultRoute: arr });
  };

  const submit = () => {
    setErr('');
    const sizeSets = s.sizeSets.map((x, i) => ({ name: x.name.trim(), sizes: (sizeText[i] ?? '').split(',').map((z) => z.trim()).filter(Boolean) }));
    if (name.trim().length < 2) return setErr('Firma adı en az 2 karakter olmalı.');
    if (!s.stages.length) return setErr('En az bir üretim aşaması tanımlayın.');
    if (s.stages.some((x) => !x.label.trim())) return setErr('Aşama adları boş olamaz.');
    if (sizeSets.some((x) => !x.name || !x.sizes.length)) return setErr('Her beden setinin adı ve en az bir bedeni olmalı.');
    const a = s.alerts;
    if ([a.dueSoonDays, a.chequeDays, a.fasonGraceDays, a.wasteRatePct, s.workHoursPerDay].some((n) => !Number.isFinite(n))) return setErr('Uyarı eşiklerini ve günlük çalışma saatini doldurun.');
    const settings: TenantSettings = {
      ...s,
      stages: s.stages.map((x) => ({ code: x.code, label: x.label.trim() })),
      defaultRoute: s.defaultRoute.filter((c) => codes.has(c)),
      sizeSets,
      alerts: { dueSoonDays: Math.round(a.dueSoonDays), chequeDays: Math.round(a.chequeDays), fasonGraceDays: Math.round(a.fasonGraceDays), wasteRatePct: a.wasteRatePct },
    };
    save.mutate({ name: name.trim(), settings });
  };

  const lists: { key: 'categories' | 'defectTypes' | 'departments' | 'positions'; title: string; sub: string; ph: string }[] = [
    { key: 'categories', title: 'Ürün kategorileri', sub: 'Model kartında seçilir', ph: 'Örn. Pantolon, Gömlek (virgülle çoklu)' },
    { key: 'defectTypes', title: 'Hata tipleri', sub: 'Kalite kontrol kayıtlarında kullanılır', ph: 'Örn. Atlama dikiş' },
    { key: 'departments', title: 'Bölümler', sub: 'Personel kartında seçilir', ph: 'Örn. Dikimhane' },
    { key: 'positions', title: 'Görevler / pozisyonlar', sub: 'Personel kartında seçilir', ph: 'Örn. Overlokçu' },
  ];

  return (
    <div className="space-y-5">
      <Card title="Firma">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Firma adı" required>
            <input className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <NumField label="Günlük çalışma saati" value={s.workHoursPerDay} min={1} max={24} step={0.5} onChange={(n) => up({ workHoursPerDay: n })} hint="Kapasite ve verim hesaplarında kullanılır" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Üretim aşamaları" subtitle="Atölyenizdeki iş akışı; sıralama ekranlarda bu sırayla görünür">
          <ul className="space-y-1.5">
            {s.stages.map((st, i) => (
              <li key={st.code} className="flex items-center gap-2 rounded-xl bg-ink-50 px-2 py-1.5 ring-1 ring-ink-200/60">
                <span className="num w-5 text-center text-xs font-bold text-ink-400">{i + 1}</span>
                <input className="input py-1" value={st.label} maxLength={40} onChange={(e) => up({ stages: s.stages.map((x) => (x.code === st.code ? { ...x, label: e.target.value } : x)) })} />
                <code className="hidden shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] text-ink-500 ring-1 ring-ink-200 sm:block">{st.code}</code>
                <button type="button" className="btn-ghost btn-sm px-1.5" disabled={i === 0} onClick={() => moveStage(i, -1)} aria-label="Yukarı"><ArrowUp className="size-3.5" /></button>
                <button type="button" className="btn-ghost btn-sm px-1.5" disabled={i === s.stages.length - 1} onClick={() => moveStage(i, 1)} aria-label="Aşağı"><ArrowDown className="size-3.5" /></button>
                <button type="button" className="btn-ghost btn-sm px-1.5 text-red-600" onClick={() => removeStage(st.code)} aria-label="Sil"><Trash2 className="size-3.5" /></button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="Yeni aşama adı (örn. Taşlama)" maxLength={40} value={newStage} onChange={(e) => setNewStage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }} />
            <button type="button" className="btn-outline" onClick={addStage} disabled={!newStage.trim()}><Plus className="size-4" /> Ekle</button>
          </div>
          {newStage.trim() && <p className="mt-1 text-[11px] text-ink-500">Kod: <code>{stageCode(newStage)}</code></p>}
          <p className="mt-2 text-[11px] text-ink-500">Aşama kodu kayıtlarda kullanılır; mevcut iş emirlerinde kullanılan bir aşamayı silmek yerine adını değiştirin.</p>
        </Card>

        <Card title="Varsayılan rota" subtitle="Yeni iş emri açılırken (modelde rota yoksa) izlenecek aşamalar">
          <ol className="space-y-1.5">
            {s.defaultRoute.map((c, i) => (
              <li key={c} className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-1.5 ring-1 ring-brand-200">
                <span className="num text-xs font-bold text-brand-600">{i + 1}.</span>
                <span className="flex-1 text-sm font-semibold text-brand-900">{s.stages.find((x) => x.code === c)?.label ?? c}</span>
                <button type="button" className="btn-ghost btn-sm px-1.5" disabled={i === 0} onClick={() => moveRoute(i, -1)} aria-label="Yukarı"><ArrowUp className="size-3.5" /></button>
                <button type="button" className="btn-ghost btn-sm px-1.5" disabled={i === s.defaultRoute.length - 1} onClick={() => moveRoute(i, 1)} aria-label="Aşağı"><ArrowDown className="size-3.5" /></button>
                <button type="button" className="btn-ghost btn-sm px-1.5 text-red-600" onClick={() => up({ defaultRoute: s.defaultRoute.filter((x) => x !== c) })} aria-label="Çıkar"><X className="size-3.5" /></button>
              </li>
            ))}
            {!s.defaultRoute.length && <li className="text-sm text-ink-500">Rota boş — aşağıdan ekleyin.</li>}
          </ol>
          <div className="mt-3">
            <span className="label">Rotaya ekle</span>
            <div className="flex flex-wrap gap-1.5">
              {s.stages.filter((x) => !s.defaultRoute.includes(x.code)).map((x) => (
                <button key={x.code} type="button" className="btn-outline btn-sm" onClick={() => up({ defaultRoute: [...s.defaultRoute, x.code] })}>
                  <Plus className="size-3" /> {x.label}
                </button>
              ))}
              {s.stages.every((x) => s.defaultRoute.includes(x.code)) && <span className="text-xs text-ink-400">Tüm aşamalar rotada</span>}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Beden setleri" subtitle="Model ve siparişte asorti girişi için; bedenleri virgülle ayırın" actions={<button type="button" className="btn-outline btn-sm" onClick={() => { up({ sizeSets: [...s.sizeSets, { name: '', sizes: [] }] }); setSizeText([...sizeText, '']); }}><Plus className="size-3.5" /> Set ekle</button>}>
        <div className="space-y-2">
          {s.sizeSets.map((set, i) => (
            <div key={i} className="grid items-center gap-2 sm:grid-cols-[200px_1fr_auto]">
              <input className="input" placeholder="Set adı" maxLength={40} value={set.name} onChange={(e) => up({ sizeSets: s.sizeSets.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input className="input" placeholder="S, M, L, XL" value={sizeText[i] ?? ''} onChange={(e) => setSizeText(sizeText.map((t, j) => (j === i ? e.target.value : t)))} />
              <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => { up({ sizeSets: s.sizeSets.filter((_, j) => j !== i) }); setSizeText(sizeText.filter((_, j) => j !== i)); }} aria-label="Sil">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {!s.sizeSets.length && <p className="text-sm text-ink-500">Beden seti yok.</p>}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {lists.map((l) => (
          <Card key={l.key} title={l.title} subtitle={l.sub}>
            <ChipList value={s[l.key]} onChange={(v) => up({ [l.key]: v } as Partial<TenantSettings>)} placeholder={l.ph} />
          </Card>
        ))}
      </div>

      <Card title="Uyarı eşikleri" subtitle="Kontrol kulesindeki alarmlar bu değerlere göre çalışır">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumField label="Termin yaklaşıyor uyarısı (gün)" value={s.alerts.dueSoonDays} min={1} max={60} onChange={(n) => up({ alerts: { ...s.alerts, dueSoonDays: n } })} hint="Termine bu kadar gün kala uyar" />
          <NumField label="Çek vadesi uyarısı (gün)" value={s.alerts.chequeDays} min={1} max={90} onChange={(n) => up({ alerts: { ...s.alerts, chequeDays: n } })} hint="Vadesi yaklaşan çekler" />
          <NumField label="Fason gecikme toleransı (gün)" value={s.alerts.fasonGraceDays} min={0} max={30} onChange={(n) => up({ alerts: { ...s.alerts, fasonGraceDays: n } })} hint="Terminden sonra kaç gün beklensin" />
          <NumField label="Fire oranı eşiği (%)" value={s.alerts.wasteRatePct} min={0} max={100} step={0.5} onChange={(n) => up({ alerts: { ...s.alerts, wasteRatePct: n } })} hint="Bu oranı aşan fire uyarılır" />
        </div>
      </Card>

      {err && <ErrorBox error={new Error(err)} />}
      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
        <button className="btn-primary shadow-pop" onClick={submit} disabled={save.isPending}>
          <Save className="size-4" /> {save.isPending ? 'Kaydediliyor…' : 'Ayarları kaydet'}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── Kullanıcılar
function TempPasswordBox({ pw, who }: { pw: string; who: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* pano erişimi yoksa kullanıcı elle kopyalar */
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-700"><b>{who}</b> için geçici şifre:</p>
      <div className="flex items-center gap-2 rounded-2xl bg-thread-50 p-3 ring-2 ring-thread-300">
        <code className="flex-1 select-all break-all font-mono text-xl font-bold tracking-wider text-ink-900">{pw}</code>
        <button type="button" className="btn-accent btn-sm" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
      </div>
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>Bu şifre bir daha gösterilmeyecek; kullanıcı ilk girişte değiştirecek. Şifreyi kullanıcıya güvenli bir yoldan (yüz yüze, telefon) iletin.</span>
      </div>
    </div>
  );
}

function UsersTab() {
  const { me } = useSession();
  const isOwner = me.user.role === 'SAHIP';
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<UserRow[]>('/admin/users') });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api.get<RoleRow[]>('/admin/roles') });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [shownPw, setShownPw] = useState<{ pw: string; who: string } | null>(null);
  const { confirm, node } = useConfirm();
  const roleLabel = (r: string) => roles.data?.find((x) => x.role === r)?.label ?? r;

  const reset = useAction((u: UserRow) => api.post<{ tempPassword: string }>(`/admin/users/${u.id}/reset-password`).then((r) => ({ ...r, who: u.name })), {
    invalidate: [['admin-users']],
    onDone: (r) => setShownPw({ pw: r.tempPassword, who: r.who }),
  });
  const toggle = useAction((u: UserRow) => api.patch(`/admin/users/${u.id}`, { active: !u.active }), { success: 'Kullanıcı güncellendi.', invalidate: [['admin-users']] });

  const locked = (u: UserRow) => !!u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();
  const canTouch = (u: UserRow) => isOwner || u.role !== 'SAHIP';

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'Ad soyad',
      cell: (u) => (
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-ink-900">
            {u.name} {u.id === me.user.id && <Badge tone="brand">Siz</Badge>}
          </div>
          <div className="text-xs text-ink-500">{u.email}</div>
        </div>
      ),
    },
    { key: 'role', header: 'Rol', cell: (u) => <Badge tone={u.role === 'SAHIP' ? 'violet' : 'blue'}>{roleLabel(u.role)}</Badge> },
    {
      key: 'status',
      header: 'Durum',
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="gray">Pasif</Badge>}
          {locked(u) && <Badge tone="red"><Lock className="size-3" /> Kilitli</Badge>}
          {u.mustChangePassword && <Badge tone="amber">Şifre değişmeli</Badge>}
        </div>
      ),
    },
    { key: 'last', header: 'Son giriş', cell: (u) => <span className="text-ink-600">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Hiç girmedi'}</span> },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (u) =>
        canTouch(u) ? (
          <div className="flex justify-end gap-1">
            <button className="btn-ghost btn-sm" onClick={() => setEditing(u)}>Düzenle</button>
            <button
              className="btn-ghost btn-sm"
              disabled={reset.isPending}
              onClick={async () => {
                if (await confirm(`${u.name} için yeni geçici şifre oluşturulacak. Mevcut şifresi geçersiz olur ve açık oturumları kapatılır.`)) reset.mutate(u);
              }}
            >
              <KeyRound className="size-3.5" /> Şifre sıfırla
            </button>
            {u.id !== me.user.id && (
              <button
                className={cx('btn-ghost btn-sm', u.active ? 'text-red-600' : 'text-emerald-700')}
                disabled={toggle.isPending}
                onClick={async () => {
                  if (!u.active || (await confirm(`${u.name} pasifleştirilecek; sisteme giriş yapamaz ve açık oturumları kapatılır.`))) toggle.mutate(u);
                }}
              >
                {u.active ? 'Pasifleştir' : 'Aktifleştir'}
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs text-ink-400">Yalnızca firma sahibi</span>
        ),
    },
  ];

  return (
    <>
      {node}
      <Card
        title="Kullanıcılar"
        subtitle="Her çalışana kendi hesabını açın; yetkiler role göre belirlenir"
        bodyClass="p-0"
        actions={
          <button className="btn-primary btn-sm" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" /> Kullanıcı ekle
          </button>
        }
      >
        {users.isLoading ? <Loading /> : users.error ? <div className="p-4"><ErrorBox error={users.error} /></div> : <Table rows={users.data ?? []} columns={columns} rowKey={(u) => u.id} />}
      </Card>

      {adding && <AddUserModal roles={roles.data ?? []} isOwner={isOwner} onClose={() => setAdding(false)} onCreated={(pw, who) => { setAdding(false); setShownPw({ pw, who }); }} />}
      {editing && <EditUserModal user={editing} roles={roles.data ?? []} isOwner={isOwner} self={editing.id === me.user.id} onClose={() => setEditing(null)} />}
      <Modal open={!!shownPw} onClose={() => setShownPw(null)} title="Geçici şifre" footer={<button className="btn-primary" onClick={() => setShownPw(null)}>Not aldım, kapat</button>}>
        {shownPw && <TempPasswordBox pw={shownPw.pw} who={shownPw.who} />}
      </Modal>
    </>
  );
}

function RolePicker({ roles, value, onChange, isOwner, disabled }: { roles: RoleRow[]; value: string; onChange: (r: string) => void; isOwner: boolean; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {roles.filter((r) => isOwner || r.role !== 'SAHIP').map((r) => (
        <button
          key={r.role}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r.role)}
          className={cx('rounded-xl px-3 py-2 text-left ring-1 transition disabled:opacity-60', value === r.role ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-ink-200 hover:bg-ink-50')}
        >
          <div className="flex items-center justify-between text-sm font-semibold text-ink-900">
            {r.label}
            {value === r.role && <Check className="size-4 text-brand-600" />}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-ink-500">{ROLE_DESC[r.role] ?? `${r.permissions.length} yetki`}</div>
        </button>
      ))}
    </div>
  );
}

function AddUserModal({ roles, isOwner, onClose, onCreated }: { roles: RoleRow[]; isOwner: boolean; onClose: () => void; onCreated: (pw: string, who: string) => void }) {
  const [f, setF] = useState({ name: '', email: '', role: 'OPERATOR' });
  const save = useAction(() => api.post<{ user: UserRow; tempPassword: string }>('/admin/users', f), {
    success: 'Kullanıcı eklendi.',
    invalidate: [['admin-users']],
    onDone: (r) => onCreated(r.tempPassword, r.user.name),
  });
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Kullanıcı ekle"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="add-user" className="btn-primary" disabled={save.isPending}><UserPlus className="size-4" /> {save.isPending ? 'Ekleniyor…' : 'Ekle ve geçici şifre oluştur'}</button>
        </>
      }
    >
      <form id="add-user" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad soyad" required>
            <input className="input" required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="E-posta" required hint="Giriş için kullanılır">
            <input className="input" type="email" required maxLength={160} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
        </div>
        <div>
          <span className="label">Rol — ne görebilir?</span>
          <RolePicker roles={roles} value={f.role} onChange={(role) => setF({ ...f, role })} isOwner={isOwner} />
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, roles, isOwner, self, onClose }: { user: UserRow; roles: RoleRow[]; isOwner: boolean; self: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: user.name, role: user.role, active: user.active });
  const save = useAction(
    () => {
      const body: Record<string, unknown> = {};
      if (f.name.trim() !== user.name) body.name = f.name.trim();
      if (!self && f.role !== user.role) body.role = f.role;
      if (!self && f.active !== user.active) body.active = f.active;
      return api.patch(`/admin/users/${user.id}`, body);
    },
    { success: 'Kullanıcı güncellendi.', invalidate: [['admin-users']], onDone: onClose },
  );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Kullanıcıyı düzenle — ${user.email}`}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="edit-user" className="btn-primary" disabled={save.isPending}>Kaydet</button>
        </>
      }
    >
      <form id="edit-user" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Field label="Ad soyad" required>
          <input className="input" required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div>
          <span className="label">Rol</span>
          {self && <p className="mb-2 text-xs text-amber-700">Kendi rolünüzü değiştiremez, hesabınızı pasifleştiremezsiniz.</p>}
          <RolePicker roles={roles} value={f.role} onChange={(role) => setF({ ...f, role })} isOwner={isOwner} disabled={self} />
        </div>
        <label className={cx('flex items-center gap-2 text-sm', self && 'opacity-60')}>
          <input type="checkbox" className="size-4 rounded" checked={f.active} disabled={self} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          Hesap aktif (pasif kullanıcı giriş yapamaz)
        </label>
        {(f.role !== user.role || f.active !== user.active) && <p className="text-xs text-ink-500">Rol veya durum değişince kullanıcının açık oturumları kapatılır; yeni yetkiler hemen geçerli olur.</p>}
      </form>
    </Modal>
  );
}

// ───────────────────────── Yetki tablosu
function PermissionsTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-roles'], queryFn: () => api.get<RoleRow[]>('/admin/roles') });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const sets = data.map((r) => new Set(r.permissions));
  const known = new Set(PERMISSION_GROUPS.flatMap((g) => g.perms));
  const extra = [...new Set(data.flatMap((r) => r.permissions))].filter((p) => !known.has(p));
  const groups = extra.length ? [...PERMISSION_GROUPS, { title: 'Diğer', perms: extra }] : PERMISSION_GROUPS;
  return (
    <Card title="Yetki tablosu" subtitle="Hangi rol neyi görebilir, neyi değiştirebilir" bodyClass="p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-ink-50">
            <tr>
              <th className="th min-w-[240px]">Yetki</th>
              {data.map((r) => (
                <th key={r.role} className="th text-center normal-case tracking-normal">{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.title} title={g.title} perms={g.perms} sets={sets} cols={data.length} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GroupRows({ title, perms, sets, cols }: { title: string; perms: string[]; sets: Set<string>[]; cols: number }) {
  return (
    <>
      <tr className="bg-ink-50/60">
        <td colSpan={cols + 1} className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-brand-700">{title}</td>
      </tr>
      {perms.map((p) => (
        <tr key={p} className="border-t border-ink-100 hover:bg-brand-50/30">
          <td className="td">
            <div className="font-medium text-ink-900">{PERMISSION_LABELS[p] ?? p}</div>
            <code className="text-[10px] text-ink-400">{p}</code>
          </td>
          {sets.map((s, i) => (
            <td key={i} className="td text-center">
              {s.has(p) ? <ShieldCheck className="mx-auto size-4 text-emerald-600" aria-label="Var" /> : <span className="text-ink-300">—</span>}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ───────────────────────── Denetim kaydı
function AuditTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-audit'], queryFn: () => api.get<AuditRow[]>('/admin/audit?take=500') });
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLocaleLowerCase('tr');
    const list = data ?? [];
    if (!s) return list;
    return list.filter((r) => [r.userName, r.action, actionLabel(r.action), r.entity, ENTITY_LABELS[r.entity], r.ip, r.entityId].filter(Boolean).some((v) => String(v).toLocaleLowerCase('tr').includes(s)));
  }, [data, q]);
  const columns: Column<AuditRow>[] = [
    { key: 'date', header: 'Tarih', cell: (r) => <span className="num whitespace-nowrap">{fmtDateTime(r.createdAt)}</span>, csv: (r) => fmtDateTime(r.createdAt) },
    { key: 'user', header: 'Kullanıcı', cell: (r) => r.userName || <span className="text-ink-400">Sistem</span>, csv: (r) => r.userName ?? 'Sistem' },
    {
      key: 'action',
      header: 'İşlem',
      cell: (r) => <span className={cx('font-medium', r.action === 'GIRIS_BASARISIZ' && 'text-red-600')}>{actionLabel(r.action)}</span>,
      csv: (r) => actionLabel(r.action),
    },
    { key: 'entity', header: 'Kayıt türü', cell: (r) => <Badge>{ENTITY_LABELS[r.entity] ?? r.entity}</Badge>, csv: (r) => ENTITY_LABELS[r.entity] ?? r.entity },
    { key: 'ip', header: 'IP', cell: (r) => <code className="text-xs text-ink-500">{r.ip || '—'}</code>, csv: (r) => r.ip },
  ];
  return (
    <Card title="Denetim kaydı" subtitle="Son 500 işlem — kim, ne zaman, ne yaptı" bodyClass="p-0" actions={<SearchBox value={q} onChange={setQ} placeholder="Kullanıcı, işlem, IP ara…" />}>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <div className="p-4"><ErrorBox error={error} /></div>
      ) : (
        <Table rows={rows} columns={columns} rowKey={(r) => r.id} csvName="denetim-kaydi" dense empty={<Empty title={q ? 'Aramaya uyan kayıt yok' : 'Denetim kaydı boş'} />} />
      )}
    </Card>
  );
}
