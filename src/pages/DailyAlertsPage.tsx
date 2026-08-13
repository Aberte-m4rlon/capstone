import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { generateDailyAlerts } from '../lib/recommendations';
import { Icons } from '../lib/icons';
import { sendPushNotifications, generateAlertSummary, copyAlertSummaryToClipboard } from '../lib/alertNotifications';
import { useToast } from '../lib/toast';
import { Bell, Copy, Mail } from 'lucide-react';

export function DailyAlertsPage() {
  const farmData = useFarmData();
  const navigate = useNavigate();
  const toast = useToast();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const alerts = useMemo(
    () => generateDailyAlerts(
      farmData.animals,
      farmData.healthRecords,
      farmData.weightRecords,
      farmData.vaccinations,
      farmData.inventory,
      farmData.breedingRecords,
      farmData.settings ?? undefined,
    ),
    [farmData],
  );

  const alertSummary = useMemo(() => generateAlertSummary(alerts, farmData.settings?.farm_name ?? 'AlpasFarm'), [alerts, farmData.settings?.farm_name]);

  const handleSendPushNotifications = async () => {
    setSending(true);
    try {
      await sendPushNotifications(alerts);
      toast('Push notifications sent', 'success');
    } catch (err) {
      toast((err as Error).message || 'Failed to send notifications', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleCopySummary = async () => {
    try {
      await copyAlertSummaryToClipboard(alerts, farmData.settings?.farm_name ?? 'AlpasFarm');
      toast('Summary copied to clipboard', 'success');
    } catch (err) {
      toast('Failed to copy summary', 'error');
    }
  };

  if (farmData.loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  const badgeColor = (priority: string) =>
    priority === 'Critical' ? 'red' : priority === 'Warning' ? 'orange' : 'green';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Daily Alerts</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          A concise list of the tasks and reminders that matter most today.
        </p>
      </div>

      {/* Action buttons */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary"
            onClick={handleSendPushNotifications}
            disabled={sending}
          >
            <Bell size={15} /> {sending ? 'Sending...' : 'Send Notifications'}
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => setSummaryOpen(true)}
          >
            <Mail size={15} /> View Summary
          </button>
          <button 
            className="btn btn-secondary"
            onClick={handleCopySummary}
          >
            <Copy size={15} /> Copy Summary
          </button>
        </div>
      )}

      <div className="card">
        {alerts.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.CheckCircle size={24} /></div>
            <h4>No alerts for today</h4>
            <p>Your farm is running smoothly right now.</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              onClick={() => alert.link && navigate(alert.link)}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                padding: '16px 0',
                borderBottom: '1px solid var(--border)',
                cursor: alert.link ? 'pointer' : 'default',
              }}
            >
              <div style={{ marginTop: 2 }}>
                {alert.type === 'Health' && <Icons.HeartPulse size={18} color="#EF4444" />}
                {alert.type === 'Vaccination' && <Icons.Syringe size={18} color="#F59E0B" />}
                {alert.type === 'Breeding' && <Icons.Heart size={18} color="#3B82F6" />}
                {alert.type === 'Weight' && <Icons.Scale size={18} color="#10B981" />}
                {alert.type === 'Inventory' && <Icons.Package size={18} color="#F59E0B" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{alert.title}</span>
                  <span className={`badge badge-${badgeColor(alert.priority)}`}>{alert.priority}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{alert.description}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>Due: {alert.dueLabel}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* SMS/Email Summary Modal */}
      {summaryOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 600,
            maxHeight: '80vh',
            overflowY: 'auto',
            width: '90%',
            boxShadow: '0 20px 25px rgba(0, 0, 0, 0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Daily Alert Summary</h2>
              <button 
                className="btn btn-ghost btn-sm"
                onClick={() => setSummaryOpen(false)}
              >
                <Icons.X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Copy this summary to send via SMS, email, or messenger
            </p>
            <pre style={{
              background: 'var(--bg-secondary)',
              padding: 12,
              borderRadius: 8,
              fontSize: 11,
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              maxHeight: 400,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}>
              {alertSummary}
            </pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button 
                className="btn btn-primary"
                onClick={handleCopySummary}
                style={{ flex: 1 }}
              >
                <Copy size={15} /> Copy to Clipboard
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setSummaryOpen(false)}
                style={{ flex: 1 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
