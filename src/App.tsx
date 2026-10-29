import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { Loading } from './components/bits';
import { UiProvider } from './components/UiProvider';
import { demoMode } from './data/demo';
import { supabaseConfigured } from './data/supabase';
import { AddPage } from './pages/AddPage';
import { HomePage } from './pages/HomePage';
import { InventoryPage } from './pages/InventoryPage';
import { MovePage } from './pages/MovePage';
import { SatkaByCode, SatkaPage } from './pages/SatkaPage';
import { SearchPage } from './pages/SearchPage';
import { SetupMissingPage } from './pages/SetupMissingPage';
import { SyncPage } from './pages/SyncPage';

// Heavier, less-used screens load on demand.
const MapPage = lazy(() => import('./pages/MapPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const LabelsPage = lazy(() => import('./pages/LabelsPage'));
const ScanPage = lazy(() => import('./pages/ScanPage'));

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

function Gate() {
  const { state } = useAuth();
  if (state === 'loading') return <Loading />;
  if (state !== 'ready') return <LoginPage />;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/s/:code" element={<SatkaByCode />} />
        <Route path="/satka/:id" element={<SatkaPage />} />
        <Route path="/satka/:id/move" element={<MovePage />} />
        <Route path="/add" element={<AddPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/sync" element={<SyncPage />} />
        <Route path="/labels" element={<LabelsPage />} />
        <Route path="/admin/*" element={<AdminOnly><AdminPage /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  if (!supabaseConfigured && !demoMode) return <SetupMissingPage />;
  return (
    <HashRouter>
      <UiProvider>
        <AuthProvider>
          <div className="app">
            <Gate />
          </div>
        </AuthProvider>
      </UiProvider>
    </HashRouter>
  );
}
