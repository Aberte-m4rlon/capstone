import { type ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useFarmData } from '../../lib/useFarmData';
import { useNotifications } from '../../context/NotificationContext';
import { AppSidebar } from './AppSidebar';
import { MobileSidebar } from './MobileSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { AppHeader } from './AppHeader';
import { FloatingAICloud } from '../FloatingAICloud';

export const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard':        { title: 'Buod ng Bukid',        subtitle: 'Pangkalahatang kalagayan at mga gawain sa iyong bukid ngayong araw' },
  '/animals':          { title: 'Mga Hayop',            subtitle: 'Pamamahala ng mga alagang kambing at tupa' },
  '/health':           { title: 'Health Monitoring',    subtitle: 'Subaybayan ang kalagayan ng bawat kambing at tupa.' },
  '/breeding':         { title: 'Breeding',             subtitle: 'Pagpaparami, pagbubuntis, at panganganak' },
  '/weights':          { title: 'Timbang at Paglaki',   subtitle: 'Subaybayan ang timbang at paglaki ng mga alaga' },
  '/vaccinations':     { title: 'Mga Bakuna',           subtitle: 'Iskedyul ng bakuna at mga paalala' },
  '/feed':             { title: 'Pamamahala ng Pakain', subtitle: 'Talaan ng konsumo at nutrisyon sa pakain' },
  '/inventory':        { title: 'Farm Inventory',       subtitle: 'Buod ng lahat ng mayroon sa bukid.' },
  '/reports':          { title: 'Mga Ulat',             subtitle: 'Mga ulat sa kalusugan, bakuna, at bukid' },
  '/analytics':        { title: 'Analytics',            subtitle: 'Pagsusuri sa pag-unlad ng bukid' },
  '/recommendations':  { title: 'Smart Recommendations',subtitle: 'AI-powered na mungkahi para sa bukid' },
  '/daily-alerts':     { title: 'Mga Paalala',          subtitle: 'Mga alerto at paalala sa bukid' },
  '/notifications':    { title: 'Mga Paalala',          subtitle: 'Mga alerto at notification' },
  '/activity-log':     { title: 'Activity Log',         subtitle: 'Kasaysayan ng mga gawain sa bukid' },
  '/myai':             { title: 'AI Farm Assistant',    subtitle: 'Katuwang sa pagsasaka at kalusugan ng hayop' },
  '/camera-screening': { title: 'AI Health Scanner',    subtitle: 'Itutok ang camera sa kambing o tupa.' },
  '/scanner':          { title: 'QR Scanner',           subtitle: 'I-scan ang QR code ng hayop' },
  '/admin':            { title: 'Mga User',             subtitle: 'Pamamahala ng mga user at bukid' },
  '/super-admin':      { title: 'Super Admin',          subtitle: 'Pangkalahatang kontrol sa system' },
  '/settings':         { title: 'Mga Setting',          subtitle: 'Mga setting at detalye ng bukid' },
};

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const farmData = useFarmData();
  const { notifications, unreadCount, refresh: refreshNotifications } = useNotifications();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const isFarmManager = role === 'farm_manager' || (role !== 'system_admin' && role !== 'super_admin');

  const pathKey = Object.keys(PAGE_TITLES).find((k) => location.pathname.startsWith(k)) ?? '/dashboard';
  const pageTitle = PAGE_TITLES[pathKey] ?? { title: 'AlpasFarm', subtitle: '' };

  // ── Badges ──────────────────────────────────────────────────────────────────
  const unreadNotifs = unreadCount;
  const overdueVacc  = farmData.animals.filter((a) => a.vaccination_status === 'Overdue' && !a.archived).length;
  const lowStock     = farmData.inventory.filter((i) => Number(i.quantity) <= Number(i.minimum_stock)).length;

  function getBadge(to: string): number {
    if (to === '/notifications' || to === '/daily-alerts' || to === '/alerts') return unreadNotifs;
    if (to === '/vaccinations')  return overdueVacc;
    if (to === '/inventory')     return lowStock;
    return 0;
  }

  const handleCombinedRefresh = () => {
    farmData.refresh();
    refreshNotifications();
  };

  return (
    <div className="app-layout">
      {/* Desktop Sidebar */}
      <AppSidebar role={role} getBadge={getBadge} />

      {/* Mobile Drawer Sidebar */}
      <MobileSidebar
        open={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        role={role}
        getBadge={getBadge}
      />

      {/* Main Area */}
      <div className="main-area">
        <AppHeader
          title={pageTitle.title}
          subtitle={pageTitle.subtitle}
          onOpenMobileNav={() => setMobileSidebarOpen(true)}
          user={user}
          role={role}
          signOut={signOut}
          notifications={notifications}
          animals={farmData.animals}
          inventory={farmData.inventory}
          vaccinations={farmData.vaccinations}
          breedingRecords={farmData.breedingRecords}
          onRefreshData={handleCombinedRefresh}
        />

        <main className="content">{children}</main>
      </div>

      {/* AI Cloud Floating Assistant (hidden on full-screen camera scanner) */}
      {location.pathname !== '/camera-screening' && <FloatingAICloud />}

      {/* Mobile Fixed Bottom Navigation (<= 768px) */}
      <MobileBottomNav role={role} getBadge={getBadge} />
    </div>
  );
}
