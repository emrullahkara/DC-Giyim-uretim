import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { parse, optText, must, date } from '../lib/http.js';
import { need, audit } from '../lib/auth.js';

export async function taskRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: need('gorev:gor') }, async (req) => {
    const q = parse(z.object({ status: z.enum(['ACIK', 'TAMAM', 'hepsi']).default('ACIK'), mine: z.enum(['1']).optional() }), req.query);
    return req.db.task.findMany({
      where: { ...(q.status !== 'hepsi' ? { status: q.status } : {}), ...(q.mine ? { assigneeId: req.auth!.user.id } : {}) },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { priority: 'asc' }],
      take: 500,
    });
  });

  const body = z.object({
    title: z.string().trim().min(1).max(200),
    detail: optText(2000),
    assigneeId: z.string().max(40).optional().nullable(),
    dueDate: date.optional().nullable(),
    priority: z.coerce.number().int().min(1).max(3).default(2),
    link: z.string().max(200).regex(/^\/[a-zA-Z0-9/_-]*$/, 'Geçersiz bağlantı').optional().nullable(),
  });

  async function assignee(tenantId: string, id?: string | null) {
    if (!id) return { assigneeId: null, assigneeName: null };
    const u = await must(prisma.user.findFirst({ where: { id, tenantId, active: true } }), 'Kullanıcı');
    return { assigneeId: u.id, assigneeName: u.name };
  }

  app.post('/', { preHandler: need('gorev:yaz') }, async (req) => {
    const b = parse(body, req.body);
    const t = await req.db.task.create({ data: { ...b, ...(await assignee(req.auth!.tenantId, b.assigneeId)), createdBy: req.auth!.user.name } as any });
    await audit(req, 'GOREV_EKLE', 'Task', t.id);
    return t;
  });

  app.patch('/:id', { preHandler: need('gorev:gor') }, async (req) => {
    const { id } = req.params as { id: string };
    const b = parse(body.partial().extend({ status: z.enum(['ACIK', 'TAMAM']).optional() }), req.body);
    const t = await must(req.db.task.findFirst({ where: { id } }), 'Görev');
    // Görev yazma yetkisi olmayan yalnızca kendine atanmış görevi tamamlayabilir
    const canWrite = req.auth!.perms.has('gorev:yaz');
    if (!canWrite) {
      if (t.assigneeId !== req.auth!.user.id) throw (await import('../lib/errors.js')).forbidden();
      for (const k of Object.keys(b)) if (k !== 'status') delete (b as any)[k];
    }
    const data: any = { ...b };
    if ('assigneeId' in b) Object.assign(data, await assignee(req.auth!.tenantId, b.assigneeId));
    if (b.status) data.doneAt = b.status === 'TAMAM' ? new Date() : null;
    await req.db.task.update({ where: { id }, data });
    return { ok: true };
  });

  app.delete('/:id', { preHandler: need('gorev:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    await must(req.db.task.findFirst({ where: { id } }), 'Görev');
    await req.db.task.delete({ where: { id } });
    return { ok: true };
  });
}
