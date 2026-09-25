import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, BarChart3, Boxes, ClipboardCheck, Factory, FileText, Handshake, LayoutDashboard, ListChecks, LogOut, Menu, Package,
  Scissors, Settings, Shirt, Truck, Users, Wallet, X, Search, Plus, ChevronDown, UserCircle2,
} from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cx } from './ui';

interface NavItem { to: string; label: string; icon: ReactNode; perm: string[]; }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: '', items: [{ to: '/', label: 'Kontrol Kulesi', icon: <LayoutDashboard />, perm: ['panel:gor'] }] },
  {
    group: 'Üretim',
    items: [
      { to: '/siparisler', label: 'Siparişler', icon: <FileText />, perm: ['siparis:gor'] },
      { to: '/atolye', label: 'Atölye Panosu', icon: <Activity />, perm: ['uretim:gor'] },
      { to: '/uretim', label: 'İş Emirleri', icon: <Factory />, perm: ['uretim:gor'] },
      { to: '/fason', label: 'Fason Takibi', icon: <Handshake />, perm: ['fason:gor'] },
      { to: '/kalite', label: 'Kalite Kontrol', icon: <ClipboardCheck />, perm: ['kalite:gor'] },
      { to: '/modeller', label: 'Modeller', icon: <Shirt />, perm: ['model:gor'] },
    ],
  },
  {
    group: 'Depo',
    items: [
      { to: '/depo', label: 'Kumaş & Malzeme', icon: <Boxes />, perm: ['depo:gor'] },
      { to: '/mamul', label: 'Mamul & Sevkiyat', icon: <Truck />, perm: ['mamul:gor'] },
    ],
  },
  {
    group: 'Yönetim',
    items: [
      { to: '/personel', label: 'Personel', icon: <Users />, perm: ['personel:gor', 'puantaj:yaz'] },
      { to: '/cariler', label: 'Cariler', icon: <Package />, perm: ['cari:gor'] },
      { to: '/finans', label: 'Finans & Çek', icon: <Wallet />, perm: ['finans:gor'] },
      { to: '/gorevler', label: 'Görevler', icon: <ListChecks />, perm: ['gorev:gor'] },
      { to: '/raporlar', label: 'Raporlar', icon: <BarChart3 />, perm: ['rapor:gor'] },
      { to: '/ayarlar', label: 'Ayarlar', icon: <Settings />, perm: ['ayar:yonet'] },
    ],
  },
];

function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl bg-thread-400 text-brand-900 shadow-sm">
        <Scissors className="size-5" strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <div className={cx('text-[15px] font-extrabold tracking-tight', light ? 'text-white' : 'text-ink-900')}>DC Giyim</div>
        <div className={cx('text-[10px] font-semibold uppercase tracking-[0.18em]', light ? 'text-brand-200' : 'text-ink-500')}>Üretim Takip</div>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can, me } = useSession();
  return (
    <div className="flex h-full flex-col bg-brand-900 text-brand-100">
      <div className="px-5 py-5">
        <Logo light />
      </div>
      <div className="mx-4 mb-3 truncate rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-brand-100 ring-1 ring-white/10" title={me.tenant.name}>
        {me.tenant.name}
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(...i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              {g.group && <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-300/70">{g.group}</div>}
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition [&_svg]:size-[18px]', isActive ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-100/90 hover:bg-white/10 hover:text-white')
                  }
                >
                  {i.icon}
                  {i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ['search', q], queryFn: () => api.get<any[]>(`/dashboard/search${qs({ q })}`), enabled: q.trim().length >= 2 });
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
      <input
        className="input bg-ink-50 pl-9 ring-ink-200/80"
        placeholder="Sipariş no, model, cari, fasoncu, personel ara…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-y-auto rounded-2xl bg-white p-1 shadow-pop ring-1 ring-ink-200">
          {!data?.length && <div className="px-3 py-4 text-center text-sm text-ink-500">Sonuç yok</div>}
          {data?.map((r, i) => (
            <button key={i} type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-ink-50" onClick={() => { nav(r.link); setOpen(false); setQ(''); }}>
              <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-600">{r.type}</span>
              <span className="truncate text-sm font-semibold text-ink-900">{r.label}</span>
              {r.sub && <span className="truncate text-xs text-ink-500">{r.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAdd() {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const items = [
    { label: 'Yeni sipariş', to: '/siparisler?yeni=1', perm: 'siparis:yaz' },
    { label: 'Üretim kaydı gir', to: '/atolye', perm: 'uretim:kayit' },
    { label: 'Fasona iş gönder', to: '/fason?yeni=1', perm: 'fason:yaz' },
    { label: 'Kumaş girişi', to: '/depo', perm: 'depo:yaz' },
    { label: 'Sevkiyat yap', to: '/mamul?yeni=1', perm: 'mamul:yaz' },
    { label: 'Puantaj gir', to: '/personel?tab=puantaj', perm: 'puantaj:yaz' },
    { label: 'Tahsilat / ödeme', to: '/finans?yeni=1', perm: 'finans:yaz' },
    { label: 'Görev ata', to: '/gorevler?yeni=1', perm: 'gorev:yaz' },
  ].filter((i) => can(i.perm));
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-accent" onClick={() => setOpen((o) => !o)}>
        <Plus className="size-4" /> <span className="hidden sm:inline">Hızlı işlem</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-2xl bg-white p-1 shadow-pop ring-1 ring-ink-200">
          {items.map((i) => (
            <button key={i.to} type="button" className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-800 hover:bg-ink-50" onClick={() => { nav(i.to); setOpen(false); }}>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    qc.clear();
    nav('/giris');
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-ink-100" onClick={() => setOpen((o) => !o)}>
        <div className="grid size-8 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{me.user.name.slice(0, 1).toLocaleUpperCase('tr')}</div>
        <div className="hidden text-left leading-tight md:block">
          <div className="text-sm font-semibold text-ink-900">{me.user.name}</div>
          <div className="text-[11px] text-ink-500">{me.user.roleLabel}</div>
        </div>
        <ChevronDown className="hidden size-4 text-ink-400 md:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-2xl bg-white p-1 shadow-pop ring-1 ring-ink-200">
          <div className="border-b border-ink-100 px-3 py-2 text-xs text-ink-500">{me.user.email}</div>
          <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-ink-50" onClick={() => { nav('/hesabim'); setOpen(false); }}>
            <UserCircle2 className="size-4" /> Hesabım ve güvenlik
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={logout}>
            <LogOut className="size-4" /> Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}

function BottomNav() {
  const { can } = useSession();
  const items = [
    { to: '/', label: 'Kule', icon: <LayoutDashboard />, perm: 'panel:gor' },
    { to: '/atolye', label: 'Atölye', icon: <Activity />, perm: 'uretim:gor' },
    { to: '/siparisler', label: 'Sipariş', icon: <FileText />, perm: 'siparis:gor' },
    { to: '/fason', label: 'Fason', icon: <Handshake />, perm: 'fason:gor' },
    { to: '/depo', label: 'Depo', icon: <Boxes />, perm: 'depo:gor' },
  ].filter((i) => can(i.perm));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold [&_svg]:size-5', isActive ? 'text-brand-700' : 'text-ink-500')}>
          {i.icon}
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => setDrawer(false), [loc.pathname]);
  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-64">
          <Sidebar />
        </div>
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-pop">
            <button className="absolute right-3 top-5 z-10 rounded-lg p-1 text-white/80 hover:bg-white/10" onClick={() => setDrawer(false)} aria-label="Kapat">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200/70 bg-white/85 px-4 py-2.5 backdrop-blur sm:px-6">
          <button className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Menü">
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden flex-1 sm:block">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <QuickAdd />
            <UserMenu />
          </div>
        </header>
        <div className="border-b border-ink-200/70 bg-white px-4 py-2 sm:hidden">
          <GlobalSearch />
        </div>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
