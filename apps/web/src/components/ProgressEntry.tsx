import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Handshake, Minus, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtNum } from '@/lib/format';
import { Field, Loading, Modal, SizeGrid } from './ui';

/** Bir aşamaya üretim kaydı girişi (atölye panosu ve iş emri detayında ortak) */
export function ProgressEntry({ workOrderId, stageId, onClose }: { workOrderId: string; stageId: string; onClose: () => void }) {
  const { stageLabel, can } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ['workorder', workOrderId], queryFn: () => api.get<any>(`/production/work-orders/${workOrderId}`) });
  const [qty, setQty] = useState<number | ''>('');
  const [defect, setDefect] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [useSizes, setUseSizes] = useState(false);
  const save = useAction(
    () => api.post(`/production/stages/${stageId}/progress`, { qty: Number(qty || 0), defectQty: Number(defect || 0), note: note || null, sizes: useSizes ? sizes : null }),
    { success: 'Üretim kaydı girildi', invalidate: [['board'], ['workorder', workOrderId], ['workorders'], ['orders']], onDone: onClose },
  );

  const wo = data?.workOrder;
  const stages: any[] = wo?.stages ?? [];
  const idx = stages.findIndex((s) => s.id === stageId);
  const stage = stages[idx];
  const prev = idx > 0 ? stages[idx - 1] : null;
  const input = prev ? prev.doneQty : wo?.plannedQty ?? 0;
  const available = stage ? Math.max(0, input - stage.doneQty - stage.defectQty) : 0;
  const isLast = idx === stages.length - 1;
  const sizeKeys = wo ? Object.keys(wo.sizes as Record<string, number>) : [];
  const sizeTotal = Object.values(sizes).reduce((a, b) => a + b, 0);
  const n = Number(qty || 0) + Number(defect || 0);
  const invalid = n <= 0 || (!!prev && n > available) || (useSizes && sizeTotal !== Number(qty || 0));

  return (
    <Modal
      open
      onClose={onClose}
      title={stage ? `${stageLabel(stage.stage)} — üretim kaydı` : 'Üretim kaydı'}
      footer={<><button className="btn-outline" onClick={onClose}>Vazgeç</button><button className="btn-primary" disabled={save.isPending || invalid || stage?.outsourced && !can('fason:yaz')} onClick={() => save.mutate()}>Kaydet</button></>}
    >
      {isLoading || !wo || !stage ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-ink-50 p-3 text-sm">
            <div className="font-semibold text-ink-900">{wo.no} · {wo.model.code} {wo.model.name}</div>
            <div className="text-ink-600">{wo.color} · planlanan {fmtNum(wo.plannedQty)} adet</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white p-2 ring-1 ring-ink-200"><div className="num text-lg font-bold">{fmtNum(input)}</div><div className="text-[10px] font-semibold uppercase text-ink-500">{prev ? `${stageLabel(prev.stage)} çıkışı` : 'Planlanan'}</div></div>
              <div className="rounded-xl bg-white p-2 ring-1 ring-ink-200"><div className="num text-lg font-bold">{fmtNum(stage.doneQty)}</div><div className="text-[10px] font-semibold uppercase text-ink-500">Bu aşamada yapılan</div></div>
              <div className="rounded-xl bg-brand-50 p-2 ring-1 ring-brand-200"><div className="num text-lg font-bold text-brand-800">{fmtNum(available)}</div><div className="text-[10px] font-semibold uppercase text-brand-700">Bekleyen</div></div>
            </div>
          </div>
          {stage.outsourced && (
            <div className="flex items-start gap-2 rounded-xl bg-violet-50 p-3 text-sm text-violet-800 ring-1 ring-violet-200">
              <Handshake className="mt-0.5 size-4 shrink-0" />
              <span>Bu aşama fasonda. Dönüşleri <Link to="/fason" className="font-semibold underline">Fason Takibi</Link> ekranından girmeniz önerilir; böylece fasoncu karnesi de güncellenir.</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sağlam adet">
              <Stepper value={qty} onChange={setQty} />
            </Field>
            <Field label="Fire / hatalı">
              <Stepper value={defect} onChange={setDefect} />
            </Field>
          </div>
          {available > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-outline btn-sm" onClick={() => setQty(available - Number(defect || 0))}>Bekleyenin tamamı ({fmtNum(available)})</button>
              {[10, 20, 50].filter((x) => x < available).map((x) => <button key={x} type="button" className="btn-ghost btn-sm" onClick={() => setQty(x)}>{x}</button>)}
            </div>
          )}
          {prev && n > available && <p className="text-sm font-semibold text-red-600">Bekleyen adetten ({fmtNum(available)}) fazla girilemez. Eksik adet varsa önceki aşamayı kontrol edin.</p>}
          {isLast && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
                <input type="checkbox" checked={useSizes} onChange={(e) => setUseSizes(e.target.checked)} className="size-4 rounded" />
                Beden kırılımını elle gir (girmezseniz asorti oranında dağıtılır)
              </label>
              {useSizes && (
                <div className="mt-2">
                  <SizeGrid sizes={sizeKeys} value={sizes} onChange={setSizes} />
                  {sizeTotal !== Number(qty || 0) && <p className="mt-1 text-xs text-red-600">Beden toplamı ({sizeTotal}) sağlam adetle ({Number(qty || 0)}) aynı olmalı.</p>}
                </div>
              )}
              <p className="mt-2 text-xs text-ink-500">Son aşama: sağlam adetler mamul depoya girer.</p>
            </div>
          )}
          <Field label="Not (isteğe bağlı)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Örn. 2. bant, akşam vardiyası" /></Field>
        </div>
      )}
    </Modal>
  );
}

function Stepper({ value, onChange }: { value: number | ''; onChange: (v: number | '') => void }) {
  const v = Number(value || 0);
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="btn-outline px-2.5 py-2" onClick={() => onChange(Math.max(0, v - 1))} aria-label="Azalt"><Minus className="size-4" /></button>
      <input type="number" inputMode="numeric" min={0} className="input num text-center text-lg font-bold" value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))} placeholder="0" />
      <button type="button" className="btn-outline px-2.5 py-2" onClick={() => onChange(v + 1)} aria-label="Artır"><Plus className="size-4" /></button>
    </div>
  );
}
