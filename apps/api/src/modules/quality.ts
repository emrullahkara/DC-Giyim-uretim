import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, optText, must, date, startOfDay, addDays } from '../lib/http.js';
import { need, audit } from '../lib/auth.js';
import { badRequest } from '../lib/errors.js';

export async function qualityRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: need('kalite:gor') }, async (req) => {
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
    const from = addDays(startOfDay(), -q.days);
    const checks = await req.db.qualityCheck.findMany({
      where: { date: { gte: from } },
      include: { workOrder: { select: { id: true, no: true, color: true, model: { select: { code: true, name: true } } } } },
      orderBy: { date: 'desc' },
      take: 500,
    });
    const pareto: Record<string, number> = {};
    let checked = 0;
    let passed = 0;
    for (const c of checks) {
      checked += c.checkedQty;
      passed += c.passedQty;
      for (const [k, v] of Object.entries((c.defects ?? {}) as Record<string, number>)) pareto[k] = (pareto[k] ?? 0) + Number(v || 0);
    }
    return {
      checks,
      stats: { checked, passed, failed: checked - passed, failRate: checked ? Math.round(((checked - passed) / checked) * 1000) / 10 : 0 },
      pareto: Object.entries(pareto).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    };
  });

  app.post('/', { preHandler: need('kalite:yaz') }, async (req) => {
    const body = parse(
      z.object({
        workOrderId: z.string().max(40).optional().nullable(),
        stage: z.string().trim().regex(/^[A-Z0-9_]{2,20}$/),
        checkedQty: z.coerce.number().int().min(1).max(1_000_000),
        passedQty: z.coerce.number().int().min(0).max(1_000_000),
        defects: z.record(z.string().trim().min(1).max(60), z.coerce.number().int().min(0).max(1_000_000)).default({}),
        inspector: optText(80),
        note: optText(500),
        date: date.optional(),
      }),
      req.body,
    );
    if (body.passedQty > body.checkedQty) throw badRequest('Sağlam adet, kontrol edilenden fazla olamaz.');
    if (body.workOrderId) await must(req.db.workOrder.findFirst({ where: { id: body.workOrderId } }), 'İş emri');
    const c = await req.db.qualityCheck.create({ data: { ...body, inspector: body.inspector ?? req.auth!.user.name, date: body.date ?? new Date() } as any });
    await audit(req, 'KALITE_KAYIT', 'QualityCheck', c.id, { checked: body.checkedQty, passed: body.passedQty });
    return c;
  });

  app.delete('/:id', { preHandler: need('kalite:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    await must(req.db.qualityCheck.findFirst({ where: { id } }), 'Kayıt');
    await req.db.qualityCheck.delete({ where: { id } });
    await audit(req, 'KALITE_SIL', 'QualityCheck', id);
    return { ok: true };
  });
}
