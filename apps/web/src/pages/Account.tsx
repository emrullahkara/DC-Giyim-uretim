import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Circle, KeyRound, LogOut, Monitor, ShieldAlert, ShieldCheck, Smartphone, UserCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDateTime } from '@/lib/format';
import { Badge, Card, ErrorBox, Field, Loading, PageHeader, cx, useToast } from '@/components/ui';

interface SessionRow { id: string; createdAt: string; lastSeenAt: string; ip?: string | null; userAgent?: string | null; current: boolean }

function device(ua?: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: 'Bilinmeyen cihaz', mobile: false };
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Diğer';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  return { label: `${br} · ${os}`, mobile: /Mobile|Android|iPhone|iPad/.test(ua) };
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={cx('flex items-center gap-1.5', ok ? 'text-emerald-700' : 'text-ink-500')}>
      {ok ? <Check className="size-3.5" /> : <Circle className="size-3" />} {text}
    </li>
  );
}

function PasswordForm({ forced }: { forced?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useSession();
  const [f, setF] = useState({ current: '', next: '', repeat: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const rules = {
    len: f.next.length >= 10,
    mix: /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(f.next) && /\d/.test(f.next),
    diff: !!f.next && f.next !== f.current,
    email: !!f.next && !f.next.toLocaleLowerCase('tr').includes(me.user.email.split('@')[0].toLocaleLowerCase('tr')),
    match: !!f.next && f.next === f.repeat,
  };
  const ok = Object.values(rules).every(Boolean) && !!f.current;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!rules.match) return setErr('Yeni şifreler birbiriyle aynı değil.');
    if (!rules.len || !rules.mix) return setErr('Şifre en az 10 karakter olmalı, harf ve rakam içermeli.');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { current: f.current, next: f.next });
      setF({ current: '', next: '', repeat: '' });
      toast('ok', 'Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.');
      await qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['auth-sessions'] });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><KeyRound className="size-4 text-brand-600" /> Şifre değiştir</span>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={forced ? 'Geçici şifre' : 'Mevcut şifre'} required>
          <input className="input" type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        </Field>
        <div className={cx('grid gap-4', !forced && 'sm:grid-cols-2')}>
          <Field label="Yeni şifre" required>
            <input className="input" type="password" autoComplete="new-password" required maxLength={128} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
          </Field>
          <Field label="Yeni şifre (tekrar)" required>
            <input className={cx('input', f.repeat && !rules.match && 'ring-red-400')} type="password" autoComplete="new-password" required maxLength={128} value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} />
          </Field>
        </div>
        <ul className="grid gap-1 rounded-xl bg-ink-50 px-3 py-2 text-xs sm:grid-cols-2">
          <Rule ok={rules.len} text="En az 10 karakter" />
          <Rule ok={rules.mix} text="Hem harf hem rakam" />
          <Rule ok={rules.diff} text="Mevcut şifreden farklı" />
          <Rule ok={rules.email} text="E-posta adınızı içermiyor" />
          <Rule ok={rules.match} text="Tekrarı aynı" />
        </ul>
        <p className="text-[11px] text-ink-500">“123456”, “sifre”, firma adı gibi kolay tahmin edilen ifadeler kabul edilmez. Şifre değişince diğer cihazlardaki oturumlarınız kapatılır.</p>
        {err && <ErrorBox error={new Error(err)} />}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy || !ok}>
            <ShieldCheck className="size-4" /> {busy ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function Sessions() {
  const { data, isLoading, error } = useQuery({ queryKey: ['auth-sessions'], queryFn: () => api.get<SessionRow[]>('/auth/sessions') });
  const kill = useAction((id: string) => api.del(`/auth/sessions/${id}`), { success: 'Oturum kapatıldı.', invalidate: [['auth-sessions']] });
  return (
    <Card title="Aktif oturumlar" subtitle="Tanımadığınız bir cihaz görürseniz oturumu kapatın ve şifrenizi değiştirin" bodyClass="p-0">
      {isLoading ? (
        <Loading />
      ) : error ? (
        <div className="p-4"><ErrorBox error={error} /></div>
      ) : (
        <ul className="divide-y divide-ink-100">
          {(data ?? []).map((s) => {
            const d = device(s.userAgent);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className={cx('grid size-10 shrink-0 place-items-center rounded-xl', s.current ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-600')}>
                  {d.mobile ? <Smartphone className="size-5" /> : <Monitor className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                    {d.label} {s.current && <Badge tone="green">Bu cihaz</Badge>}
                  </div>
                  <div className="text-xs text-ink-500">
                    IP {s.ip || '—'} · son görülme {fmtDateTime(s.lastSeenAt)} · giriş {fmtDateTime(s.createdAt)}
                  </div>
                </div>
                {!s.current && (
                  <button className="btn-outline btn-sm text-red-600" disabled={kill.isPending} onClick={() => kill.mutate(s.id)}>
                    <LogOut className="size-3.5" /> Oturumu kapat
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default function Account({ forced }: { forced?: boolean }) {
  const { me } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    qc.clear();
    nav('/giris');
  };

  if (forced)
    return (
      <div className="space-y-5">
        <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><ShieldAlert className="size-6" /></div>
            <div>
              <h1 className="text-lg font-bold text-ink-900">Güvenliğiniz için ilk girişte şifrenizi değiştirmeniz gerekiyor</h1>
              <p className="mt-1 text-sm text-ink-700">
                Merhaba {me.user.name}, hesabınız size verilen geçici şifreyle açıldı. Devam etmek için yalnızca sizin bildiğiniz yeni bir şifre belirleyin.
              </p>
            </div>
          </div>
        </div>
        <PasswordForm forced />
        <div className="flex justify-center">
          <button className="btn-ghost text-ink-600" onClick={logout}>
            <LogOut className="size-4" /> Çıkış yap
          </button>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Hesabım ve güvenlik" subtitle="Şifrenizi ve oturum açtığınız cihazları yönetin" actions={<button className="btn-outline" onClick={logout}><LogOut className="size-4" /> Çıkış yap</button>} />
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid size-14 place-items-center rounded-2xl bg-brand-100 text-xl font-extrabold text-brand-800">{me.user.name.slice(0, 1).toLocaleUpperCase('tr')}</div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold text-ink-900">{me.user.name}</div>
              <div className="text-sm text-ink-500">{me.user.email}</div>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <Badge tone="brand"><UserCircle2 className="size-3" /> {me.user.roleLabel}</Badge>
              <span className="text-xs text-ink-500">{me.tenant.name}</span>
            </div>
          </div>
        </Card>
        <PasswordForm />
        <Sessions />
      </div>
    </div>
  );
}
