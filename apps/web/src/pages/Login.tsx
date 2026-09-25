import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, Boxes, Handshake, Lock, Scissors, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Field, Spinner } from '@/components/ui';

export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [f, setF] = useState({ email: '', password: '', name: '', companyName: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await api.post('/auth/login', { email: f.email, password: f.password });
      else await api.post('/auth/signup', f);
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav('/');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-brand-700/40 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-[30rem] rounded-full bg-thread-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-thread-400 text-brand-900"><Scissors className="size-6" strokeWidth={2.5} /></div>
          <div>
            <div className="text-lg font-extrabold tracking-tight">DC Giyim-Üretim</div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">Atölye yönetim sistemi</div>
          </div>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">Atölyenin tüm takibi <span className="text-thread-400">tek ekranda.</span></h1>
          <p className="mt-4 text-brand-100/90">Siparişten kesime, fasondan sevkiyata; kumaş topundan puantaja kadar her şey bir arada. Geciken iş, eksik dönen fason, biten kumaş, yaklaşan çek — hepsi sizi önceden uyarır.</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              { i: <BellRing />, t: 'Gecikme alarmı', d: 'Termin riskini önceden görün' },
              { i: <Handshake />, t: 'Fason karnesi', d: 'Kim zamanında, kim eksik teslim ediyor' },
              { i: <Boxes />, t: 'Kumaş & parti', d: 'Top, lot ve sarfiyat takibi' },
              { i: <ShieldCheck />, t: 'Yetki kontrolü', d: 'Kim neyi görür, siz belirleyin' },
            ].map((x) => (
              <div key={x.t} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 [&_svg]:size-5 [&_svg]:text-thread-400">
                {x.i}
                <div className="mt-2 text-sm font-bold">{x.t}</div>
                <div className="text-xs text-brand-200">{x.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-brand-300">Verileriniz firmanıza özel, şifreli oturumlarla korunur.</div>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-11 place-items-center rounded-2xl bg-brand-800 text-thread-400"><Scissors className="size-6" strokeWidth={2.5} /></div>
            <div className="text-lg font-extrabold tracking-tight">DC Giyim-Üretim</div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{mode === 'login' ? 'Tekrar hoş geldiniz' : 'Firmanızı oluşturun'}</h2>
          <p className="mt-1 text-sm text-ink-500">{mode === 'login' ? 'Hesabınıza giriş yapın.' : 'Birkaç saniyede atölyenizi sisteme ekleyin. İlk hesap firma sahibi olur.'}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'signup' && (
              <>
                <Field label="Firma / atölye adı" required><input className="input" value={f.companyName} onChange={set('companyName')} required minLength={2} maxLength={120} autoComplete="organization" /></Field>
                <Field label="Adınız soyadınız" required><input className="input" value={f.name} onChange={set('name')} required minLength={2} maxLength={120} autoComplete="name" /></Field>
              </>
            )}
            <Field label="E-posta" required><input className="input" type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></Field>
            <Field label="Şifre" required hint={mode === 'signup' ? 'En az 10 karakter; harf ve rakam içermeli.' : undefined}>
              <input className="input" type="password" value={f.password} onChange={set('password')} required minLength={mode === 'signup' ? 10 : 1} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </Field>
            {err && <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{err}</div>}
            <button className="btn-primary w-full py-2.5" disabled={busy}>
              {busy ? <Spinner className="size-4 text-white" /> : <Lock className="size-4" />}
              {mode === 'login' ? 'Giriş yap' : 'Firmayı oluştur'}
            </button>
          </form>
          <div className="mt-6 text-center text-sm text-ink-500">
            {mode === 'login' ? (
              <>Hesabınız yok mu? <button className="font-semibold text-brand-700 hover:underline" onClick={() => { setMode('signup'); setErr(''); }}>Firma kaydı oluşturun</button></>
            ) : (
              <>Zaten hesabınız var mı? <button className="font-semibold text-brand-700 hover:underline" onClick={() => { setMode('login'); setErr(''); }}>Giriş yapın</button></>
            )}
          </div>
          <p className="mt-8 text-center text-xs text-ink-400">Çalışan hesapları firma sahibi tarafından Ayarlar &gt; Kullanıcılar bölümünden açılır.</p>
        </div>
      </div>
    </div>
  );
}
