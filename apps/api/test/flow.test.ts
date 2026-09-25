import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, signup, Client } from './helpers.js';

let app: FastifyInstance;
let c: Client;
beforeAll(async () => {
  app = await makeApp();
  c = (await signup(app, 'Akış Tekstil')).c;
});
afterAll(async () => { await app.close(); });

describe('Uçtan uca üretim akışı', () => {
  const ids: Record<string, any> = {};

  it('cari, kumaş, model ve reçete tanımlanır', async () => {
    ids.customer = (await c.post('/api/parties', { name: 'Moda Mağazaları', roles: ['MUSTERI'] })).body.id;
    ids.supplier = (await c.post('/api/parties', { name: 'Bursa Kumaş', roles: ['TEDARIKCI'] })).body.id;
    ids.fasoncu = (await c.post('/api/parties', { name: 'Hasan Usta Dikim', roles: ['FASONCU'], specialties: ['DIKIM'] })).body.id;
    const mat = await c.post('/api/stock/materials', { type: 'KUMAS', code: 'GAB-01', name: 'Gabardin', color: 'Lacivert', unit: 'METRE', unitPrice: 100, minStock: 50, supplierId: ids.supplier });
    expect(mat.status).toBe(200);
    ids.material = mat.body.id;
    const inb = await c.post(`/api/stock/materials/${ids.material}/movements`, { type: 'GIRIS', quantity: 0, lots: [{ lotNo: 'P-77', rollNo: '1', quantity: 80 }, { lotNo: 'P-77', rollNo: '2', quantity: 70 }], docNo: 'IRS-1' });
    expect(inb.status).toBe(200);
    const m = await c.post('/api/models', { code: 'PNT-2026', name: 'Klasik Pantolon', category: 'Pantolon', sizes: ['S', 'M', 'L'], colors: ['Lacivert'], route: ['KESIM', 'DIKIM', 'UTU', 'PAKET'], salePrice: 450 });
    ids.model = m.body.id;
    const recipe = await c.put(`/api/models/${ids.model}/recipe`, {
      materials: [{ materialId: ids.material, consumption: 1.2 }],
      operations: [{ name: 'Yan dikiş', stage: 'DIKIM', minutes: 3, pieceRate: 4 }, { name: 'Ütü', stage: 'UTU', minutes: 2, pieceRate: 2 }],
    });
    expect(recipe.status).toBe(200);
    expect(recipe.body.cost.materialCost).toBe(120);
  });

  it('sipariş açılır, malzeme ihtiyacı hesaplanır, iş emri oluşturulur', async () => {
    const o = await c.post('/api/orders', { customerId: ids.customer, dueDate: new Date(Date.now() + 10 * 86400_000).toISOString(), lines: [{ modelId: ids.model, color: 'Lacivert', sizes: { S: 30, M: 40, L: 30 }, unitPrice: 450 }] });
    expect(o.status).toBe(200);
    expect(o.body.no).toMatch(/^SIP-\d{4}-0001$/);
    ids.order = o.body.id;
    const reqs = (await c.get('/api/stock/requirements')).body;
    expect(reqs[0].required).toBe(120);
    expect(reqs[0].shortage).toBe(0);
    const wo = await c.post(`/api/orders/${ids.order}/work-orders`);
    expect(wo.body.created).toHaveLength(1);
    const list = (await c.get('/api/production/work-orders')).body;
    ids.wo = list[0].id;
    ids.stages = Object.fromEntries(list[0].stages.map((s: any) => [s.stage, s.id]));
    expect(Object.keys(ids.stages)).toEqual(['KESIM', 'DIKIM', 'UTU', 'PAKET']);
  });

  it('kesim kaydı kumaşı topdan düşer ve kesim aşamasını ilerletir', async () => {
    const mat = (await c.get(`/api/stock/materials/${ids.material}`)).body.material;
    const lot = mat.lots.find((l: any) => l.rollNo === '1');
    const r = await c.post(`/api/production/work-orders/${ids.wo}/cuttings`, { lotId: lot.id, layers: 50, markerLength: 2.5, fabricUsed: 75, sizes: { S: 30, M: 40, L: 30 } });
    expect(r.status).toBe(200);
    const after = (await c.get(`/api/stock/materials/${ids.material}`)).body.material;
    expect(Number(after.stock)).toBe(75);
    expect(Number(after.lots.find((l: any) => l.rollNo === '1').remaining)).toBe(5);
    const d = (await c.get(`/api/production/work-orders/${ids.wo}`)).body;
    expect(d.workOrder.stages[0].status).toBe('TAMAM');
    expect(d.cutting.wastePct).toBeLessThan(0); // plandan az kumaş kullanıldı
  });

  it('dikim fasona gönderilir, kısmi ve tam dönüş aşamaya işlenir', async () => {
    const j = await c.post('/api/fason', { partyId: ids.fasoncu, workOrderId: ids.wo, stage: 'DIKIM', sentQty: 100, unitPrice: 12, dueDate: new Date(Date.now() + 5 * 86400_000).toISOString(), dispatchNo: 'FI-1' });
    expect(j.status).toBe(200);
    ids.fason = j.body.id;
    // Fazla dönüş girilemez
    expect((await c.post(`/api/fason/${ids.fason}/receipts`, { qty: 101 })).status).toBe(400);
    expect((await c.post(`/api/fason/${ids.fason}/receipts`, { qty: 60, defectQty: 2 })).status).toBe(200);
    let f = (await c.get(`/api/fason/${ids.fason}`)).body;
    expect(f.status).toBe('KISMI_DONDU');
    expect(f.pending).toBe(38);
    expect((await c.post(`/api/fason/${ids.fason}/receipts`, { qty: 38 })).status).toBe(200);
    f = (await c.get(`/api/fason/${ids.fason}`)).body;
    expect(f.status).toBe('TAMAMLANDI');
    const d = (await c.get(`/api/production/work-orders/${ids.wo}`)).body;
    const dikim = d.workOrder.stages.find((s: any) => s.stage === 'DIKIM');
    expect(dikim.doneQty).toBe(98);
    expect(dikim.defectQty).toBe(2);
    expect(dikim.status).toBe('TAMAM');
  });

  it('önceki aşamadan fazla adet girilemez (kayıp adet yakalanır)', async () => {
    const r = await c.post(`/api/production/stages/${ids.stages.UTU}/progress`, { qty: 99 });
    expect(r.status).toBe(400);
    expect((await c.post(`/api/production/stages/${ids.stages.UTU}/progress`, { qty: 98 })).status).toBe(200);
  });

  it('paketlenen ürün beden kırılımıyla mamul stoğa girer', async () => {
    const bad = await c.post(`/api/production/stages/${ids.stages.PAKET}/progress`, { qty: 98, sizes: { S: 30, M: 40, L: 20 } });
    expect(bad.status).toBe(400);
    const ok = await c.post(`/api/production/stages/${ids.stages.PAKET}/progress`, { qty: 98, sizes: { S: 30, M: 39, L: 29 } });
    expect(ok.status).toBe(200);
    const stock = (await c.get('/api/finished/stock')).body;
    expect(stock[0].total).toBe(98);
    expect(stock[0].sizes).toEqual({ S: 30, M: 39, L: 29 });
    const wo = (await c.get(`/api/production/work-orders/${ids.wo}`)).body.workOrder;
    expect(wo.status).toBe('TAMAMLANDI');
  });

  it('sevkiyat stoktan düşer, siparişi günceller ve fatura keser', async () => {
    const order = (await c.get(`/api/orders/${ids.order}`)).body.order;
    const lineId = order.lines[0].id;
    const tooMuch = await c.post('/api/finished/shipments', { customerId: ids.customer, orderId: ids.order, lines: [{ orderLineId: lineId, modelId: ids.model, color: 'Lacivert', sizes: { S: 31 } }] });
    expect(tooMuch.status).toBe(400);
    const s = await c.post('/api/finished/shipments', { customerId: ids.customer, orderId: ids.order, dispatchNo: 'IRS-900', createInvoice: true, lines: [{ orderLineId: lineId, modelId: ids.model, color: 'Lacivert', sizes: { S: 30, M: 39, L: 29 } }] });
    expect(s.status).toBe(200);
    const o = (await c.get(`/api/orders/${ids.order}`)).body;
    expect(o.order.status).toBe('KISMI_SEVK');
    expect(o.summary.shipped).toBe(98);
    const bal = (await c.get('/api/finance/balances')).body;
    expect(bal[0].balance).toBe(98 * 450);
    expect((await c.get('/api/finished/stock')).body).toHaveLength(0);
  });

  it('fasoncu karnesi ve kontrol kulesi verisi üretilir', async () => {
    const perf = (await c.get('/api/fason/performance')).body;
    expect(perf[0].onTimePct).toBe(100);
    expect(perf[0].defectPct).toBe(2);
    const dash = (await c.get('/api/dashboard')).body;
    expect(dash.kpi).toHaveProperty('openOrders');
    expect(Array.isArray(dash.alerts)).toBe(true);
    const search = (await c.get('/api/dashboard/search?q=PNT')).body;
    expect(search.some((r: any) => r.type === 'Model')).toBe(true);
  });

  it('başka firma bu iş emrinin aşamasına kayıt giremez', async () => {
    const other = (await signup(app, 'Rakip')).c;
    expect((await other.post(`/api/production/stages/${ids.stages.UTU}/progress`, { qty: 1 })).status).toBe(404);
    expect((await other.post(`/api/fason/${ids.fason}/receipts`, { qty: 1 })).status).toBe(404);
    expect((await other.get(`/api/production/work-orders/${ids.wo}`)).status).toBe(404);
  });

  it('çek vadesi yaklaşınca kontrol kulesinde uyarı çıkar', async () => {
    await c.post('/api/finance/cheques', { direction: 'VERILEN', partyId: ids.supplier, amount: 15000, dueDate: new Date(Date.now() + 86400_000).toISOString(), bank: 'Ziraat' });
    const dash = (await c.get('/api/dashboard')).body;
    expect(dash.alerts.some((a: any) => a.module === 'finans' && a.level === 'kritik')).toBe(true);
  });

  it('puantaj ve hak ediş hesaplanır', async () => {
    const e = (await c.post('/api/personnel/employees', { firstName: 'Ayşe', lastName: 'Kaya', department: 'Dikimhane', wageType: 'GUNLUK', wage: 1000 })).body;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const date = `${month}-01`;
    expect((await c.put('/api/personnel/attendance', { date, entries: [{ employeeId: e.id, status: 'GELDI', overtime: 2 }] })).status).toBe(200);
    const pay = (await c.get(`/api/personnel/payroll?month=${month}`)).body;
    const row = pay.find((p: any) => p.employee.id === e.id);
    expect(row.worked).toBe(1);
    expect(row.base).toBe(1000);
  });
});
