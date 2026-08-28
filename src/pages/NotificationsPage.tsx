import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';
import { FilterToolbar, FilterPill } from '../components/FilterToolbar';
import { formatDateTime } from '../lib/analytics';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Bell,
  CheckCircle,
  Trash2,
  HeartPulse,
  Syringe,
  Heart,
  Scale,
  Package,
} from 'lucide-react';

export function NotificationsPage() {
  const farmData = useFarmData();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('All');

  const filtered = farmData.notifications.filter((n) => filter === 'All' || n.type === filter);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    farmData.refresh();
  };

  const markAllRead = async () => {
    const unread = farmData.notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    await supabase.from('notifications').update({ read: true }).in('id', unread.map((n) => n.id));
    toast('All notifications marked as read.', 'success');
    farmData.refresh();
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    farmData.refresh();
  };

  const clearAll = async () => {
    await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    toast('All notifications cleared.', 'success');
    farmData.refresh();
  };

  const priorityVariant = (p: string) =>
    p === 'Critical' ? 'danger' : p === 'Warning' ? 'warning' : 'primary';

  const typeIcon = (t: string) => {
    switch (t) {
      case 'Health': return <HeartPulse size={18} color="#FF3B30" />;
      case 'Vaccination': return <Syringe size={18} color="#FF7A18" />;
      case 'Breeding': return <Heart size={18} color="#FF7A18" />;
      case 'Weight': return <Scale size={18} color="#FF9F0A" />;
      case 'Inventory': return <Package size={18} color="#D92D20" />;
      default: return <Bell size={18} color="#FFB340" />;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Notifications</h1>
          <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
            {farmData.notifications.filter((n) => !n.read).length} unread of {farmData.notifications.length} total
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="secondary"
            onClick={markAllRead}
            disabled={farmData.notifications.every((n) => n.read)}
            leftIcon={<CheckCircle size={15} />}
          >
            Mark all read
          </Button>
          <Button
            variant="danger"
            onClick={clearAll}
            disabled={farmData.notifications.length === 0}
            leftIcon={<Trash2 size={15} />}
          >
            Clear all
          </Button>
        </div>
      </div>

      <FilterToolbar>
        {['All', 'Health', 'Vaccination', 'Breeding', 'Weight', 'Inventory', 'System'].map((t) => (
          <FilterPill
            key={t}
            active={filter === t}
            onClick={() => setFilter(t)}
            label={t}
          />
        ))}
      </FilterToolbar>

      <Card variant="glass" padding="none">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Bell size={32} />}
            title="No notifications"
            description="Alerts about your farm will appear here."
          />
        ) : (
          <div style={{ padding: '0 20px' }}>
            {filtered.map((n, idx) => (
              <div
                key={n.id}
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '14px 0',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-light, rgba(255,255,255,0.08))' : 'none',
                  cursor: n.link ? 'pointer' : 'default',
                  opacity: n.read ? 0.6 : 1,
                }}
                onClick={() => { if (n.link) navigate(n.link); }}
              >
                <div style={{ marginTop: 2 }}>{typeIcon(n.type)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</span>
                    <Badge variant={priorityVariant(n.priority)} size="sm">{n.priority}</Badge>
                    {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-brand-primary, #FF7A18)' }} />}
                  </div>
                  {n.description && <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{n.description}</div>}
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #475569)', marginTop: 4 }}>{formatDateTime(n.created_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {!n.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Mark as read"
                      onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                    >
                      <CheckCircle size={15} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
