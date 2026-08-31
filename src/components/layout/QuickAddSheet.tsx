import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  PlusCircle,
  HeartPulse,
  Scale,
  Syringe,
  Package,
  Heart,
  Camera,
  QrCode,
  ArrowRight,
} from 'lucide-react';
import { GoatIcon } from './GoatIcon';

export interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  to: string;
  color: string;
  bgColor: string;
}

export function QuickAddSheet({ isOpen, onClose }: QuickAddSheetProps) {
  const navigate = useNavigate();

  // Close sheet on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open on mobile
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

  const actions: QuickAction[] = [
    {
      id: 'add-animal',
      title: 'Add New Animal',
      subtitle: 'Register goat or sheep with ID & breed',
      icon: <GoatIcon size={22} color="#43A047" strokeWidth={2.2} />,
      to: '/animals?action=add',
      color: '#43A047',
      bgColor: 'rgba(67, 160, 71, 0.12)',
    },
    {
      id: 'record-health',
      title: 'Record Health Check',
      subtitle: 'Log symptoms, vitals, or clinical treatment',
      icon: <HeartPulse size={22} color="#EF4444" strokeWidth={2.2} />,
      to: '/health?action=add',
      color: '#EF4444',
      bgColor: 'rgba(239, 68, 68, 0.12)',
    },
    {
      id: 'record-weight',
      title: 'Record Weight & Growth',
      subtitle: 'Log weigh-in and compute ADG metrics',
      icon: <Scale size={22} color="#3B82F6" strokeWidth={2.2} />,
      to: '/weights?action=add',
      color: '#3B82F6',
      bgColor: 'rgba(59, 130, 246, 0.12)',
    },
    {
      id: 'add-vaccination',
      title: 'Schedule Vaccination',
      subtitle: 'Record immunizations and booster alerts',
      icon: <Syringe size={22} color="#8B5CF6" strokeWidth={2.2} />,
      to: '/vaccinations?action=add',
      color: '#8B5CF6',
      bgColor: 'rgba(139, 92, 246, 0.12)',
    },
    {
      id: 'add-inventory',
      title: 'Add Inventory Item',
      subtitle: 'Restock medicines, feed bags, or supplies',
      icon: <Package size={22} color="#F59E0B" strokeWidth={2.2} />,
      to: '/inventory?action=add',
      color: '#F59E0B',
      bgColor: 'rgba(245, 158, 11, 0.12)',
    },
    {
      id: 'record-breeding',
      title: 'Record Breeding / Mating',
      subtitle: 'Log pairing, pregnancy checks, or kiddings',
      icon: <Heart size={22} color="#EC4899" strokeWidth={2.2} />,
      to: '/breeding?action=add',
      color: '#EC4899',
      bgColor: 'rgba(236, 72, 153, 0.12)',
    },
    {
      id: 'ai-scanner',
      title: 'AI Health Camera Scan',
      subtitle: 'Real-time preliminary livestock screening',
      icon: <Camera size={22} color="#10B981" strokeWidth={2.2} />,
      to: '/camera-screening',
      color: '#10B981',
      bgColor: 'rgba(16, 185, 129, 0.12)',
    },
  ];

  const handleActionClick = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <div className="bottom-sheet-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Quick Add Menu">
      <div
        className="bottom-sheet-panel quick-add-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className="bottom-sheet-handle" onClick={onClose} aria-hidden="true" />

        {/* Header */}
        <div className="bottom-sheet-header">
          <div>
            <h2 className="bottom-sheet-title">Quick Actions</h2>
            <p className="bottom-sheet-subtitle">Select an action to record farm data</p>
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

        {/* Actions Grid / List */}
        <div className="quick-add-grid">
          {actions.map((act) => (
            <button
              key={act.id}
              type="button"
              className="quick-add-item"
              onClick={() => handleActionClick(act.to)}
            >
              <div
                className="quick-add-icon-box"
                style={{ backgroundColor: act.bgColor }}
              >
                {act.icon}
              </div>
              <div className="quick-add-info">
                <span className="quick-add-item-title">{act.title}</span>
                <span className="quick-add-item-sub">{act.subtitle}</span>
              </div>
              <ArrowRight size={16} className="quick-add-arrow" />
            </button>
          ))}
        </div>

        {/* Cancel Button */}
        <div className="bottom-sheet-footer">
          <button
            type="button"
            className="bottom-sheet-cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
