import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, signup, Client } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });

describe('Kimlik doğrulama', () => {
  it('oturumsuz istekleri reddeder', async () => {
    const c = new Client(app);
    expect((await c.get('/api/orders')).status).toBe(401);
    expect((await c.get('/api/dashboard')).status).toBe(401);
  });

  it('zayıf şifreyle kayda izin vermez', async () => {
    const c = new Client(app);
    const r = await c.post('/api/auth/signup', { companyName: 'X Tekstil', name: 'Ali', email: 'zayif@test.com', password: '123456789' });
    expect(r.status).toBe(400);
  });

  it('hatalı şifrede genel mesaj verir, 5 denemede hesabı kilitler', async () => {
    const { email } = await signup(app);
    const c = new Client(app);
    for (let i = 0; i < 5; i++) {
      const r = await c.post('/api/auth/login', { email, password: 'YanlisSifre99' });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('E-posta veya şifre hatalı.');
    }
    const r = await c.post('/api/auth/login', { email, password: 'KumasTopu2026x' });
    expect(r.status).toBe(423);
  });

  it('olmayan kullanıcı ile var olan kullanıcı aynı hatayı alır', async () => {
    const c = new Client(app);
    const r = await c.post('/api/auth/login', { email: 'yok@yok.com', password: 'Herhangi12345' });
    expect(r.status).toBe(401);
    expect(r.body.message).toBe('E-posta veya şifre hatalı.');
  });

  it('çıkış yapınca oturum geçersizleşir', async () => {
    const { c } = await signup(app);
    const cookie = c.cookie;
    expect((await c.get('/api/auth/me')).status).toBe(200);
    await c.post('/api/auth/logout');
    const stale = new Client(app);
    stale.cookie = cookie;
    expect((await stale.get('/api/auth/me')).status).toBe(401);
  });

  it('oturum çerezi HttpOnly ve SameSite=Strict', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/signup', headers: { 'x-dc-csrf': '1' }, payload: { companyName: 'Çerez Tekstil', name: 'Veli', email: 'cerez@test.com', password: 'KumasTopu2026x' } });
    const c = String(res.headers['set-cookie']);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
  });
});

describe('CSRF koruması', () => {
  it('özel başlık olmadan durum değiştiren istek reddedilir', async () => {
    const { c } = await signup(app);
    const res = await app.inject({ method: 'POST', url: '/api/parties', headers: { cookie: c.cookie }, payload: { name: 'Mağaza', roles: ['MUSTERI'] } });
    expect(res.statusCode).toBe(403);
  });
});

describe('Firmalar arası veri izolasyonu', () => {
  it('bir firma diğerinin kaydını göremez, değiştiremez, silemez, bağlayamaz', async () => {
    const a = (await signup(app, 'A Tekstil')).c;
    const b = (await signup(app, 'B Konfeksiyon')).c;
    const party = (await a.post('/api/parties', { name: 'A Müşterisi', roles: ['MUSTERI'] })).body;
    const model = (await a.post('/api/models', { code: 'A-100', name: 'Pantolon', sizes: ['M'], colors: ['Siyah'], route: ['KESIM', 'DIKIM'] })).body;
    expect(party.id).toBeTruthy();

    // B, A'nın kayıtlarını listede görmez
    expect((await b.get('/api/parties')).body).toHaveLength(0);
    expect((await b.get('/api/models')).body).toHaveLength(0);
    // Doğrudan id ile erişemez
    expect((await b.get(`/api/parties/${party.id}`)).status).toBe(404);
    expect((await b.patch(`/api/parties/${party.id}`, { name: 'Hacklendi' })).status).toBe(404);
    expect((await b.del(`/api/parties/${party.id}`)).status).toBe(404);
    // A'nın müşterisi/modeliyle sipariş açamaz (yabancı referans)
    const r = await b.post('/api/orders', { customerId: party.id, dueDate: '2030-01-01', lines: [{ modelId: model.id, color: 'Siyah', sizes: { M: 10 } }] });
    expect(r.status).toBe(404);
    // A'nın verisi değişmemiş olmalı
    expect((await a.get(`/api/parties/${party.id}`)).body.party.name).toBe('A Müşterisi');
  });

  it('başka firmanın kullanıcısını yönetemez', async () => {
    const a = (await signup(app)).c;
    const b = (await signup(app)).c;
    const u = (await a.post('/api/admin/users', { name: 'Depocu', email: `depo${Date.now()}@test.com`, role: 'DEPOCU' })).body.user;
    expect((await b.patch(`/api/admin/users/${u.id}`, { active: false })).status).toBe(404);
    expect((await b.post(`/api/admin/users/${u.id}/reset-password`)).status).toBe(404);
  });
});

describe('Rol ve yetki sınırları', () => {
  async function staff(role: string) {
    const owner = (await signup(app)).c;
    const email = `${role.toLowerCase()}${Date.now()}${Math.random().toString(36).slice(2, 6)}@test.com`;
    const { tempPassword } = (await owner.post('/api/admin/users', { name: `${role} Kişi`, email, role })).body;
    const c = new Client(app);
    expect((await c.post('/api/auth/login', { email, password: tempPassword })).status).toBe(200);
    // İlk girişte şifre değişimi zorunlu
    expect((await c.get('/api/orders')).status).toBe(403);
    expect((await c.post('/api/auth/change-password', { current: tempPassword, next: 'YeniGuclu2026x' })).status).toBe(200);
    return { owner, c };
  }

  it('operatör sadece üretim kaydı görebilir; finans, personel, ayar kapalı', async () => {
    const { c } = await staff('OPERATOR');
    expect((await c.get('/api/production/work-orders')).status).toBe(200);
    expect((await c.get('/api/finance/transactions')).status).toBe(403);
    expect((await c.get('/api/personnel/payroll?month=2026-01')).status).toBe(403);
    expect((await c.get('/api/admin/users')).status).toBe(403);
    expect((await c.post('/api/parties', { name: 'X', roles: ['MUSTERI'] })).status).toBe(403);
  });

  it('fiyat yetkisi olmayan kullanıcıya fiyat alanları gönderilmez', async () => {
    const { owner, c } = await staff('DEPOCU');
    await owner.post('/api/stock/materials', { type: 'KUMAS', code: 'K-1', name: 'Gabardin', unit: 'METRE', unitPrice: 145.5 });
    const own = (await owner.get('/api/stock/materials')).body[0];
    expect(Number(own.unitPrice)).toBe(145.5);
    const list = (await c.get('/api/stock/materials')).body;
    expect(list[0].code).toBe('K-1');
    expect(list[0]).not.toHaveProperty('unitPrice');
  });

  it('yönetici, firma sahibi hesabını değiştiremez; sahip kendini pasif yapamaz', async () => {
    const { owner, c } = await staff('YONETICI');
    const me = (await owner.get('/api/auth/me')).body.user;
    expect((await owner.patch(`/api/admin/users/${me.id}`, { active: false })).status).toBe(400);
    // Yönetici kullanıcı yönetemez (ayar:yonet yok)
    expect((await c.patch(`/api/admin/users/${me.id}`, { role: 'OPERATOR' })).status).toBe(403);
  });

  it('rol değişince kullanıcının oturumu kapanır', async () => {
    const { owner, c } = await staff('MUHASEBE');
    const users = (await owner.get('/api/admin/users')).body;
    const target = users.find((u: any) => u.role === 'MUHASEBE');
    await owner.patch(`/api/admin/users/${target.id}`, { role: 'OPERATOR' });
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });
});

describe('Girdi doğrulama', () => {
  it('geçersiz veriyi reddeder ve iç hata sızdırmaz', async () => {
    const { c } = await signup(app);
    const r = await c.post('/api/orders', { customerId: 'x'.repeat(500), dueDate: 'dün', lines: [] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/prisma|stack|at /i);
  });

  it('geçersiz TC kimlik no reddedilir', async () => {
    const { c } = await signup(app);
    const r = await c.post('/api/personnel/employees', { firstName: 'Ayşe', lastName: 'Yılmaz', department: 'Dikimhane', nationalId: '12345678901' });
    expect(r.status).toBe(400);
  });
});
