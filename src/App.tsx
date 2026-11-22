import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './data/store';
import type { Capability } from './lib/roles';
import { AppShell } from './components/AppShell';
import { Splash } from './components/Splash';
import { Dashboard } from './pages/Dashboard';
import { Money } from './pages/Money';
import { ClientDetail, Clients } from './pages/Clients';
import { QuoteEditor, Quotes } from './pages/Quotes';
import { Settings } from './pages/Settings';
import { ProjectDetail, Work } from './pages/Work';
import { Login, Pending } from './pages/Login';
import { Empty } from './components/Sheet';

function Guard({ cap, children }: { cap: Capability; children: ReactNode }) {
  const { can } = useStore();
  return can(cap) ? <>{children}</> : <Empty icon="shield">Your role doesn’t have access to this section.</Empty>;
}

function Home() {
  const { can } = useStore();
  // land each role on the first screen it can actually use
  if (can('dashboard.view')) return <Dashboard />;
  if (can('work.view')) return <Navigate to="/work" replace />;
  return <Navigate to="/clients" replace />;
}

export function App() {
  const { auth, profile, db, error } = useStore();
  const ready = auth !== 'booting' && (auth !== 'ready' || profile?.role === 'pending' || !!db || !!error);

  return (
    <>
      <Splash ready={ready} />
      {auth === 'signed-out' && <Login />}
      {auth === 'ready' && profile?.role === 'pending' && <Pending />}
      {auth === 'ready' && profile && profile.role !== 'pending' && (
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="work" element={<Guard cap="work.view"><Work /></Guard>} />
              <Route path="work/projects/:id" element={<Guard cap="work.view"><ProjectDetail /></Guard>} />
              <Route path="money" element={<Guard cap="money.view"><Money /></Guard>} />
              <Route path="clients" element={<Guard cap="clients.view"><Clients /></Guard>} />
              <Route path="clients/:id" element={<Guard cap="clients.view"><ClientDetail /></Guard>} />
              <Route path="quotes" element={<Guard cap="quotes.view"><Quotes /></Guard>} />
              <Route path="quotes/new" element={<Guard cap="quotes.edit"><QuoteEditor /></Guard>} />
              <Route path="quotes/:id" element={<Guard cap="quotes.view"><QuoteEditor /></Guard>} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      )}
      {error && auth === 'ready' && !db && (
        <div className="login"><div className="login-card"><div className="banner">{error}</div></div></div>
      )}
    </>
  );
}
