import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Icons } from '../lib/icons';
import { formatDateTime } from '../lib/analytics';

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

  const priorityColor = (p: string) =>
    p === 'Critical' ? 'red' : p === 'Warning' ? 'orange' : p === 'Success' ? 'green' : 'blue';

  const typeIcon = (t: string) => {
    switch (t) {
      case 'Health': return <Icons.HeartPulse size={18} color="#EF4444" />;
      case 'Vaccination': return <Icons.Syringe size={18} color="#F59E0B" />;
      case 'Breeding': return <Icons.Heart size={18} color="#3B82F6" />;
      case 'Weight': return <Icons.Scale size={18} color="#10B981" />;
      case 'Inventory': return <Icons.Package size={18} color="#F59E0B" />;
      default: return <Icons.Bell size={18} color="#9CA3AF" />;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Notifications</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {farmData.notifications.filter((n) => !n.read).length} unread of {farmData.notifications.length} total
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={markAllRead} disabled={farmData.notifications.every((n) => n.read)}>
            Mark all read
          </button>
          <button className="btn btn-danger" onClick={clearAll} disabled={farmData.notifications.length === 0}>
            Clear all
          </button>
        </div>
      </div>

      <div className="filter-bar">
        {['All', 'Health', 'Vaccination', 'Breeding', 'Weight', 'Inventory', 'System'].map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${filter === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.Bell size={24} /></div>
            <h4>No notifications</h4>
            <p>Alerts about your farm will appear here.</p>
          </div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.id}
              style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '14px 0', borderBottom: '1px solid var(--border)',
                cursor: n.link ? 'pointer' : 'default',
                opacity: n.read ? 0.6 : 1,
              }}
              onClick={() => { if (n.link) navigate(n.link); }}
            >
              <div style={{ marginTop: 2 }}>{typeIcon(n.type)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</span>
                  <span className={`badge badge-${priorityColor(n.priority)}`}>{n.priority}</span>
                  {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
                </div>
                {n.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{n.description}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{formatDateTime(n.created_at)}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!n.read && (
                  <button className="btn btn-ghost btn-sm" title="Mark as read" onClick={(e) => { e.stopPropagation(); markRead(n.id); }}>
                    <Icons.CheckCircle size={15} />
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" title="Delete" onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}>
                  <Icons.Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
