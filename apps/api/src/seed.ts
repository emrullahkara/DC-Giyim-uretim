/**
 * Demo veri: gerçekçi bir konfeksiyon atölyesi senaryosu oluşturur.
 * Veriler API üzerinden girilir; böylece tüm iş kuralları (stok, aşama, fason) uygulanır.
 *
 *   DEMO_EMAIL=demo@dcgiyim.com DEMO_PASSWORD='...' npm run db:seed -w apps/api
 */
process.env.RATE_LIMIT_FACTOR ??= '100';
process.env.NODE_ENV ??= 'development';
process.env.LOG_LEVEL ??= 'warn';

const { buildApp } = await import('./app.js');
const { prisma } = await import('./db.js');
const { passwordProblem } = await import('./lib/password.js');

const email = (process.env.DEMO_EMAIL ?? 'demo@dcgiyim.com').toLowerCase();
const password = process.env.DEMO_PASSWORD ?? '';
const problem = passwordProblem(password, email);
if (problem) {
  console.error(`DEMO_PASSWORD geçersiz: ${problem}`);
  process.exit(1);
}
if (await prisma.user.findUnique({ where: { email } })) {
  console.log(`${email} zaten var; demo verisi tekrar oluşturulmadı.`);
  process.exit(0);
}

const app = await buildApp();
await app.ready();
let cookie = '';
async function call(method: string, url: string, body?: unknown) {
  const res = await app.inject({ method: method as any, url: `/api${url}`, payload: body as any, headers: { 'x-dc-csrf': '1', ...(cookie ? { cookie } : {}) } });
  const set = res.headers['set-cookie'];
  if (set) cookie = String(Array.isArray(set) ? set[0] : set).split(';')[0];
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return res.json();
}
const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();

await call('POST', '/auth/signup', { companyName: 'Demo Konfeksiyon Atölyesi', name: 'Mehmet Usta', email, password });

// Cariler
const P = async (name: string, roles: string[], extra: object = {}) => (await call('POST', '/parties', { name, roles, ...extra })).id as string;
const lcw = await P('Moda Zinciri Mağazaları A.Ş.', ['MUSTERI'], { contactName: 'Selin Hanım', phone: '0212 555 10 10', city: 'İstanbul' });
const butik = await P('Kaya Butik', ['MUSTERI'], { contactName: 'Ali Kaya', phone: '0532 111 22 33', city: 'Bursa' });
const marka = await P('Nova Giyim (Marka)', ['MUSTERI'], { contactName: 'Üretim Sorumlusu Deniz', city: 'İstanbul' });
const kumasci = await P('Bursa Kumaş Tekstil', ['TEDARIKCI'], { phone: '0224 444 55 66', city: 'Bursa' });
const aksesuarci = await P('Merter Aksesuar', ['TEDARIKCI'], { city: 'İstanbul' });
const hasan = await P('Hasan Usta Dikim Atölyesi', ['FASONCU'], { specialties: ['DIKIM'], phone: '0533 222 33 44', dailyCapacity: 400 });
const yikama = await P('Ege Yıkama', ['FASONCU'], { specialties: ['YIKAMA'], phone: '0232 333 44 55', dailyCapacity: 1500 });
const nakis = await P('Yıldız Nakış', ['FASONCU'], { specialties: ['NAKIS', 'BASKI'], phone: '0535 999 88 77' });

// Malzemeler
const M = async (b: object) => (await call('POST', '/stock/materials', b)).id as string;
const gab = await M({ type: 'KUMAS', code: 'GAB-240', name: 'Gabardin 240 gr', color: 'Lacivert', unit: 'METRE', widthCm: 150, gsm: 240, composition: '%97 Pamuk %3 Elastan', unitPrice: 148, minStock: 300, supplierId: kumasci, location: 'A-1' });
const denim = await M({ type: 'KUMAS', code: 'DNM-12', name: 'Denim 12 oz', color: 'İndigo', unit: 'METRE', widthCm: 160, unitPrice: 185, minStock: 400, supplierId: kumasci, location: 'A-2' });
const poplin = await M({ type: 'KUMAS', code: 'POP-110', name: 'Poplin', color: 'Beyaz', unit: 'METRE', widthCm: 150, unitPrice: 92, minStock: 200, supplierId: kumasci, location: 'B-1' });
const markaKumas = await M({ type: 'KUMAS', code: 'NV-TRIKO', name: 'Triko (Nova malı)', color: 'Siyah', unit: 'KG', ownerPartyId: marka, minStock: 0, location: 'Emanet rafı' });
const dugme = await M({ type: 'AKSESUAR', code: 'DGM-18', name: 'Metal düğme 18 mm', unit: 'ADET', unitPrice: 1.8, minStock: 2000, supplierId: aksesuarci });
const fermuar = await M({ type: 'AKSESUAR', code: 'FRM-18', name: 'Fermuar 18 cm', unit: 'ADET', unitPrice: 4.5, minStock: 1000, supplierId: aksesuarci });
const etiket = await M({ type: 'ETIKET', code: 'ETK-DOK', name: 'Dokuma ana etiket', unit: 'ADET', unitPrice: 0.9, minStock: 3000, supplierId: aksesuarci });

const IN = (id: string, lots: object[], docNo: string, unitPrice?: number) => call('POST', `/stock/materials/${id}/movements`, { type: 'GIRIS', quantity: 0, lots, docNo, unitPrice, partyId: kumasci });
await IN(gab, [{ lotNo: 'P-2231', rollNo: '1', quantity: 92 }, { lotNo: 'P-2231', rollNo: '2', quantity: 88 }, { lotNo: 'P-2231', rollNo: '3', quantity: 95 }, { lotNo: 'P-2240', rollNo: '1', quantity: 90 }], 'IRS-10421');
await IN(denim, [{ lotNo: 'D-551', rollNo: '1', quantity: 110 }, { lotNo: 'D-551', rollNo: '2', quantity: 105 }], 'IRS-10455');
await IN(poplin, [{ lotNo: 'PP-90', rollNo: '1', quantity: 120 }], 'IRS-10460');
await IN(markaKumas, [{ lotNo: 'NV-01', quantity: 240 }], 'NOVA-IRS-77');
const plain = (id: string, quantity: number) => call('POST', `/stock/materials/${id}/movements`, { type: 'GIRIS', quantity, partyId: aksesuarci, docNo: 'IRS-A-300' });
await plain(dugme, 1500);
await plain(fermuar, 3000);
await plain(etiket, 8000);

// Modeller + reçeteler
const model = async (b: object, recipe: object) => {
  const m = await call('POST', '/models', b);
  await call('PUT', `/models/${m.id}/recipe`, recipe);
  return m.id as string;
};
const pnt = await model(
  { code: 'PNT-2601', name: 'Klasik Kanvas Pantolon', category: 'Pantolon', season: '2026 Sonbahar', sizes: ['28', '30', '32', '34', '36', '38'], colors: ['Lacivert', 'Siyah', 'Bej'], route: ['KESIM', 'DIKIM', 'ILIK_DUGME', 'UTU', 'KALITE', 'PAKET'], salePrice: 520, status: 'URETIMDE' },
  {
    materials: [{ materialId: gab, consumption: 1.25 }, { materialId: dugme, consumption: 1 }, { materialId: fermuar, consumption: 1 }, { materialId: etiket, consumption: 1 }],
    operations: [
      { name: 'Cep hazırlama', stage: 'DIKIM', minutes: 4.5, pieceRate: 6 }, { name: 'Fermuar takma', stage: 'DIKIM', minutes: 2.2, pieceRate: 3 },
      { name: 'Yan ve iç paça', stage: 'DIKIM', minutes: 3.8, pieceRate: 5 }, { name: 'Bel takma', stage: 'DIKIM', minutes: 3, pieceRate: 4 },
      { name: 'İlik / düğme', stage: 'ILIK_DUGME', minutes: 0.8, pieceRate: 1 }, { name: 'Son ütü', stage: 'UTU', minutes: 2.5, pieceRate: 3 },
    ],
  },
);
const jean = await model(
  { code: 'JN-5CEP', name: '5 Cep Slim Jean', category: 'Kot / Denim', season: '2026 Sonbahar', sizes: ['28', '29', '30', '31', '32', '33', '34', '36'], colors: ['İndigo'], route: ['KESIM', 'DIKIM', 'YIKAMA', 'UTU', 'PAKET'], salePrice: 690, status: 'URETIMDE' },
  { materials: [{ materialId: denim, consumption: 1.35 }, { materialId: dugme, consumption: 1 }, { materialId: etiket, consumption: 1 }], operations: [{ name: 'Dikim (komple)', stage: 'DIKIM', minutes: 14, pieceRate: 22 }, { name: 'Ütü-paket', stage: 'UTU', minutes: 2, pieceRate: 2.5 }] },
);
const gomlek = await model(
  { code: 'GML-OX', name: 'Poplin Gömlek', category: 'Gömlek', sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['Beyaz', 'Mavi'], route: ['KESIM', 'NAKIS', 'DIKIM', 'UTU', 'PAKET'], salePrice: 410, status: 'ONAYLI' },
  { materials: [{ materialId: poplin, consumption: 1.6 }, { materialId: dugme, consumption: 8 }, { materialId: etiket, consumption: 1 }], operations: [{ name: 'Yaka-manşet', stage: 'DIKIM', minutes: 9, pieceRate: 12 }, { name: 'Ütü', stage: 'UTU', minutes: 3, pieceRate: 3 }] },
);
await model({ code: 'NV-KAZAK', name: 'Nova Triko Kazak (fason)', category: 'Sweatshirt', customerId: marka, sizes: ['S', 'M', 'L', 'XL'], colors: ['Siyah'], route: ['KESIM', 'DIKIM', 'UTU', 'KALITE', 'PAKET'], status: 'ONAYLI' }, { materials: [{ materialId: markaKumas, consumption: 0.45 }], operations: [{ name: 'Overlok + reçme', stage: 'DIKIM', minutes: 7, pieceRate: 9 }] });

// Siparişler
const order = async (customerId: string, due: number, lines: object[], extra: object = {}) => (await call('POST', '/orders', { customerId, dueDate: day(due), lines, ...extra })).id as string;
const o1 = await order(lcw, 12, [{ modelId: pnt, color: 'Lacivert', sizes: { 28: 20, 30: 40, 32: 50, 34: 40, 36: 20, 38: 10 }, unitPrice: 520 }], { customerRef: 'PO-88213', priority: 1 });
const o2 = await order(butik, 3, [{ modelId: jean, color: 'İndigo', sizes: { 29: 10, 30: 15, 31: 15, 32: 15, 33: 10, 34: 5 }, unitPrice: 690 }]);
const o3 = await order(lcw, 25, [{ modelId: gomlek, color: 'Beyaz', sizes: { S: 30, M: 60, L: 60, XL: 40, XXL: 20 }, unitPrice: 410 }, { modelId: gomlek, color: 'Mavi', sizes: { S: 20, M: 40, L: 40, XL: 30, XXL: 10 }, unitPrice: 410 }]);
// Geçmiş tarihli (gecikmiş) sipariş
const o4 = await order(butik, -2, [{ modelId: pnt, color: 'Siyah', sizes: { 30: 10, 32: 15, 34: 10 }, unitPrice: 540 }], { orderDate: day(-20) });

for (const o of [o1, o2, o4]) await call('POST', `/orders/${o}/work-orders`);
void o3;

const wos: any[] = await call('GET', '/production/work-orders');
const woOf = (orderId: string) => wos.find((w) => w.order?.id === orderId);
const stageId = (w: any, s: string) => w.stages.find((x: any) => x.stage === s).id;
const lotsOf = async (id: string) => (await call('GET', `/stock/materials/${id}`)).material.lots;

// Sipariş 1: kesildi, dikim fasonda (kısmi döndü), kalanı atölyede
const w1 = woOf(o1);
const gabLots = await lotsOf(gab);
await call('POST', `/production/work-orders/${w1.id}/cuttings`, { lotId: gabLots.find((l: any) => l.lotNo === 'P-2231' && l.rollNo === '1').id, layers: 60, markerLength: 3.2, fabricUsed: 90, sizes: { 28: 10, 30: 20, 32: 25, 34: 20, 36: 10, 38: 5 } });
await call('POST', `/production/work-orders/${w1.id}/cuttings`, { lotId: gabLots.find((l: any) => l.lotNo === 'P-2231' && l.rollNo === '2').id, layers: 60, markerLength: 3.2, fabricUsed: 87, sizes: { 28: 10, 30: 20, 32: 25, 34: 20, 36: 10, 38: 5 } });
const f1 = await call('POST', '/fason', { partyId: hasan, workOrderId: w1.id, stage: 'DIKIM', sentQty: 180, unitPrice: 24, sentDate: day(-4), dueDate: day(3), dispatchNo: 'FI-0091' });
await call('POST', `/fason/${f1.id}/receipts`, { qty: 110, defectQty: 2, dispatchNo: 'HU-551' });
await call('POST', `/production/stages/${stageId(w1, 'ILIK_DUGME')}/progress`, { qty: 110 });
await call('POST', `/production/stages/${stageId(w1, 'UTU')}/progress`, { qty: 80 });

// Sipariş 2: jean — yıkamaya gitti, gecikti
const w2 = woOf(o2);
const dLots = await lotsOf(denim);
await call('POST', `/production/work-orders/${w2.id}/cuttings`, { lotId: dLots[0].id, layers: 70, markerLength: 1.5, fabricUsed: 102, sizes: { 29: 10, 30: 15, 31: 15, 32: 15, 33: 10, 34: 5 } });
await call('POST', `/production/stages/${stageId(w2, 'DIKIM')}/progress`, { qty: 70 });
await call('POST', '/fason', { partyId: yikama, workOrderId: w2.id, stage: 'YIKAMA', sentQty: 70, unitPrice: 18, sentDate: day(-6), dueDate: day(-2), dispatchNo: 'FI-0088' });

// Sipariş 4: gecikmiş — ütüde bekliyor
const w4 = woOf(o4);
await call('POST', `/production/work-orders/${w4.id}/cuttings`, { lotId: gabLots.find((l: any) => l.lotNo === 'P-2240').id, layers: 35, markerLength: 1.3, fabricUsed: 45, sizes: { 30: 10, 32: 15, 34: 10 } });
await call('POST', `/production/stages/${stageId(w4, 'DIKIM')}/progress`, { qty: 34, defectQty: 1 });
await call('POST', `/production/stages/${stageId(w4, 'ILIK_DUGME')}/progress`, { qty: 34 });

// Önceki bir işten mamul stok ve tamamlanmış fason (karne verisi için)
const oldFason = await call('POST', '/fason', { partyId: nakis, stage: 'NAKIS', description: 'Gömlek göğüs nakışı', sentQty: 200, unitPrice: 6, sentDate: day(-15), dueDate: day(-9) });
await call('POST', `/fason/${oldFason.id}/receipts`, { qty: 190, defectQty: 4, date: day(-7) });
await call('PATCH', `/fason/${oldFason.id}`, { action: 'KAPAT' });
await call('POST', '/finished/stock/adjust', { modelId: pnt, color: 'Bej', sizes: { 30: 12, 32: 18, 34: 9 }, note: 'Önceki sezondan devir' });

// Personel
const emp = async (b: object) => (await call('POST', '/personnel/employees', b)).id as string;
const people = [
  await emp({ firstName: 'Ayşe', lastName: 'Demir', department: 'Dikimhane', position: 'Makineci', wageType: 'AYLIK', wage: 28000 }),
  await emp({ firstName: 'Fatma', lastName: 'Yıldız', department: 'Dikimhane', position: 'Overlokçu', wageType: 'AYLIK', wage: 27000 }),
  await emp({ firstName: 'Emine', lastName: 'Şahin', department: 'Dikimhane', position: 'Reçmeci', wageType: 'PARCA_BASI', wage: 0 }),
  await emp({ firstName: 'Hüseyin', lastName: 'Çelik', department: 'Kesimhane', position: 'Kesimci', wageType: 'AYLIK', wage: 32000 }),
  await emp({ firstName: 'Murat', lastName: 'Aydın', department: 'Ütü', position: 'Ütücü', wageType: 'GUNLUK', wage: 1100 }),
  await emp({ firstName: 'Zeynep', lastName: 'Kurt', department: 'Paketleme', position: 'Paketçi', wageType: 'GUNLUK', wage: 950 }),
  await emp({ firstName: 'Hatice', lastName: 'Arslan', department: 'Kalite', position: 'Kaliteci', wageType: 'AYLIK', wage: 29000 }),
];
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
await call('PUT', '/personnel/attendance', { date: today, entries: people.map((id, i) => ({ employeeId: id, status: i === 4 ? 'GELMEDI' : i === 6 ? 'IZINLI' : 'GELDI', overtime: i < 2 ? 2 : 0 })) });
await call('POST', '/production/piecework', { employeeId: people[2], workOrderId: w1.id, description: 'Reçme', qty: 140, rate: 1.5 });
await call('POST', '/personnel/advances', { employeeId: people[0], amount: 3000, note: 'Kira için' });

// Kalite
await call('POST', '/quality', { workOrderId: w1.id, stage: 'DIKIM', checkedQty: 80, passedQty: 74, defects: { 'Atlama dikiş': 3, 'Kaçık dikiş': 2, 'Leke': 1 } });
await call('POST', '/quality', { workOrderId: w4.id, stage: 'DIKIM', checkedQty: 35, passedQty: 33, defects: { 'Ölçü hatası': 1, 'İplik ucu': 1 } });

// Finans
await call('POST', '/finance/transactions', { partyId: lcw, type: 'SATIS_FATURASI', amount: 186400, docNo: 'FTR-2026-311', dueDate: day(30) });
await call('POST', '/finance/transactions', { partyId: lcw, type: 'TAHSILAT', amount: 90000, method: 'HAVALE' });
await call('POST', '/finance/transactions', { partyId: kumasci, type: 'ALIS_FATURASI', amount: 64200, docNo: 'BK-8812' });
await call('POST', '/finance/transactions', { partyId: hasan, type: 'FASON_FATURASI', amount: 14500, docNo: 'HU-2026-44' });
await call('POST', '/finance/cheques', { direction: 'ALINAN', partyId: butik, amount: 42000, dueDate: day(5), bank: 'İş Bankası', serialNo: '0045521' });
await call('POST', '/finance/cheques', { direction: 'VERILEN', partyId: kumasci, amount: 35000, dueDate: day(2), bank: 'Ziraat Bankası', serialNo: '7788120' });

// Görevler
await call('POST', '/tasks', { title: 'Nova için triko kazak numunesi hazırla', dueDate: day(2), priority: 1 });
await call('POST', '/tasks', { title: 'Ege Yıkama ile geciken jean partisi için görüş', dueDate: day(-1), priority: 1 });

await app.close();
await prisma.$disconnect();
console.log(`Demo firması hazır → ${email}`);
