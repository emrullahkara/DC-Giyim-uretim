import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { SessionProvider, useMeQuery, useSession } from '@/lib/session';
import { Layout } from '@/components/Layout';
import { Loading, Empty } from '@/components/ui';
import { Login } from '@/pages/Login';
import { ShieldAlert } from 'lucide-react';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Orders = lazy(() => import('@/pages/Orders'));
const OrderDetail = lazy(() => import('@/pages/OrderDetail'));
const Board = lazy(() => import('@/pages/Board'));
const WorkOrders = lazy(() => import('@/pages/WorkOrders'));
const WorkOrderDetail = lazy(() => import('@/pages/WorkOrderDetail'));
const Fason = lazy(() => import('@/pages/Fason'));
const FasonDetail = lazy(() => import('@/pages/FasonDetail'));
const Quality = lazy(() => import('@/pages/Quality'));
const Models = lazy(() => import('@/pages/Models'));
const ModelDetail = lazy(() => import('@/pages/ModelDetail'));
const Stock = lazy(() => import('@/pages/Stock'));
const MaterialDetail = lazy(() => import('@/pages/MaterialDetail'));
const Finished = lazy(() => import('@/pages/Finished'));
const Personnel = lazy(() => import('@/pages/Personnel'));
const EmployeeDetail = lazy(() => import('@/pages/EmployeeDetail'));
const Parties = lazy(() => import('@/pages/Parties'));
const PartyDetail = lazy(() => import('@/pages/PartyDetail'));
const Finance = lazy(() => import('@/pages/Finance'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const Reports = lazy(() => import('@/pages/Reports'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const Account = lazy(() => import('@/pages/Account'));

function Guard({ perm, children }: { perm: string[]; children: ReactNode }) {
  const { can } = useSession();
  if (!can(...perm)) return <Empty icon={<ShieldAlert className="size-6" />} title="Bu sayfaya erişim yetkiniz yok" text="Yetki gerekiyorsa firma sahibinizle görüşün." />;
  return <>{children}</>;
}

function Home() {
  const { can } = useSession();
  if (can('panel:gor')) return <Dashboard />;
  return <Navigate to="/atolye" replace />;
}

function Authed() {
  const { data: me, isLoading, error } = useMeQuery();
  const nav = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    const h = () => { qc.clear(); nav('/giris'); };
    window.addEventListener('dc:unauthorized', h);
    return () => window.removeEventListener('dc:unauthorized', h);
  }, [nav, qc]);
  if (isLoading) return <Loading />;
  if (error || !me) return <Navigate to="/giris" replace />;
  if (me.user.mustChangePassword)
    return (
      <SessionProvider me={me}>
        <div className="mx-auto max-w-lg px-4 py-10">
          <Suspense fallback={<Loading />}>
            <Account forced />
          </Suspense>
        </div>
      </SessionProvider>
    );
  const g = (perm: string[], el: ReactNode) => <Guard perm={perm}>{el}</Guard>;
  return (
    <SessionProvider me={me}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="siparisler" element={g(['siparis:gor'], <Orders />)} />
            <Route path="siparisler/:id" element={g(['siparis:gor'], <OrderDetail />)} />
            <Route path="atolye" element={g(['uretim:gor'], <Board />)} />
            <Route path="uretim" element={g(['uretim:gor'], <WorkOrders />)} />
            <Route path="uretim/:id" element={g(['uretim:gor'], <WorkOrderDetail />)} />
            <Route path="fason" element={g(['fason:gor'], <Fason />)} />
            <Route path="fason/:id" element={g(['fason:gor'], <FasonDetail />)} />
            <Route path="kalite" element={g(['kalite:gor'], <Quality />)} />
            <Route path="modeller" element={g(['model:gor'], <Models />)} />
            <Route path="modeller/:id" element={g(['model:gor'], <ModelDetail />)} />
            <Route path="depo" element={g(['depo:gor'], <Stock />)} />
            <Route path="depo/:id" element={g(['depo:gor'], <MaterialDetail />)} />
            <Route path="mamul" element={g(['mamul:gor'], <Finished />)} />
            <Route path="personel" element={g(['personel:gor', 'puantaj:yaz'], <Personnel />)} />
            <Route path="personel/:id" element={g(['personel:gor'], <EmployeeDetail />)} />
            <Route path="cariler" element={g(['cari:gor'], <Parties />)} />
            <Route path="cariler/:id" element={g(['cari:gor'], <PartyDetail />)} />
            <Route path="finans" element={g(['finans:gor'], <Finance />)} />
            <Route path="gorevler" element={g(['gorev:gor'], <Tasks />)} />
            <Route path="raporlar" element={g(['rapor:gor'], <Reports />)} />
            <Route path="ayarlar" element={g(['ayar:yonet'], <SettingsPage />)} />
            <Route path="hesabim" element={<Account />} />
            <Route path="*" element={<Empty title="Sayfa bulunamadı" />} />
          </Route>
        </Routes>
      </Suspense>
    </SessionProvider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/giris" element={<Login />} />
      <Route path="/*" element={<Authed />} />
    </Routes>
  );
}
