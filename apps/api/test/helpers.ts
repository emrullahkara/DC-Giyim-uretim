import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

export class Client {
  cookie = '';
  constructor(private app: FastifyInstance) {}
  async req(method: string, url: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const res = await this.app.inject({
      method: method as any,
      url,
      payload: body as any,
      headers: { 'x-dc-csrf': '1', ...(this.cookie ? { cookie: this.cookie } : {}), ...extraHeaders },
    });
    const set = res.headers['set-cookie'];
    if (set) {
      const first = (Array.isArray(set) ? set : [set])[0];
      const [kv] = first.split(';');
      this.cookie = kv.endsWith('=') ? '' : kv;
    }
    let json: any = null;
    try { json = res.json(); } catch { /* boş */ }
    return { status: res.statusCode, body: json };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b?: unknown) => this.req('POST', u, b ?? {});
  patch = (u: string, b?: unknown) => this.req('PATCH', u, b ?? {});
  put = (u: string, b?: unknown) => this.req('PUT', u, b ?? {});
  del = (u: string) => this.req('DELETE', u);
}

let counter = 0;
export async function signup(app: FastifyInstance, company = 'Firma') {
  const c = new Client(app);
  const email = `sahip${Date.now()}${counter++}@test.com`;
  const r = await c.post('/api/auth/signup', { companyName: `${company} ${counter}`, name: 'Ahmet Usta', email, password: 'KumasTopu2026x' });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  return { c, email };
}

export async function makeApp() {
  const app = await buildApp();
  await app.ready();
  return app;
}
