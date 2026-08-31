import { type ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useFarmData } from '../../lib/useFarmData';
import { AppSidebar } from './AppSidebar';
import { MobileSidebar } from './MobileSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { AppHeader } from './AppHeader';
import { FloatingAICloud } from '../FloatingAICloud';


export const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard':        { title: 'Dashboard',            subtitle: 'Farm overview at a glance'                  },
  '/animals':          { title: 'Animals',               subtitle: 'Manage your goat & sheep records'           },
  '/health':           { title: 'Health Monitoring',     subtitle: 'Track and analyze animal health'            },
  '/breeding':         { title: 'Breeding',              subtitle: 'Mating, pregnancy, and kidding'             },
  '/weights':          { title: 'Weight & Growth',       subtitle: 'Track weight and predict growth'            },
  '/vaccinations':     { title: 'Vaccinations',          subtitle: 'Immunization schedule and alerts'           },
  '/feed':             { title: 'Feed Management',       subtitle: 'Feed records and efficiency'                },
  '/inventory':        { title: 'Inventory',             subtitle: 'Stock, supplies, and expiry alerts'         },
  '/reports':          { title: 'Reports & Analytics',   subtitle: 'Performance insights and exportable reports'},
  '/analytics':        { title: 'Analytics',             subtitle: 'Farm performance insights'                  },
  '/recommendations':  { title: 'Smart Recommendations', subtitle: 'AI-powered farm suggestions'                },
  '/daily-alerts':     { title: 'Daily Alerts',          subtitle: 'Planned reminders and urgent tasks'         },
  '/notifications':    { title: 'Notifications',         subtitle: 'Alerts and reminders'                       },
  '/activity-log':     { title: 'Activity Log',          subtitle: 'Complete history of all farm actions'       },
  '/myai':             { title: 'MyAI',                  subtitle: 'Local AI assistant powered by Ollama'       },
  '/camera-screening': { title: 'AI Health Scanner',     subtitle: 'ML-based preliminary health screening'      },
  '/scanner':          { title: 'QR Scanner',            subtitle: 'Scan animal QR codes'                       },
  '/admin':            { title: 'Admin Panel',           subtitle: 'Manage users and system data'               },
  '/super-admin':      { title: 'Super Admin',           subtitle: 'Full system control and user management'    },
  '/settings':         { title: 'Settings',              subtitle: 'Configure farm thresholds'                  },
};

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const farmData = useFarmData();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const isFarmManager = role === 'farm_manager' || (role !== 'system_admin' && role !== 'super_admin');

  const pathKey = Object.keys(PAGE_TITLES).find((k) => location.pathname.startsWith(k)) ?? '/dashboard';
  const pageTitle = PAGE_TITLES[pathKey] ?? { title: 'AlpasFarm', subtitle: '' };

  // ── Badges ──────────────────────────────────────────────────────────────────
  const unreadNotifs = farmData.notifications.filter((n) => !n.read).length;
  const overdueVacc  = farmData.animals.filter((a) => a.vaccination_status === 'Overdue' && !a.archived).length;
  const lowStock     = farmData.inventory.filter((i) => Number(i.quantity) <= Number(i.minimum_stock)).length;

  function getBadge(to: string): number {
    if (to === '/notifications' || to === '/daily-alerts') return unreadNotifs;
    if (to === '/vaccinations')  return overdueVacc;
    if (to === '/inventory')     return lowStock;
    return 0;
  }

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
          notifications={farmData.notifications}
          animals={farmData.animals}
          inventory={farmData.inventory}
          vaccinations={farmData.vaccinations}
          breedingRecords={farmData.breedingRecords}
          onRefreshData={farmData.refresh}
        />

        <main className="content">{children}</main>
      </div>

      {/* AI Cloud Floating Assistant */}
      <FloatingAICloud />

      {/* Mobile Fixed Bottom Navigation (<= 768px) */}
      <MobileBottomNav role={role} getBadge={getBadge} />
    </div>
  );
}

