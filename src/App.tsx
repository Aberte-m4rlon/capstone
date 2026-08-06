import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { AppShell } from './components/AppShell';
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
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ScannerPage } from './pages/ScannerPage';
import { PublicAnimalPage } from './pages/PublicAnimalPage';
import { ActivityLogPage } from './pages/ActivityLogPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/public/:id" element={<PublicAnimalPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/animals" element={<AnimalsPage />} />
        <Route path="/animals/:id" element={<AnimalProfilePage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/breeding" element={<BreedingPage />} />
        <Route path="/weights" element={<WeightsPage />} />
        <Route path="/vaccinations" element={<VaccinationsPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/scanner" element={<ScannerPage />} />
        <Route path="/activity-log" element={<ActivityLogPage />} />
        <Route path="/public/:id" element={<PublicAnimalPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

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
