import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, ClipboardCheck, Handshake, PlusCircle, Printer, RotateCcw, Scissors } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtDateTime, fmtNum, fmtQty } from '@/lib/format';
import { FASON_STATUS, WO_STATUS, statusTone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Progress, Select, SizeChips, SizeGrid, Table, useConfirm } from '@/components/ui';
import { StagePipeline } from '@/components/StagePipeline';
import { ProgressEntry } from '@/components/ProgressEntry';

export default function WorkOrderDetail() {
  const { id } = useParams();
  const { can, stageLabel } = useSession();
  const { confirm, node } = useConfirm();
  const { data, isLoading, error } = useQuery({ queryKey: ['workorder', id], queryFn: () => api.get<any>(`/production/work-orders/${id}`) });
  const [entry, setEntry] = useState<string | null>(null);
  const [cutOpen, setCutOpen] = useState(false);
  const inv = [['workorder', id!], ['workorders'], ['board']];
  const undo = useAction((logId: string) => api.del(`/production/logs/${logId}`), { success: 'Kayıt geri alındı', invalidate: inv });
  const cancel = useAction((status: string) => api.patch(`/production/work-orders/${id}`, { status }), { success: 'İş emri güncellendi', invalidate: inv });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const w = data.workOrder;
  const closed = w.status === 'TAMAMLANDI' || w.status === 'IPTAL';
  const logs = w.stages.flatMap((s: any) => s.logs.map((l: any) => ({ ...l, stage: s.stage }))).sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const overdue = !closed && new Date(w.dueDate) < new Date();
  const cur = w.stages.find((s: any) => s.status !== 'TAMAM');
  const c = data.cutting;

  return (
    <div className="space-y-5">
      {node}
      <PageHeader
        back={<Link to="/uretim" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-800"><ArrowLeft className="size-3.5" /> İş emirleri</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{w.no} <Badge tone={statusTone(w.status)}>{WO_STATUS[w.status]}</Badge>{overdue && <Badge tone="red">Gecikti</Badge>}</span>}
        subtitle={<><Link to={`/modeller/${w.model.id}`} className="font-semibold text-brand-700 hover:underline">{w.model.code}</Link> {w.model.name} · {w.color}{w.order && <> · <Link to={`/siparisler/${w.order.id}`} className="hover:underline">{w.order.no} ({w.order.customer.name})</Link></>}</>}
        actions={
          <>
            <button className="btn-outline no-print" onClick={() => window.print()}><Printer className="size-4" /> Föy yazdır</button>
            {can('uretim:yaz') && !closed && w.stages.some((s: any) => s.stage === 'KESIM') && <button className="btn-outline" onClick={() => setCutOpen(true)}><Scissors className="size-4" /> Kesim kaydı</button>}
            {can('fason:yaz') && !closed && cur && <Link className="btn-outline" to={`/fason?yeni=1&wo=${w.id}&stage=${cur.stage}`}><Handshake className="size-4" /> Fasona gönder</Link>}
            {can('uretim:kayit') && !closed && cur && <button className="btn-primary" onClick={() => setEntry(cur.id)}><PlusCircle className="size-4" /> {stageLabel(cur.stage)} kaydı</button>}
          </>
        }
      />

      <Card title="Aşamalar" subtitle="Kayıt girmek için aşamaya dokunun">
        <StagePipeline stages={w.stages} planned={w.plannedQty} onStageClick={can('uretim:kayit') && !closed ? (s) => setEntry(s.id) : undefined} />
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div><div className="text-xs text-ink-500">Planlanan</div><div className="num text-lg font-bold">{fmtNum(w.plannedQty)}</div><SizeChips sizes={w.sizes} /></div>
          <div><div className="text-xs text-ink-500">Paketlenen (mamul)</div><div className="num text-lg font-bold">{fmtNum(data.finished)}</div></div>
          <div><div className="text-xs text-ink-500">Toplam fire</div><div className="num text-lg font-bold text-red-600">{fmtNum(w.stages.reduce((a: number, s: any) => a + s.defectQty, 0))}</div></div>
          <div><div className="text-xs text-ink-500">Termin</div><div className={overdue ? 'num text-lg font-bold text-red-600' : 'num text-lg font-bold'}>{fmtDate(w.dueDate)}</div><Progress value={data.progress} /></div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Kesim / pastal kayıtları" subtitle={c.cutQty ? `Kesilen ${fmtNum(c.cutQty)} adet · kullanılan ${fmtQty(c.used)}${c.planned !== null ? ` · reçeteye göre ${fmtQty(c.planned)}` : ''}` : undefined} bodyClass="p-0">
          {c.wastePct !== null && (
            <div className={`mx-4 mt-3 rounded-xl px-3 py-2 text-sm ${c.wastePct > 3 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              Kumaş sarfiyat farkı: <b>%{fmtNum(c.wastePct, 1)}</b> {c.wastePct > 3 ? '— reçeteden fazla kumaş gitti, pastal verimini kontrol edin.' : c.wastePct < 0 ? '— reçeteden az kumaşla kesildi.' : '— normal.'}
            </div>
          )}
          <Table
            rows={w.cuttings}
            rowKey={(r: any) => r.id}
            empty={<Empty title="Kesim kaydı yok" text="Kesim kaydı, kumaşı depodan (top/parti bazında) otomatik düşer ve kesim aşamasını ilerletir." />}
            columns={[
              { key: 'd', header: 'Tarih', cell: (r: any) => fmtDate(r.date) },
              { key: 'l', header: 'Parti / top', cell: (r: any) => (r.lot ? `${r.lot.lotNo}${r.lot.rollNo ? ` / ${r.lot.rollNo}` : ''}` : '—') },
              { key: 'k', header: 'Kat × boy', cell: (r: any) => `${r.layers} × ${fmtQty(r.markerLength)} m` },
              { key: 'u', header: 'Kumaş', align: 'right', cell: (r: any) => fmtQty(r.fabricUsed) },
              { key: 's', header: 'Beden', cell: (r: any) => <SizeChips sizes={r.sizes} /> },
              { key: 'q', header: 'Adet', align: 'right', cell: (r: any) => fmtNum(r.cutQty) },
            ]}
          />
        </Card>

        <Card title="Fason işleri" bodyClass="p-0">
          <Table
            rows={w.fasonJobs}
            rowKey={(r: any) => r.id}
            empty={<Empty title="Fasona giden iş yok" />}
            columns={[
              { key: 'n', header: 'No', cell: (r: any) => <Link to={`/fason/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.no}</Link> },
              { key: 'p', header: 'Fasoncu', cell: (r: any) => r.party.name },
              { key: 's', header: 'Aşama', cell: (r: any) => stageLabel(r.stage) },
              { key: 'q', header: 'Gönd. / dönen', align: 'right', cell: (r: any) => `${fmtNum(r.sentQty)} / ${fmtNum(r.receivedQty)}` },
              { key: 'st', header: 'Durum', cell: (r: any) => <Badge tone={statusTone(r.status)}>{FASON_STATUS[r.status]}</Badge> },
            ]}
          />
        </Card>
      </div>

      <Card title="Üretim hareketleri" subtitle="Hatalı girilen kayıt 24 saat içinde geri alınabilir" bodyClass="p-0">
        <Table
          rows={logs}
          rowKey={(r: any) => r.id}
          dense
          csvName={`${w.no}-hareketler`}
          empty={<Empty title="Henüz kayıt girilmedi" />}
          columns={[
            { key: 't', header: 'Zaman', cell: (r: any) => fmtDateTime(r.createdAt), csv: (r: any) => fmtDateTime(r.createdAt) },
            { key: 's', header: 'Aşama', cell: (r: any) => stageLabel(r.stage), csv: (r: any) => stageLabel(r.stage) },
            { key: 'q', header: 'Sağlam', align: 'right', cell: (r: any) => fmtNum(r.qty), csv: (r: any) => r.qty },
            { key: 'f', header: 'Fire', align: 'right', cell: (r: any) => (r.defectQty ? <span className="text-red-600">{r.defectQty}</span> : '—'), csv: (r: any) => r.defectQty },
            { key: 'src', header: 'Kaynak', cell: (r: any) => <Badge tone={r.source === 'FASON' ? 'violet' : r.source === 'KESIM' ? 'amber' : 'gray'}>{r.source === 'FASON' ? 'Fason' : r.source === 'KESIM' ? 'Kesim' : 'Atölye'}</Badge>, csv: (r: any) => r.source },
            { key: 'u', header: 'Giren', cell: (r: any) => <span className="text-ink-600">{r.userName ?? '—'}</span>, csv: (r: any) => r.userName },
            { key: 'n', header: 'Not', cell: (r: any) => <span className="text-ink-600">{r.note ?? ''}</span>, csv: (r: any) => r.note },
            {
              key: 'x', header: '',
              cell: (r: any) =>
                can('uretim:yaz') && r.source !== 'FASON' && Date.now() - +new Date(r.createdAt) < 24 * 3600_000 ? (
                  <button className="btn-ghost btn-sm text-ink-500" onClick={async () => (await confirm(`${stageLabel(r.stage)} aşamasındaki ${r.qty} adetlik kayıt geri alınsın mı?`)) && undo.mutate(r.id)}><RotateCcw className="size-3.5" /> Geri al</button>
                ) : null,
            },
          ]}
        />
      </Card>

      {w.qualityChecks.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><ClipboardCheck className="size-4" /> Kalite kontrolleri</span>} bodyClass="p-0">
          <Table
            rows={w.qualityChecks}
            rowKey={(r: any) => r.id}
            columns={[
              { key: 'd', header: 'Tarih', cell: (r: any) => fmtDate(r.date) },
              { key: 's', header: 'Aşama', cell: (r: any) => stageLabel(r.stage) },
              { key: 'c', header: 'Kontrol', align: 'right', cell: (r: any) => r.checkedQty },
              { key: 'p', header: 'Sağlam', align: 'right', cell: (r: any) => r.passedQty },
              { key: 'x', header: 'Hatalar', cell: (r: any) => <SizeChips sizes={r.defects} /> },
            ]}
          />
        </Card>
      )}

      {can('uretim:yaz') && (
        <div className="no-print flex gap-2 border-t border-ink-200 pt-4">
          {w.status !== 'IPTAL' && w.status !== 'TAMAMLANDI' && <button className="btn-outline text-red-600" onClick={async () => (await confirm('İş emri iptal edilsin mi? Girilmiş kayıtlar silinmez.')) && cancel.mutate('IPTAL')}><Ban className="size-4" /> İş emrini iptal et</button>}
          {w.status === 'IPTAL' && <button className="btn-outline" onClick={() => cancel.mutate('PLANLANDI')}>Yeniden aç</button>}
        </div>
      )}

      {entry && <ProgressEntry workOrderId={w.id} stageId={entry} onClose={() => setEntry(null)} />}
      {cutOpen && <CuttingModal wo={w} onClose={() => setCutOpen(false)} />}
    </div>
  );
}

function CuttingModal({ wo, onClose }: { wo: any; onClose: () => void }) {
  const fabrics = wo.model.materials.filter((m: any) => ['KUMAS', 'ASTAR'].includes(m.material.type));
  const [materialId, setMaterialId] = useState<string>(fabrics[0]?.material.id ?? '');
  const mat = useQuery({ queryKey: ['material', materialId], queryFn: () => api.get<any>(`/stock/materials/${materialId}`), enabled: !!materialId });
  const cutStage = wo.stages.find((s: any) => s.stage === 'KESIM');
  const remaining = Math.max(0, wo.plannedQty - (cutStage?.doneQty ?? 0));
  const [f, setF] = useState({ lotId: '', layers: '', markerLength: '', fabricUsed: '', note: '' });
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const consumption = fabrics.find((m: any) => m.material.id === materialId)?.consumption;
  const suggested = consumption ? Math.round(Number(consumption) * total * 100) / 100 : null;
  const save = useAction(
    () => api.post(`/production/work-orders/${wo.id}/cuttings`, { materialId: materialId || null, lotId: f.lotId || null, layers: Number(f.layers), markerLength: Number(f.markerLength || 0), fabricUsed: Number(f.fabricUsed || 0), sizes, note: f.note || null }),
    { success: 'Kesim kaydedildi, kumaş stoktan düşüldü', invalidate: [['workorder', wo.id], ['workorders'], ['board'], ['materials']], onDone: onClose },
  );
  const lots = (mat.data?.material?.lots ?? []).filter((l: any) => Number(l.remaining) > 0);
  return (
    <Modal open onClose={onClose} title="Kesim / pastal kaydı" wide footer={<><button className="btn-outline" onClick={onClose}>Vazgeç</button><button className="btn-primary" disabled={!total || !f.layers || save.isPending} onClick={() => save.mutate()}>Kesimi kaydet</button></>}>
      <p className="mb-4 text-sm text-ink-600">Kesilecek kalan: <b>{fmtNum(remaining)}</b> adet. Kesimi hangi top/partiden yaptığınızı girerseniz ton farkı sorununda geriye dönük izleyebilirsiniz.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Kumaş">
          <Select value={materialId} onChange={(v) => { setMaterialId(v); setF({ ...f, lotId: '' }); }} options={fabrics.map((m: any) => ({ value: m.material.id, label: `${m.material.code} · ${m.material.name}` }))} placeholder={fabrics.length ? 'Kumaş kullanmadan kaydet' : 'Model reçetesinde kumaş yok'} />
        </Field>
        <Field label="Parti / top">
          <Select value={f.lotId} onChange={(v) => setF({ ...f, lotId: v })} options={lots.map((l: any) => ({ value: l.id, label: `Parti ${l.lotNo}${l.rollNo ? ` · Top ${l.rollNo}` : ''} — kalan ${fmtQty(l.remaining)}` }))} placeholder="Belirtme" disabled={!materialId} />
        </Field>
        <Field label="Pastal kat sayısı" required><input type="number" min={1} className="input num" value={f.layers} onChange={(e) => setF({ ...f, layers: e.target.value })} /></Field>
        <Field label="Pastal boyu (m)"><input type="number" min={0} step="0.01" className="input num" value={f.markerLength} onChange={(e) => setF({ ...f, markerLength: e.target.value })} /></Field>
        <Field label={`Kullanılan kumaş (${mat.data?.material?.unit?.toLocaleLowerCase('tr') ?? 'metre'})`} hint={suggested ? `Reçeteye göre beklenen: ${fmtQty(suggested)}` : f.layers && f.markerLength ? `Kat × boy = ${fmtQty(Number(f.layers) * Number(f.markerLength))}` : undefined}>
          <input type="number" min={0} step="0.01" className="input num" value={f.fabricUsed} onChange={(e) => setF({ ...f, fabricUsed: e.target.value })} />
        </Field>
        <Field label="Not"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></Field>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="label">Kesilen beden adetleri</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSizes({ ...(wo.sizes as Record<string, number>) })}>Asortiyi aynen al</button>
        </div>
        <SizeGrid sizes={Object.keys(wo.sizes)} value={sizes} onChange={setSizes} />
      </div>
    </Modal>
  );
}
