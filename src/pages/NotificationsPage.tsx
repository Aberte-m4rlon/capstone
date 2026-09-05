import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { FilterToolbar, FilterPill } from '../components/FilterToolbar';
import { formatDateTime } from '../lib/analytics';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import {
  Bell,
  CheckCircle2,
  Trash2,
  HeartPulse,
  Syringe,
  Heart,
  Scale,
  Package,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

export function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    loading,
    handleNotificationClick,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  const navigate = useNavigate();
  const [filter, setFilter] = useState('All');

  const filtered = notifications.filter((n) => {
    if (filter === 'All') return true;
    const t = (n.type || '').toLowerCase();
    const f = filter.toLowerCase();
    if (f === 'vaccination' && (t === 'vaccination' || t === 'vaccine')) return true;
    return t === f;
  });

  const priorityLabel = (p: string) => {
    const pr = (p || '').toLowerCase();
    if (pr === 'critical') return 'Kailangan ng Aksyon';
    if (pr === 'warning' || pr === 'high') return 'Mahalaga';
    if (pr === 'info') return 'Paalala';
    return 'Normal';
  };

  const notifCategoryFilters = [
    { id: 'All', label: 'Lahat' },
    { id: 'Health', label: 'Kalusugan' },
    { id: 'Vaccination', label: 'Bakuna' },
    { id: 'Breeding', label: 'Breeding' },
    { id: 'Weight', label: 'Timbang' },
    { id: 'Inventory', label: 'Imbentaryo' },
    { id: 'Expiry', label: 'Paso / Expiry' },
    { id: 'System', label: 'Sistema' },
  ];

  const priorityVariant = (p: string) => {
    const pr = (p || '').toLowerCase();
    if (pr === 'critical') return 'danger';
    if (pr === 'warning' || pr === 'high') return 'warning';
    if (pr === 'success') return 'success';
    return 'primary';
  };

  const typeIcon = (t: string) => {
    const type = (t || '').toLowerCase();
    switch (type) {
      case 'health':
        return <HeartPulse size={18} color="#EF4444" />;
      case 'expiry':
        return <AlertTriangle size={18} color="#F59E0B" />;
      case 'vaccination':
      case 'vaccine':
        return <Syringe size={18} color="#238B45" />;
      case 'breeding':
        return <Heart size={18} color="#238B45" />;
      case 'weight':
        return <Scale size={18} color="#238B45" />;
      case 'inventory':
        return <Package size={18} color="#238B45" />;
      default:
        return <Bell size={18} color="#238B45" />;
    }
  };

  if (loading && notifications.length === 0) {
    return <LoadingSpinner text="Kinukuha ang mga paalala..." fullScreen />;
  }

  return (
    <div>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Mga Paalala</h1>
          <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
            {unreadCount > 0 ? (
              <span>
                <strong style={{ color: '#238B45' }}>{unreadCount} bago</strong> sa kabuuang {notifications.length}
              </span>
            ) : (
              <span>Lahat ng {notifications.length} paalala ay nabasa na</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="secondary"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            leftIcon={<CheckCircle2 size={15} />}
          >
            Markahang Nabasa Lahat
          </Button>
          <Button
            variant="danger"
            onClick={clearAll}
            disabled={notifications.length === 0}
            leftIcon={<Trash2 size={15} />}
          >
            Burahin Lahat
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <FilterToolbar>
        {notifCategoryFilters.map((t) => {
          const count = notifications.filter((n) => {
            if (t.id === 'All') return true;
            const nt = (n.type || '').toLowerCase();
            const pill = t.id.toLowerCase();
            if (pill === 'vaccination' && (nt === 'vaccination' || nt === 'vaccine')) return true;
            return nt === pill;
          }).length;

          return (
            <FilterPill
              key={t.id}
              active={filter === t.id}
              onClick={() => setFilter(t.id)}
              label={t.label}
              count={count}
            />
          );
        })}
      </FilterToolbar>

      {/* Notifications List Container */}
      <Card variant="glass" padding="none">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Bell size={32} />}
            title="Walang mga paalala"
            description="Lalabas dito ang mga paalala at updates tungkol sa iyong bukid."
          />
        ) : (
          <div style={{ padding: '4px 16px' }}>
            {filtered.map((n, idx) => {
              const isUnread = !n.read && !n.is_read;
              const hasLink = Boolean(n.action_url || n.link || n.animal_id);

              return (
                <div
                  key={n.id}
                  className={`notif-row-card ${isUnread ? 'notif-card-unread' : 'notif-card-read'}`}
                  style={{
                    display: 'flex',
                    gap: 14,
                    alignItems: 'flex-start',
                    padding: '16px 14px',
                    margin: '8px 0',
                    borderRadius: '12px',
                    border: isUnread
                      ? '1px solid rgba(67, 160, 71, 0.35)'
                      : '1px solid var(--border-light, rgba(0,0,0,0.06))',
                    background: isUnread
                      ? 'var(--notif-unread-bg, rgba(67, 160, 71, 0.06))'
                      : 'var(--card-bg, rgba(255, 255, 255, 0.6))',
                    cursor: hasLink ? 'pointer' : 'default',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => {
                    handleNotificationClick(n, navigate);
                  }}
                >
                  {/* Left Icon */}
                  <div
                    style={{
                      marginTop: 2,
                      width: 36,
                      height: 36,
                      borderRadius: '10px',
                      background: isUnread ? 'rgba(67, 160, 71, 0.12)' : 'rgba(0, 0, 0, 0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {typeIcon(n.type)}
                  </div>

                  {/* Center Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontWeight: isUnread ? 800 : 600,
                          fontSize: 14.5,
                          color: 'var(--text, #0f172a)',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {n.title}
                      </span>
                      <Badge variant={priorityVariant(n.priority)} size="sm">
                        {priorityLabel(n.priority)}
                      </Badge>
                      {isUnread && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: '#238B45',
                            color: '#FFFFFF',
                            fontSize: '10px',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          ● BAGO
                        </span>
                      )}
                    </div>
                    {(n.description || n.message) && (
                      <div
                        style={{
                          fontSize: 13,
                          color: isUnread ? 'var(--text, #1e293b)' : 'var(--color-text-secondary, #64748b)',
                          lineHeight: 1.45,
                          marginTop: 2,
                        }}
                      >
                        {n.description || n.message}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: 11.5,
                        color: 'var(--color-text-secondary, #94a3b8)',
                        marginTop: 6,
                      }}
                    >
                      <span>{formatDateTime(n.created_at)}</span>
                      {hasLink && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#238B45', fontWeight: 600 }}>
                          Tingnan ang detalye <ArrowRight size={12} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {isUnread && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Markahang nabasa"
                        onClick={() => markAsRead(n.id)}
                        style={{ padding: '6px 8px' }}
                      >
                        <CheckCircle2 size={16} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Burahin"
                      onClick={() => deleteNotification(n.id)}
                      style={{ padding: '6px 8px', color: 'var(--color-danger, #EF4444)' }}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
