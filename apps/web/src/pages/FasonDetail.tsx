import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, CalendarClock, CheckCheck, Factory, PackageCheck, Phone, Printer, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtMoney, fmtNum, toInputDate } from '@/lib/format';
import { FASON_STATUS, statusTone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Progress, Table, cx, useConfirm, type Column } from '@/components/ui';

interface Receipt { id: string; qty: number; defectQty: number; dispatchNo?: string | null; note?: string | null; date: string }
interface FasonJob {
  id: string;
  no: string;
  stage: string;
  status: string;
  description?: string | null;
  sentQty: number;
  receivedQty: number;
  defectQty: number;
  unitPrice?: string | number | null;
  sentDate: string;
  dueDate: string;
  dispatchNo?: string | null;
  completedAt?: string | null;
  note?: string | null;
  party: { id: string; name: string; phone?: string | null; contactName?: string | null; address?: string | null; taxNo?: string | null; taxOffice?: string | null; specialties?: string[] };
  workOrder?: { id: string; no: string; color: string; model: { code: string; name: string } } | null;
  receipts: Receipt[];
  open: boolean;
  late: boolean;
  daysLate: number;
  pending: number;
  missing: number;
}

function Num({ label, value, tone, sub }: { label: string; value: number | string; tone?: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-ink-50 px-4 py-3 ring-1 ring-ink-200/60">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className={cx('num mt-0.5 text-2xl font-extrabold', tone ?? 'text-ink-900')}>{value}</div>
      {sub && <div className="text-[11px] text-ink-500">{sub}</div>}
    </div>
  );
}

export default function FasonDetail() {
  const { id = '' } = useParams();
  const { can, stageLabel, me } = useSession();
  const showPrice = can('fiyat:gor');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { confirm, node } = useConfirm();

  const { data: j, isLoading, error } = useQuery({ queryKey: ['fason', id], queryFn: () => api.get<FasonJob>(`/fason/${id}`) });

  const inv = [['fason'], ['work-orders'], ['work-order']];
  const patch = useAction((body: Record<string, unknown>) => api.patch(`/fason/${id}`, body), {
    success: 'İşlem kaydedildi.',
    invalidate: inv,
  });

  if (isLoading) return <Loading />;
  if (error || !j) return <ErrorBox error={error} />;

  const done = j.receivedQty + j.defectQty;
  const pct = j.sentQty ? Math.round((done / j.sentQty) * 100) : 0;
  const unit = j.unitPrice !== null && j.unitPrice !== undefined && j.unitPrice !== '' ? Number(j.unitPrice) : null;
  const canWrite = can('fason:yaz') && j.open;

  const closeMissing = async () => {
    const ok = await confirm(
      `${j.no} numaralı iş eksikle kapatılacak. Dönmeyen ${fmtNum(j.pending)} adet kayıp kabul edilir${j.workOrder ? ` ve ${j.workOrder.no} iş emrinin ${stageLabel(j.stage)} aşamasına fire/kayıp olarak yazılır` : ''}. Bu işlem geri alınamaz.`,
    );
    if (ok) patch.mutate({ action: 'KAPAT' });
  };
  const cancel = async () => {
    const ok = await confirm(`${j.no} numaralı fason işi iptal edilecek. Hiç dönüşü olmayan işler iptal edilebilir. Devam edilsin mi?`);
    if (ok) patch.mutate({ action: 'IPTAL' });
  };

  const rcols: Column<Receipt>[] = [
    { key: 'date', header: 'Tarih', cell: (r) => fmtDate(r.date), csv: (r) => fmtDate(r.date) },
    { key: 'qty', header: 'Sağlam', align: 'right', cell: (r) => <span className="font-semibold text-emerald-700">{fmtNum(r.qty)}</span>, csv: (r) => r.qty },
    { key: 'defect', header: 'Fire / defolu', align: 'right', cell: (r) => <span className={cx(r.defectQty > 0 && 'font-semibold text-red-600')}>{fmtNum(r.defectQty)}</span>, csv: (r) => r.defectQty },
    { key: 'disp', header: 'İrsaliye no', cell: (r) => r.dispatchNo || '—', csv: (r) => r.dispatchNo },
    { key: 'note', header: 'Not', cell: (r) => <span className="text-ink-600">{r.note || '—'}</span>, csv: (r) => r.note },
  ];

  return (
    <div>
      {node}
      <div className="no-print">
        <PageHeader
          back={
            <Link to="/fason" className="no-print mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
              <ArrowLeft className="size-3.5" /> Fason takibi
            </Link>
          }
          title={
            <span className="flex flex-wrap items-center gap-2">
              {j.no}
              <Badge tone={statusTone(j.status)}>{FASON_STATUS[j.status] ?? j.status}</Badge>
              {j.late && <Badge tone="red">{j.daysLate} gün gecikti</Badge>}
            </span>
          }
          subtitle={`${j.party.name} · ${stageLabel(j.stage)}${j.description ? ` · ${j.description}` : ''}`}
          actions={
            <div className="no-print flex flex-wrap gap-2">
              <button className="btn-outline" onClick={() => window.print()}>
                <Printer className="size-4" /> Fason irsaliyesi / iş föyü
              </button>
              {canWrite && (
                <>
                  <button className="btn-primary" onClick={() => setReceiptOpen(true)}>
                    <PackageCheck className="size-4" /> Dönüş gir
                  </button>
                  <button className="btn-outline" onClick={() => setEditOpen(true)}>
                    <CalendarClock className="size-4" /> Termin/fiyat güncelle
                  </button>
                  {j.receivedQty > 0 ? (
                    <button className="btn-outline text-amber-800" onClick={closeMissing} disabled={patch.isPending}>
                      <CheckCheck className="size-4" /> Eksikle kapat
                    </button>
                  ) : (
                    <button className="btn-ghost text-red-600" onClick={cancel} disabled={patch.isPending}>
                      <Ban className="size-4" /> İptal
                    </button>
                  )}
                </>
              )}
            </div>
          }
        />
      </div>

      {/* Ekran görünümü */}
      <div className="no-print space-y-5">
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="İlerleme" subtitle={`Dönen (sağlam + fire) / gönderilen: %${pct}`}>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <div className="num text-4xl font-extrabold tracking-tight text-ink-900">
                  {fmtNum(done)} <span className="text-lg font-semibold text-ink-400">/ {fmtNum(j.sentQty)}</span>
                </div>
                <div className="text-sm text-ink-500">adet geri döndü</div>
              </div>
              <div className={cx('num text-3xl font-extrabold', pct >= 100 ? 'text-emerald-600' : j.late ? 'text-red-600' : 'text-brand-700')}>%{pct}</div>
            </div>
            <Progress value={pct} tone={j.late ? 'red' : undefined} />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Num label="Gönderilen" value={fmtNum(j.sentQty)} />
              <Num label="Sağlam dönen" value={fmtNum(j.receivedQty)} tone="text-emerald-700" />
              <Num label="Fire / defolu" value={fmtNum(j.defectQty)} tone={j.defectQty ? 'text-red-600' : undefined} sub={j.sentQty ? `%${fmtNum((j.defectQty / j.sentQty) * 100, 1)}` : undefined} />
              {j.open ? (
                <Num label="Bekleyen" value={fmtNum(j.pending)} tone={j.late ? 'text-red-600' : 'text-brand-700'} />
              ) : (
                <Num label="Eksik" value={fmtNum(j.missing)} tone={j.missing ? 'text-red-600' : undefined} sub={j.missing ? 'Kayıp yazıldı' : undefined} />
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Info label="Gönderim" value={fmtDate(j.sentDate)} />
              <Info label="Termin" value={<span className={cx(j.late && 'font-bold text-red-600')}>{fmtDate(j.dueDate)}</span>} />
              <Info label="Çıkış irsaliyesi" value={j.dispatchNo || '—'} />
              <Info label="Tamamlanma" value={fmtDate(j.completedAt)} />
              {showPrice && <Info label="Birim fiyat" value={unit !== null ? fmtMoney(unit) : '—'} />}
              {showPrice && <Info label="Tutar (dönen)" value={unit !== null ? fmtMoney(unit * j.receivedQty) : '—'} />}
            </div>
            {j.note && <div className="mt-4 rounded-xl bg-thread-50 px-3 py-2 text-sm text-ink-700 ring-1 ring-thread-200">{j.note}</div>}
          </Card>

          <div className="space-y-5">
            <Card title="Fasoncu">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 font-bold text-ink-900">
                  <User className="size-4 text-ink-400" />
                  {can('cari:gor') ? <Link className="hover:text-brand-700 hover:underline" to={`/cariler/${j.party.id}`}>{j.party.name}</Link> : j.party.name}
                </div>
                {j.party.contactName && <div className="text-ink-600">Yetkili: {j.party.contactName}</div>}
                {j.party.phone ? (
                  <a href={`tel:${j.party.phone}`} className="btn-outline btn-sm w-full">
                    <Phone className="size-3.5" /> {j.party.phone} — Ara
                  </a>
                ) : (
                  <div className="text-xs text-ink-500">Telefon kayıtlı değil</div>
                )}
                {!!j.party.specialties?.length && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {j.party.specialties.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}
                  </div>
                )}
              </div>
            </Card>
            <Card title="İş emri">
              {j.workOrder ? (
                <Link to={`/uretim/${j.workOrder.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-ink-50">
                  <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Factory className="size-5" /></div>
                  <div>
                    <div className="font-bold text-brand-700">{j.workOrder.no}</div>
                    <div className="text-xs text-ink-500">{j.workOrder.model.code} · {j.workOrder.model.name} · {j.workOrder.color}</div>
                  </div>
                </Link>
              ) : (
                <div className="text-sm text-ink-500">Bu iş bir iş emrine bağlı değil (serbest fason).</div>
              )}
            </Card>
          </div>
        </div>

        <Card title="Dönüş geçmişi" subtitle={`${j.receipts.length} dönüş kaydı`} bodyClass="p-0">
          <Table
            rows={j.receipts}
            columns={rcols}
            rowKey={(r) => r.id}
            csvName={`fason-donus-${j.no}`}
            empty={<Empty icon={<PackageCheck className="size-6" />} title="Henüz dönüş yok" text="Fasoncudan mal geldikçe “Dönüş gir” ile sağlam ve defolu adetleri işleyin." />}
          />
        </Card>
      </div>

      <PrintSheet j={j} tenant={me.tenant.name} stage={stageLabel(j.stage)} showPrice={showPrice} />

      {receiptOpen && <ReceiptModal j={j} onClose={() => setReceiptOpen(false)} />}
      {editOpen && <EditModal j={j} showPrice={showPrice} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="font-medium text-ink-900">{value}</div>
    </div>
  );
}

// ── Yazdırma görünümü (yalnızca baskıda görünür)
function PrintSheet({ j, tenant, stage, showPrice }: { j: FasonJob; tenant: string; stage: string; showPrice: boolean }) {
  const cell = 'border border-black px-2 py-1.5 text-left align-top';
  return (
    <div className="hidden text-[12px] text-black print:block">
      <div className="mb-4 flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <div className="text-xl font-extrabold">{tenant}</div>
          <div className="text-sm">Fason irsaliyesi / iş föyü</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{j.no}</div>
          <div>Tarih: {fmtDate(j.sentDate)}</div>
          {j.dispatchNo && <div>İrsaliye no: {j.dispatchNo}</div>}
        </div>
      </div>
      <table className="mb-4 w-full border-collapse">
        <tbody>
          <tr><th className={cell} style={{ width: '25%' }}>Fasoncu</th><td className={cell}>{j.party.name}{j.party.phone ? ` · Tel: ${j.party.phone}` : ''}{j.party.address ? <><br />{j.party.address}</> : null}</td></tr>
          <tr><th className={cell}>Yapılacak işlem</th><td className={cell}><b>{stage}</b>{j.description ? ` — ${j.description}` : ''}</td></tr>
          {j.workOrder && <tr><th className={cell}>İş emri / model</th><td className={cell}>{j.workOrder.no} · {j.workOrder.model.code} {j.workOrder.model.name} · Renk: {j.workOrder.color}</td></tr>}
          <tr><th className={cell}>Gönderilen adet</th><td className={cell}><b className="text-base">{fmtNum(j.sentQty)}</b> adet</td></tr>
          <tr><th className={cell}>Teslim tarihi (termin)</th><td className={cell}><b>{fmtDate(j.dueDate)}</b></td></tr>
          {showPrice && j.unitPrice !== null && j.unitPrice !== undefined && <tr><th className={cell}>Birim fiyat</th><td className={cell}>{fmtMoney(j.unitPrice)}</td></tr>}
          {j.note && <tr><th className={cell}>Not</th><td className={cell}>{j.note}</td></tr>}
        </tbody>
      </table>
      {j.receipts.length > 0 && (
        <>
          <div className="mb-1 font-bold">Dönüşler</div>
          <table className="mb-4 w-full border-collapse">
            <thead><tr><th className={cell}>Tarih</th><th className={cell}>Sağlam</th><th className={cell}>Fire/defolu</th><th className={cell}>İrsaliye</th><th className={cell}>Not</th></tr></thead>
            <tbody>
              {j.receipts.map((r) => (
                <tr key={r.id}><td className={cell}>{fmtDate(r.date)}</td><td className={cell}>{r.qty}</td><td className={cell}>{r.defectQty}</td><td className={cell}>{r.dispatchNo ?? ''}</td><td className={cell}>{r.note ?? ''}</td></tr>
              ))}
              <tr><th className={cell}>Toplam</th><th className={cell}>{j.receivedQty}</th><th className={cell}>{j.defectQty}</th><th className={cell} colSpan={2}>Bekleyen: {j.pending}</th></tr>
            </tbody>
          </table>
        </>
      )}
      <p className="mb-8 text-[11px]">Fasoncu, teslim aldığı malı eksiksiz ve belirtilen tarihte teslim etmekle yükümlüdür. Eksik veya defolu dönen adetler hakedişten düşülür.</p>
      <div className="grid grid-cols-2 gap-10 pt-6">
        <div className="border-t border-black pt-1 text-center">Teslim eden (imza)</div>
        <div className="border-t border-black pt-1 text-center">Teslim alan — {j.party.name} (imza)</div>
      </div>
    </div>
  );
}

// ── Dönüş gir
function ReceiptModal({ j, onClose }: { j: FasonJob; onClose: () => void }) {
  const [f, setF] = useState({ qty: '', defectQty: '', dispatchNo: '', date: toInputDate(), note: '' });
  const total = (Number(f.qty) || 0) + (Number(f.defectQty) || 0);
  const over = total > j.pending;
  const save = useAction(
    () => api.post(`/fason/${j.id}/receipts`, { qty: Number(f.qty) || 0, defectQty: Number(f.defectQty) || 0, dispatchNo: f.dispatchNo || undefined, date: f.date || undefined, note: f.note || undefined }),
    { success: 'Dönüş kaydedildi.', invalidate: [['fason'], ['work-orders'], ['work-order']], onDone: onClose },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (total <= 0 || over) return;
    save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Dönüş gir — ${j.no}`}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="fason-receipt" className="btn-primary" disabled={save.isPending || total <= 0 || over}>
            {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="mb-4 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800 ring-1 ring-brand-200">
        <span>Fasoncuda bekleyen</span>
        <span className="num text-lg font-extrabold">{fmtNum(j.pending)} adet</span>
      </div>
      <form id="fason-receipt" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Sağlam adet" required>
          <input className="input num" type="number" min={0} inputMode="numeric" autoFocus value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        </Field>
        <Field label="Fire / defolu adet">
          <input className="input num" type="number" min={0} inputMode="numeric" value={f.defectQty} onChange={(e) => setF({ ...f, defectQty: e.target.value })} />
        </Field>
        <Field label="İrsaliye no (dönüş)">
          <input className="input" maxLength={40} value={f.dispatchNo} onChange={(e) => setF({ ...f, dispatchNo: e.target.value })} />
        </Field>
        <Field label="Tarih">
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Not" className="sm:col-span-2">
          <input className="input" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <div className="text-xs sm:col-span-2">
          {over ? (
            <span className="font-semibold text-red-600">Toplam {fmtNum(total)} adet, bekleyen {fmtNum(j.pending)} adetten fazla olamaz.</span>
          ) : total > 0 ? (
            <span className="text-ink-600">
              Bu dönüşten sonra bekleyen: <b className="num">{fmtNum(j.pending - total)}</b> adet
              {j.pending - total === 0 && ' — iş otomatik tamamlanacak.'}
            </span>
          ) : (
            <span className="text-ink-500">Dönüşler bağlı iş emrinin aşamasına otomatik işlenir.</span>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ── Termin / fiyat güncelle
function EditModal({ j, showPrice, onClose }: { j: FasonJob; showPrice: boolean; onClose: () => void }) {
  const [f, setF] = useState({ dueDate: toInputDate(j.dueDate), unitPrice: j.unitPrice !== null && j.unitPrice !== undefined ? String(Number(j.unitPrice)) : '', note: j.note ?? '' });
  const save = useAction(
    () => api.patch(`/fason/${j.id}`, { action: 'GUNCELLE', dueDate: f.dueDate || undefined, unitPrice: showPrice && f.unitPrice !== '' ? f.unitPrice : undefined, note: f.note }),
    { success: 'Fason işi güncellendi.', invalidate: [['fason']], onDone: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Termin / fiyat güncelle"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="fason-edit" className="btn-primary" disabled={save.isPending}>Kaydet</button>
        </>
      }
    >
      <form id="fason-edit" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4 sm:grid-cols-2">
        <Field label="Yeni termin" required>
          <input className="input" type="date" required value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>
        {showPrice && (
          <Field label="Birim fiyat (₺/adet)">
            <input className="input num" type="number" min={0} step="0.01" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} />
          </Field>
        )}
        <Field label="Not" className="sm:col-span-2">
          <textarea className="input" rows={3} maxLength={1000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}
