import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, type UserRole } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { AnimalsPage } from './pages/AnimalsPage';
import { AnimalProfilePage } from './pages/AnimalProfilePage';
import { HealthPage } from './pages/HealthPage';
import { BreedingPage } from './pages/BreedingPage';
import { WeightsPage } from './pages/WeightsPage';
import { VaccinationsPage } from './pages/VaccinationsPage';
import { FeedPage } from './pages/FeedPage';
import { InventoryPage } from './pages/InventoryPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ReportsPage } from './pages/ReportsPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { DailyAlertsPage } from './pages/DailyAlertsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ScannerPage } from './pages/ScannerPage';
import { PublicAnimalPage } from './pages/PublicAnimalPage';
import { ActivityLogPage } from './pages/ActivityLogPage';
import { AdminPage } from './pages/AdminPage';
import { MyAIPage } from './pages/MyAIPage';
import { SuperAdminPage } from './pages/SuperAdminPage';
import { ShieldAlert } from 'lucide-react';

// ─── Route guards ──────────────────────────────────────────────────────────────

/**
 * Requires authentication. Unauthenticated users are redirected to /login.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Requires one of the allowed roles in addition to authentication.
 * Shows an "Access Denied" message if the role doesn't match instead of
 * silently redirecting, so the user knows why they can't access the page.
 */
function RequireRole({
  children,
  allowed,
}: {
  children: React.ReactNode;
  allowed: UserRole[];
}) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!role || !allowed.includes(role)) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 16,
          textAlign: 'center',
          padding: 24,
        }}
      >
        <ShieldAlert size={52} color="#EF4444" />
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
          Access Denied
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 360 }}>
          You do not have permission to access this area. Contact the system administrator if
          you believe this is a mistake.
        </p>
        <Navigate to={
          role === 'super_admin' ? '/super-admin' :
          role === 'system_admin' ? '/admin' : '/dashboard'
        } replace />
      </div>
    );
  }

  return <>{children}</>;
}

// ─── Route tree ───────────────────────────────────────────────────────────────

function AppRoutes() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  // Public routes (no auth needed)
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/public/:id" element={<PublicAnimalPage />} />
        {/* Redirect everything else to landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Authenticated routes
  return (
    <AppShell>
      <Routes>
        {/* ── Farm Manager + Super Admin routes ── */}
        <Route
          path="/dashboard"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <Dashboard />
            </RequireRole>
          }
        />
        <Route
          path="/animals"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <AnimalsPage />
            </RequireRole>
          }
        />
        <Route
          path="/animals/:id"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <AnimalProfilePage />
            </RequireRole>
          }
        />
        <Route
          path="/health"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <HealthPage />
            </RequireRole>
          }
        />
        <Route
          path="/breeding"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <BreedingPage />
            </RequireRole>
          }
        />
        <Route
          path="/weights"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <WeightsPage />
            </RequireRole>
          }
        />
        <Route
          path="/vaccinations"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <VaccinationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/feed"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <FeedPage />
            </RequireRole>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <InventoryPage />
            </RequireRole>
          }
        />
        <Route
          path="/analytics"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <AnalyticsPage />
            </RequireRole>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <ReportsPage />
            </RequireRole>
          }
        />
        <Route
          path="/recommendations"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <RecommendationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/daily-alerts"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <DailyAlertsPage />
            </RequireRole>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <NotificationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/scanner"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <ScannerPage />
            </RequireRole>
          }
        />
        <Route
          path="/activity-log"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <ActivityLogPage />
            </RequireRole>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <SettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="/myai"
          element={
            <RequireRole allowed={['farm_manager', 'super_admin']}>
              <MyAIPage />
            </RequireRole>
          }
        />

        {/* ── System Admin routes ── */}
        <Route
          path="/admin"
          element={
            <RequireRole allowed={['system_admin', 'super_admin']}>
              <AdminPage />
            </RequireRole>
          }
        />

        {/* ── Super Admin routes ── */}
        <Route
          path="/super-admin"
          element={
            <RequireRole allowed={['super_admin']}>
              <SuperAdminPage />
            </RequireRole>
          }
        />

        {/* ── Public (authenticated or not) ── */}
        <Route path="/public/:id" element={<PublicAnimalPage />} />

        {/* ── Root redirect based on role ── */}
        <Route
          path="/"
          element={
            <Navigate
              to={
                role === 'super_admin' ? '/super-admin' :
                role === 'system_admin' ? '/admin' : '/dashboard'
              }
              replace
            />
          }
        />

        {/* ── Catch-all: redirect to role home ── */}
        <Route
          path="*"
          element={
            <Navigate
              to={
                role === 'super_admin' ? '/super-admin' :
                role === 'system_admin' ? '/admin' : '/dashboard'
              }
              replace
            />
          }
        />
      </Routes>
    </AppShell>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
