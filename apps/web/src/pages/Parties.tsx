import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, Phone, Plus } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { PARTY_ROLE } from '@/lib/labels';
import type { Tone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, SearchBox, Select, Table, Tabs, cx, type Column } from '@/components/ui';

export interface Party {
  id: string;
  roles: string[];
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  taxOffice?: string | null;
  taxNo?: string | null;
  city?: string | null;
  address?: string | null;
  specialties: string[];
  dailyCapacity?: number | null;
  note?: string | null;
  active: boolean;
  createdAt?: string;
}

export const ROLE_TONE: Record<string, Tone> = { MUSTERI: 'blue', TEDARIKCI: 'amber', FASONCU: 'violet' };

export function RoleBadges({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Badge key={r} tone={ROLE_TONE[r] ?? 'gray'}>{PARTY_ROLE[r] ?? r}</Badge>
      ))}
    </div>
  );
}

// ── Cari formu (yeni + düzenle)
export function PartyModal({ open, onClose, party, defaultRole }: { open: boolean; onClose: () => void; party?: Party; defaultRole?: string }) {
  const { me, stageLabel } = useSession();
  const init = () => ({
    roles: party?.roles ?? (defaultRole ? [defaultRole] : ['MUSTERI']),
    name: party?.name ?? '',
    contactName: party?.contactName ?? '',
    phone: party?.phone ?? '',
    email: party?.email ?? '',
    taxOffice: party?.taxOffice ?? '',
    taxNo: party?.taxNo ?? '',
    city: party?.city ?? '',
    address: party?.address ?? '',
    specialties: party?.specialties ?? [],
    dailyCapacity: party?.dailyCapacity != null ? String(party.dailyCapacity) : '',
    note: party?.note ?? '',
  });
  const [f, setF] = useState(init);
  useEffect(() => {
    if (open) setF(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, party?.id]);
  const nav = useNavigate();
  const isFason = f.roles.includes('FASONCU');
  const toggleRole = (r: string) => setF({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] });
  const toggleSpec = (s: string) => setF({ ...f, specialties: f.specialties.includes(s) ? f.specialties.filter((x) => x !== s) : [...f.specialties, s] });

  const save = useAction(
    () => {
      const body = {
        roles: f.roles,
        name: f.name,
        contactName: f.contactName || null,
        phone: f.phone || null,
        email: f.email || null,
        taxOffice: f.taxOffice || null,
        taxNo: f.taxNo || null,
        city: f.city || null,
        address: f.address || null,
        specialties: isFason ? f.specialties : [],
        dailyCapacity: isFason && f.dailyCapacity ? Number(f.dailyCapacity) : null,
        note: f.note || null,
      };
      return party ? api.patch<Party>(`/parties/${party.id}`, body) : api.post<Party>('/parties', body);
    },
    {
      success: party ? 'Cari bilgileri güncellendi.' : 'Cari kaydedildi.',
      invalidate: [['parties'], ['party']],
      onDone: (r) => {
        onClose();
        if (!party && r?.id) nav(`/cariler/${r.id}`);
      },
    },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const stages = me.settings.stages ?? [];
  const extraSpecs = f.specialties.filter((s) => !stages.some((st) => st.code === s));

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={party ? 'Cari bilgilerini düzenle' : 'Yeni cari'}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" form="party-form" disabled={save.isPending || !f.roles.length || f.name.trim().length < 2}>Kaydet</button>
        </>
      }
    >
      <form id="party-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Cari türü" required className="sm:col-span-2" hint="Bir firma hem müşteri hem tedarikçi olabilir; birden fazla seçebilirsiniz.">
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PARTY_ROLE).map(([k, l]) => {
              const on = f.roles.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleRole(k)}
                  className={cx('flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold ring-1 transition', on ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50')}
                >
                  {on && <Check className="size-4" />} {l}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Firma / kişi adı" required className="sm:col-span-2">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={160} required autoFocus={!party} />
        </Field>
        <Field label="Yetkili kişi">
          <input className="input" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Telefon">
          <input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={40} placeholder="05xx xxx xx xx" />
        </Field>
        <Field label="E-posta">
          <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={160} />
        </Field>
        <Field label="Şehir / ilçe">
          <input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={60} />
        </Field>
        <Field label="Vergi dairesi">
          <input className="input" value={f.taxOffice} onChange={(e) => setF({ ...f, taxOffice: e.target.value })} maxLength={80} />
        </Field>
        <Field label="Vergi no / T.C. no" hint="10 haneli VKN veya 11 haneli TCKN">
          <input className="input num" inputMode="numeric" value={f.taxNo} onChange={(e) => setF({ ...f, taxNo: e.target.value.replace(/\D/g, '').slice(0, 11) })} />
        </Field>
        <Field label="Adres" className="sm:col-span-2">
          <textarea className="input min-h-16" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={400} />
        </Field>
        {isFason && (
          <>
            <Field label="Fason uzmanlıkları" className="sm:col-span-2" hint="Bu atölyenin yaptığı işler; fason gönderirken öneri için kullanılır.">
              <div className="flex flex-wrap gap-1.5">
                {[...stages.map((s) => s.code), ...extraSpecs].map((code) => {
                  const on = f.specialties.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleSpec(code)}
                      className={cx('rounded-full px-3 py-1 text-xs font-semibold ring-1 transition', on ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50')}
                    >
                      {stageLabel(code)}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Günlük kapasite (adet)">
              <input className="input num" type="number" inputMode="numeric" min={0} value={f.dailyCapacity} onChange={(e) => setF({ ...f, dailyCapacity: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Not" className="sm:col-span-2">
          <textarea className="input min-h-16" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} />
        </Field>
      </form>
    </Modal>
  );
}

type TabKey = '' | 'MUSTERI' | 'TEDARIKCI' | 'FASONCU';

export default function Parties() {
  const { can, stageLabel } = useSession();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const rawTab = sp.get('tab') ?? '';
  const tab = (['MUSTERI', 'TEDARIKCI', 'FASONCU'].includes(rawTab) ? rawTab : '') as TabKey;
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  useEffect(() => {
    if (sp.get('yeni') === '1') {
      if (can('cari:yaz')) setOpen(true);
      const n = new URLSearchParams(sp);
      n.delete('yeni');
      setSp(n, { replace: true });
    }
  }, [sp, setSp, can]);

  const params = { type: tab, q: debounced, status, take: 500 };
  const q = useQuery({ queryKey: ['parties', params], queryFn: () => api.get<Party[]>(`/parties${qs(params)}`) });

  const setTab = (v: TabKey) => {
    const n = new URLSearchParams(sp);
    if (v) n.set('tab', v);
    else n.delete('tab');
    setSp(n, { replace: true });
  };

  const cols: Column<Party>[] = [
    {
      key: 'name',
      header: 'Cari adı',
      cell: (r) => (
        <div className="min-w-40">
          <div className="font-semibold text-ink-900">{r.name}</div>
          {!r.active && <Badge className="mt-0.5">Pasif</Badge>}
        </div>
      ),
      csv: (r) => r.name,
    },
    { key: 'roles', header: 'Tür', cell: (r) => <RoleBadges roles={r.roles} />, csv: (r) => r.roles.map((x) => PARTY_ROLE[x] ?? x).join(', ') },
    { key: 'contact', header: 'Yetkili', cell: (r) => r.contactName ?? '—', csv: (r) => r.contactName },
    {
      key: 'phone',
      header: 'Telefon',
      cell: (r) =>
        r.phone ? (
          <a href={`tel:${r.phone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 whitespace-nowrap text-brand-700 hover:underline">
            <Phone className="size-3.5" /> {r.phone}
          </a>
        ) : (
          '—'
        ),
      csv: (r) => r.phone,
    },
    { key: 'city', header: 'Şehir', cell: (r) => r.city ?? '—', csv: (r) => r.city },
    {
      key: 'spec',
      header: 'Fason uzmanlığı',
      cell: (r) =>
        r.roles.includes('FASONCU') && r.specialties.length ? (
          <div className="flex flex-wrap gap-1">
            {r.specialties.map((s) => (
              <span key={s} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">{stageLabel(s)}</span>
            ))}
            {r.dailyCapacity ? <span className="text-[11px] text-ink-500">· {r.dailyCapacity} ad/gün</span> : null}
          </div>
        ) : (
          <span className="text-ink-400">—</span>
        ),
      csv: (r) => r.specialties.map(stageLabel).join(', '),
    },
  ];

  const list = q.data ?? [];
  const tabLabel = tab ? PARTY_ROLE[tab].toLocaleLowerCase('tr-TR') : 'cari';

  return (
    <div>
      <PageHeader
        title="Cariler"
        subtitle="Müşteriler, tedarikçiler ve fason atölyeleri"
        actions={
          can('cari:yaz') && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Yeni cari
            </button>
          )
        }
      />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: '', label: 'Tümü' },
          { value: 'MUSTERI', label: 'Müşteri' },
          { value: 'TEDARIKCI', label: 'Tedarikçi' },
          { value: 'FASONCU', label: 'Fasoncu' },
        ]}
      />
      <Card
        bodyClass="p-0"
        title={`${list.length} kayıt`}
        actions={
          <>
            <SearchBox value={term} onChange={setTerm} placeholder="Ad, yetkili veya telefon…" />
            <Select className="w-32" value={status} onChange={setStatus} options={[{ value: '', label: 'Aktif' }, { value: 'pasif', label: 'Pasif' }, { value: 'hepsi', label: 'Hepsi' }]} />
          </>
        }
      >
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <div className="p-4"><ErrorBox error={q.error} /></div>
        ) : (
          <Table
            rows={list}
            columns={cols}
            rowKey={(r) => r.id}
            csvName="cariler"
            onRowClick={(r) => nav(`/cariler/${r.id}`)}
            empty={
              <Empty
                icon={<Building2 className="size-6" />}
                title={debounced ? 'Aramaya uygun cari bulunamadı' : `Henüz ${tabLabel} kaydı yok`}
                text={debounced ? 'Farklı bir kelimeyle aramayı deneyin.' : 'Sipariş, fason ve finans kayıtları için önce carileri tanımlayın.'}
                action={can('cari:yaz') && !debounced ? <button className="btn-outline btn-sm" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Cari ekle</button> : undefined}
              />
            }
          />
        )}
      </Card>
      <PartyModal open={open} onClose={() => setOpen(false)} defaultRole={tab || undefined} />
    </div>
  );
}
