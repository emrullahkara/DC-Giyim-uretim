import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Handshake, Landmark, Mail, MapPin, Pencil, Phone, Plus, Power, Receipt, Scale, UserRound } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtMoney, fmtNum } from '@/lib/format';
import { FASON_STATUS, ORDER_STATUS, ORDER_TYPE, statusTone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Table, cx, useConfirm, type Column } from '@/components/ui';
import { PartyModal, RoleBadges, type Party } from './Parties';
import { ChequeStatusMenu, TransactionModal, TransactionTable, type Cheque, type Tx } from './Finance';

interface OrderRow { id: string; no: string; status: string; dueDate?: string | null; orderDate?: string | null; type: string }
interface FasonRow { id: string; no: string; stage: string; status: string; sentQty: number; receivedQty: number; defectQty: number; dueDate?: string | null; sentDate?: string | null; completedAt?: string | null }
interface Detail { party: Party; orders: OrderRow[]; fason: FasonRow[]; balance?: number; cheques: Cheque[] }

export default function PartyDetail() {
  const { id = '' } = useParams();
  const { can, stageLabel } = useSession();
  const [edit, setEdit] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const { confirm, node } = useConfirm();
  const q = useQuery({ queryKey: ['party', id], queryFn: () => api.get<Detail>(`/parties/${id}`), enabled: !!id });
  const showFin = can('finans:gor');
  const txs = useQuery({ queryKey: ['finance', 'transactions', 'party', id], queryFn: () => api.get<Tx[]>(`/finance/transactions${qs({ partyId: id, take: 100 })}`), enabled: !!id && showFin });

  const toggleActive = useAction((active: boolean) => api.patch(`/parties/${id}`, { active }), {
    success: (r: any) => (r?.active ? 'Cari yeniden aktif edildi.' : 'Cari pasife alındı.'),
    invalidate: [['party', id], ['parties']],
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const { party, orders, fason, balance, cheques } = q.data;

  const back = (
    <Link to="/cariler" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
      <ArrowLeft className="size-3.5" /> Cariler
    </Link>
  );

  const orderCols: Column<OrderRow>[] = [
    { key: 'no', header: 'Sipariş', cell: (r) => <Link to={`/siparisler/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.no}</Link> },
    { key: 'type', header: 'Tür', cell: (r) => <span className="text-ink-600">{ORDER_TYPE[r.type] ?? r.type}</span> },
    { key: 'date', header: 'Sipariş tarihi', cell: (r) => fmtDate(r.orderDate) },
    { key: 'due', header: 'Termin', cell: (r) => fmtDate(r.dueDate) },
    { key: 'status', header: 'Durum', cell: (r) => <Badge tone={statusTone(r.status)}>{ORDER_STATUS[r.status] ?? r.status}</Badge> },
  ];
  const fasonCols: Column<FasonRow>[] = [
    { key: 'no', header: 'Fason no', cell: (r) => <Link to={`/fason/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.no}</Link> },
    { key: 'stage', header: 'İşlem', cell: (r) => stageLabel(r.stage) },
    { key: 'sent', header: 'Gönderilen', align: 'right', cell: (r) => fmtNum(r.sentQty) },
    { key: 'recv', header: 'Dönen', align: 'right', cell: (r) => fmtNum(r.receivedQty) },
    { key: 'defect', header: 'Hatalı', align: 'right', cell: (r) => <span className={cx(r.defectQty > 0 && 'font-semibold text-red-600')}>{fmtNum(r.defectQty)}</span> },
    {
      key: 'miss',
      header: 'Bekleyen',
      align: 'right',
      cell: (r) => {
        const m = r.sentQty - r.receivedQty - r.defectQty;
        return r.status === 'TAMAMLANDI' || r.status === 'IPTAL' ? '—' : <span className={cx(m > 0 && 'font-semibold text-amber-700')}>{fmtNum(Math.max(0, m))}</span>;
      },
    },
    { key: 'sentDate', header: 'Gönderim', cell: (r) => fmtDate(r.sentDate) },
    { key: 'due', header: 'Termin', cell: (r) => fmtDate(r.dueDate) },
    { key: 'status', header: 'Durum', cell: (r) => <Badge tone={statusTone(r.status)}>{FASON_STATUS[r.status] ?? r.status}</Badge> },
  ];
  const chequeCols: Column<Cheque>[] = [
    { key: 'due', header: 'Vade', cell: (r) => fmtDate(r.dueDate) },
    { key: 'kind', header: 'Tür', cell: (r) => <div className="flex gap-1"><Badge>{r.kind === 'SENET' ? 'Senet' : 'Çek'}</Badge><Badge tone={r.direction === 'ALINAN' ? 'green' : 'amber'}>{r.direction === 'ALINAN' ? 'Alınan' : 'Verilen'}</Badge></div> },
    { key: 'bank', header: 'Banka / seri', cell: (r) => [r.bank, r.serialNo].filter(Boolean).join(' · ') || '—' },
    { key: 'amount', header: 'Tutar', align: 'right', cell: (r) => (r.amount !== undefined ? fmtMoney(r.amount, r.currency) : '—') },
    ...(can('finans:yaz') ? [{ key: 'act', header: '', align: 'right' as const, cell: (r: Cheque) => <ChequeStatusMenu c={r} /> }] : []),
  ];

  const info: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <UserRound />, label: 'Yetkili', value: party.contactName },
    { icon: <Phone />, label: 'Telefon', value: party.phone ? <a href={`tel:${party.phone.replace(/\s/g, '')}`} className="text-brand-700 hover:underline">{party.phone}</a> : null },
    { icon: <Mail />, label: 'E-posta', value: party.email ? <a href={`mailto:${party.email}`} className="text-brand-700 hover:underline">{party.email}</a> : null },
    { icon: <MapPin />, label: 'Adres', value: [party.address, party.city].filter(Boolean).join(' · ') || null },
    { icon: <Receipt />, label: 'Vergi', value: [party.taxOffice, party.taxNo].filter(Boolean).join(' · ') || null },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        back={back}
        title={party.name}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <RoleBadges roles={party.roles} />
            {!party.active && <Badge tone="red">Pasif</Badge>}
          </span>
        }
        actions={
          can('cari:yaz') && (
            <>
              <button
                className="btn-outline"
                disabled={toggleActive.isPending}
                onClick={async () => {
                  if (party.active && !(await confirm(`"${party.name}" pasife alınacak. Listelerde ve seçimlerde görünmez; geçmiş kayıtları korunur.`))) return;
                  toggleActive.mutate(!party.active);
                }}
              >
                <Power className="size-4" /> {party.active ? 'Pasife al' : 'Aktif yap'}
              </button>
              <button className="btn-primary" onClick={() => setEdit(true)}>
                <Pencil className="size-4" /> Düzenle
              </button>
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Cari bilgileri" className="lg:col-span-2">
          <dl className="grid gap-3 sm:grid-cols-2">
            {info.map((x) => (
              <div key={x.label} className="flex gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500 [&_svg]:size-4">{x.icon}</div>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{x.label}</dt>
                  <dd className="break-words text-sm text-ink-800">{x.value || <span className="text-ink-400">—</span>}</dd>
                </div>
              </div>
            ))}
            {party.roles.includes('FASONCU') && (
              <div className="flex gap-3 sm:col-span-2">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 [&_svg]:size-4"><Handshake /></div>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Fason uzmanlığı</dt>
                  <dd className="mt-0.5 flex flex-wrap gap-1 text-sm">
                    {party.specialties.length ? party.specialties.map((s) => <Badge key={s} tone="violet">{stageLabel(s)}</Badge>) : <span className="text-ink-400">Belirtilmemiş</span>}
                    {party.dailyCapacity ? <span className="text-xs text-ink-500">· Günlük kapasite {fmtNum(party.dailyCapacity)} adet</span> : null}
                  </dd>
                </div>
              </div>
            )}
          </dl>
          {party.note && <p className="mt-4 whitespace-pre-line rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-700">{party.note}</p>}
        </Card>

        {balance !== undefined ? (
          <Card title="Cari bakiye">
            <div className="flex items-center gap-3">
              <div className={cx('grid size-12 place-items-center rounded-2xl', balance > 0 ? 'bg-emerald-50 text-emerald-700' : balance < 0 ? 'bg-red-50 text-red-600' : 'bg-ink-100 text-ink-500')}>
                <Scale className="size-6" />
              </div>
              <div>
                <div className="text-xs font-semibold text-ink-500">{balance > 0 ? 'Alacağımız' : balance < 0 ? 'Borcumuz' : 'Hesap kapalı'}</div>
                <div className={cx('num text-2xl font-bold', balance > 0 ? 'text-emerald-700' : balance < 0 ? 'text-red-600' : 'text-ink-700')}>{fmtMoney(Math.abs(balance))}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-500">
              {balance > 0 ? 'Bu cari bize borçlu.' : balance < 0 ? 'Bu cariye borçluyuz.' : 'Borç / alacak bulunmuyor.'} TL dışı hareketler de tutar üzerinden toplanır.
            </p>
            {cheques.length > 0 && (
              <p className="mt-2 text-xs text-ink-600">
                Portföyde <b>{cheques.length}</b> çek/senet var.
              </p>
            )}
            {can('finans:yaz') && (
              <button className="btn-accent mt-4 w-full" onClick={() => setTxOpen(true)}>
                <Plus className="size-4" /> Hareket ekle
              </button>
            )}
          </Card>
        ) : (
          <Card title="Özet">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-ink-50 p-3"><div className="num text-2xl font-bold">{orders.length}</div><div className="text-xs text-ink-500">Sipariş</div></div>
              <div className="rounded-xl bg-ink-50 p-3"><div className="num text-2xl font-bold">{fason.length}</div><div className="text-xs text-ink-500">Fason işi</div></div>
            </div>
          </Card>
        )}
      </div>

      {(orders.length > 0 || party.roles.includes('MUSTERI')) && (
        <Card title="Siparişler" subtitle="Son 20 sipariş" bodyClass="p-0">
          <Table rows={orders} columns={orderCols} rowKey={(r) => r.id} empty={<Empty icon={<FileText className="size-6" />} title="Sipariş yok" text="Bu müşteriye ait sipariş bulunmuyor." />} />
        </Card>
      )}

      {(fason.length > 0 || party.roles.includes('FASONCU')) && (
        <Card title="Fason işleri" subtitle="Son 20 gönderim" bodyClass="p-0">
          <Table rows={fason} columns={fasonCols} rowKey={(r) => r.id} empty={<Empty icon={<Handshake className="size-6" />} title="Fason işi yok" text="Bu atölyeye henüz iş gönderilmedi." />} />
        </Card>
      )}

      {showFin && (
        <>
          <Card title="Portföydeki çek / senetler" bodyClass="p-0">
            <Table rows={cheques} columns={chequeCols} rowKey={(r) => r.id} empty={<Empty icon={<Landmark className="size-6" />} title="Portföyde çek/senet yok" />} />
          </Card>
          <Card
            title="Cari hareketler"
            subtitle="Son 100 hareket"
            bodyClass="p-0"
            actions={
              can('finans:yaz') && (
                <button className="btn-outline btn-sm" onClick={() => setTxOpen(true)}>
                  <Plus className="size-3.5" /> Hareket ekle
                </button>
              )
            }
          >
            {txs.isLoading ? <Loading /> : txs.error ? <div className="p-4"><ErrorBox error={txs.error} /></div> : <TransactionTable rows={txs.data ?? []} showParty={false} csvName={`cari-ekstre-${party.name}`} />}
          </Card>
        </>
      )}

      <PartyModal open={edit} onClose={() => setEdit(false)} party={party} />
      {can('finans:yaz') && <TransactionModal open={txOpen} onClose={() => setTxOpen(false)} partyId={party.id} partyName={party.name} />}
      {node}
    </div>
  );
}
