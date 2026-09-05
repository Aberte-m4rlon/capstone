import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  X,
  HeartPulse,
  Heart,
  Scale,
  Syringe,
  Package,
  Camera,
  BarChart3,
  TrendingUp,
  Settings,
  History,
  Sparkles,
  Apple,
  Bot,
  Users,
  ShieldAlert,
  Crown,
  ChevronRight,
} from 'lucide-react';
import { GoatIcon } from './GoatIcon';

export interface MoreMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  role: string | null;
  getBadge: (to: string) => number;
}

interface MoreMenuItem {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: number;
  highlight?: boolean;
}

export function MoreMenuSheet({ isOpen, onClose, role, getBadge }: MoreMenuSheetProps) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const activeRole = role || 'farm_manager';

  let menuItems: MoreMenuItem[] = [];

  if (activeRole === 'super_admin') {
    menuItems = [
      {
        to: '/super-admin',
        label: 'Super Admin Control',
        description: 'System-wide governance and user management',
        icon: <Crown size={20} color="#238B45" />,
      },
      {
        to: '/admin',
        label: 'Admin Management',
        description: 'User access controls and role management',
        icon: <ShieldAlert size={20} color="#238B45" />,
      },
      {
        to: '/analytics',
        label: 'Analytics & Insights',
        description: 'Deep performance and growth telemetry',
        icon: <TrendingUp size={20} color="#238B45" />,
      },
      {
        to: '/reports',
        label: 'System Reports',
        description: 'Exportable audit trails and summaries',
        icon: <BarChart3 size={20} color="#238B45" />,
      },
      {
        to: '/activity-log',
        label: 'Activity Log',
        description: 'Chronological timeline of system events',
        icon: <History size={20} color="#238B45" />,
      },
      {
        to: '/settings',
        label: 'Settings',
        description: 'Farm configurations and preferences',
        icon: <Settings size={20} color="#238B45" />,
      },
    ];
  } else if (activeRole === 'system_admin') {
    menuItems = [
      {
        to: '/admin',
        label: 'User Management',
        description: 'Manage farm accounts and credentials',
        icon: <Users size={20} color="#238B45" />,
      },
      {
        to: '/analytics',
        label: 'Analytics & Metrics',
        description: 'Farm growth and efficiency statistics',
        icon: <TrendingUp size={20} color="#238B45" />,
      },
      {
        to: '/reports',
        label: 'System Reports',
        description: 'Download PDF / CSV summary exports',
        icon: <BarChart3 size={20} color="#238B45" />,
      },
      {
        to: '/activity-log',
        label: 'Activity Log',
        description: 'Review operational audit logs',
        icon: <History size={20} color="#238B45" />,
      },
      {
        to: '/settings',
        label: 'Settings',
        description: 'Manage preferences and thresholds',
        icon: <Settings size={20} color="#238B45" />,
      },
    ];
  } else {
    // Farm Manager (Standard)
    menuItems = [
      {
        to: '/health',
        label: 'Health Monitoring',
        description: 'Subaybayan ang kalagayan ng bawat kambing at tupa',
        icon: <HeartPulse size={20} color="#238B45" />,
      },
      {
        to: '/camera-screening',
        label: 'AI Health Scanner',
        description: 'Itutok ang camera sa kambing o tupa para sa screening',
        icon: <Camera size={20} color="#238B45" />,
        highlight: true,
      },
      {
        to: '/breeding',
        label: 'Breeding',
        description: 'Talaan ng pagpaparami, pagbubuntis, at panganganak',
        icon: <Heart size={20} color="#238B45" />,
      },
      {
        to: '/vaccinations',
        label: 'Mga Bakuna',
        description: 'Iskedyul ng bakuna at mga paalala',
        icon: <Syringe size={20} color="#238B45" />,
        badge: getBadge('/vaccinations'),
      },
      {
        to: '/inventory',
        label: 'Farm Inventory',
        description: 'Buod ng lahat ng mayroon sa bukid (Livestock at Stocks)',
        icon: <Package size={20} color="#238B45" />,
        badge: getBadge('/inventory'),
      },
      {
        to: '/weights',
        label: 'Timbang at Paglaki',
        description: 'Subaybayan ang timbang at paglaki ng mga alaga',
        icon: <Scale size={20} color="#238B45" />,
      },
      {
        to: '/feed',
        label: 'Pamamahala ng Pakain',
        description: 'Talaan ng konsumo at nutrisyon sa pakain',
        icon: <Apple size={20} color="#238B45" />,
      },
      {
        to: '/recommendations',
        label: 'Smart Recommendations',
        description: 'AI-assisted farm optimization tips',
        icon: <Sparkles size={20} color="#238B45" />,
      },
      {
        to: '/analytics',
        label: 'Analytics',
        description: 'Pagsusuri sa pag-unlad at produksyon ng bukid',
        icon: <TrendingUp size={20} color="#238B45" />,
      },
      {
        to: '/reports',
        label: 'Mga Ulat',
        description: 'Export PDF, Excel at printable records',
        icon: <BarChart3 size={20} color="#238B45" />,
      },
      {
        to: '/activity-log',
        label: 'Activity Log',
        description: 'Kasaysayan ng mga gawain sa bukid',
        icon: <History size={20} color="#238B45" />,
      },
      {
        to: '/settings',
        label: 'Mga Setting',
        description: 'Mga setting at detalye ng bukid',
        icon: <Settings size={20} color="#238B45" />,
      },
    ];
  }

  const handleSelect = (to: string) => {
    onClose();
    navigate(to);
  };

  const handleOpenMyAI = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('alpas:open-ai-cloud'));
  };

  return (
    <div className="bottom-sheet-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="More Features Menu">
      <div
        className="bottom-sheet-panel more-menu-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bottom-sheet-handle" onClick={onClose} aria-hidden="true" />

        <div className="bottom-sheet-header">
          <div>
            <h2 className="bottom-sheet-title">Iba pang Features</h2>
            <p className="bottom-sheet-subtitle">Lahat ng gamit at talaan sa bukid</p>
          </div>
          <button
            type="button"
            className="bottom-sheet-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick AI Assistant Card */}
        <div className="more-ai-card" onClick={handleOpenMyAI} role="button" tabIndex={0}>
          <div className="more-ai-icon-box">
            <Bot size={22} color="#FFFFFF" />
          </div>
          <div className="more-ai-text">
            <span className="more-ai-title">AI Farm Assistant</span>
            <span className="more-ai-desc">Magtanong o magpasuri ng talaan gamit ang AI</span>
          </div>
          <span className="more-ai-action-chip">Buksan</span>
        </div>

        {/* Modules List */}
        <div className="more-menu-list">
          {menuItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <button
                key={item.to}
                type="button"
                className={`more-menu-item ${isActive ? 'active' : ''} ${item.highlight ? 'highlight' : ''}`}
                onClick={() => handleSelect(item.to)}
              >
                <div className="more-menu-icon-box">{item.icon}</div>
                <div className="more-menu-info">
                  <div className="more-menu-title-row">
                    <span className="more-menu-item-title">{item.label}</span>
                    {Boolean(item.badge && item.badge > 0) && (
                      <span className="more-menu-badge">{item.badge}</span>
                    )}
                  </div>
                  <span className="more-menu-item-desc">{item.description}</span>
                </div>
                <ChevronRight size={18} className="more-menu-chevron" />
              </button>
            );
          })}
        </div>

        <div className="bottom-sheet-footer">
          <button
            type="button"
            className="bottom-sheet-cancel-btn"
            onClick={onClose}
          >
            Isara
          </button>
        </div>
      </div>
    </div>
  );
}
