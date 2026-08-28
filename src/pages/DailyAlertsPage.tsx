import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { generateDailyAlerts } from '../lib/recommendations';
import { FilterToolbar, FilterPill } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import { sendPushNotifications, generateAlertSummary, copyAlertSummaryToClipboard } from '../lib/alertNotifications';
import { useToast } from '../components/ui/Toast';
import { Bell, Copy, Mail, HeartPulse, Syringe, Heart, Scale, Package, CheckCircle, X } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/ui/Modal';

export function DailyAlertsPage() {
  const farmData = useFarmData();
  const navigate = useNavigate();
  const toast = useToast();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('All');

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

  const filteredAlerts = useMemo(() => {
    if (priorityFilter === 'All') return alerts;
    return alerts.filter((a) => a.priority === priorityFilter);
  }, [alerts, priorityFilter]);

  const alertSummary = useMemo(() => generateAlertSummary(alerts, farmData.settings?.farm_name ?? 'AlpasFarm'), [alerts, farmData.settings?.farm_name]);

  const handleSendPushNotifications = async () => {
    setSending(true);
    try {
      await sendPushNotifications(alerts);
      toast('Push notifications sent', 'success');
    } catch (err) {
      toast((err as Error).message || 'Failed to send notifications', 'danger');
    } finally {
      setSending(false);
    }
  };

  const handleCopySummary = async () => {
    try {
      await copyAlertSummaryToClipboard(alerts, farmData.settings?.farm_name ?? 'AlpasFarm');
      toast('Summary copied to clipboard', 'success');
    } catch (err) {
      toast('Failed to copy summary', 'danger');
    }
  };

  if (farmData.loading) {
    return <LoadingSpinner text="Loading daily alerts..." fullScreen />;
  }

  const badgeVariant = (priority: string) =>
    priority === 'Critical' ? 'danger' : priority === 'Warning' ? 'warning' : 'success';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Daily Alerts</h1>
        <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
          A concise list of the tasks and reminders that matter most today.
        </p>
      </div>

      {/* Action buttons */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <Button 
            variant="primary"
            onClick={handleSendPushNotifications}
            loading={sending}
            leftIcon={<Bell size={15} />}
          >
            Send Notifications
          </Button>
          <Button 
            variant="secondary"
            onClick={() => setSummaryOpen(true)}
            leftIcon={<Mail size={15} />}
          >
            View Summary
          </Button>
          <Button 
            variant="secondary"
            onClick={handleCopySummary}
            leftIcon={<Copy size={15} />}
          >
            Copy Summary
          </Button>
        </div>
      )}

      {/* One-Row Filter Toolbar */}
      <FilterToolbar>
        {['All', 'Critical', 'Warning', 'Info'].map((p) => (
          <FilterPill
            key={p}
            active={priorityFilter === p}
            onClick={() => setPriorityFilter(p)}
            label={p}
            count={p === 'All' ? alerts.length : alerts.filter((a) => a.priority === p).length}
          />
        ))}
      </FilterToolbar>

      <Card variant="glass" padding="none">
        {filteredAlerts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle size={32} />}
            title="No alerts for this filter"
            description="Your farm is running smoothly right now."
          />
        ) : (
          <div style={{ padding: '0 20px' }}>
            {filteredAlerts.map((alert, idx) => (
              <div
                key={alert.id}
                onClick={() => alert.link && navigate(alert.link)}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '16px 0',
                  borderBottom: idx < filteredAlerts.length - 1 ? '1px solid var(--border-light, rgba(255,255,255,0.08))' : 'none',
                  cursor: alert.link ? 'pointer' : 'default',
                }}
              >
                <div style={{ marginTop: 2 }}>
                  {alert.type === 'Health' && <HeartPulse size={18} color="#FF3B30" />}
                  {alert.type === 'Vaccination' && <Syringe size={18} color="#FF7A18" />}
                  {alert.type === 'Breeding' && <Heart size={18} color="#FF7A18" />}
                  {alert.type === 'Weight' && <Scale size={18} color="#FF9F0A" />}
                  {alert.type === 'Inventory' && <Package size={18} color="#D92D20" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{alert.title}</span>
                    <Badge variant={badgeVariant(alert.priority)} size="sm">{alert.priority}</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{alert.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #475569)', marginTop: 6 }}>Due: {alert.dueLabel}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* SMS/Email Summary Modal */}
      {summaryOpen && (
        <Modal open={summaryOpen} onClose={() => setSummaryOpen(false)} size="lg">
          <ModalHeader
            title="Daily Alert Summary"
            subtitle="Copy this summary to send via SMS, email, or messenger"
            icon={<Mail size={18} />}
          />
          <ModalBody>
            <pre style={{
              background: 'var(--color-surface-elevated, rgba(0, 0, 0, 0.2))',
              padding: 14,
              borderRadius: 8,
              fontSize: 12,
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              maxHeight: 350,
              overflowY: 'auto',
              border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
              color: 'var(--color-text-primary, #0f172a)',
            }}>
              {alertSummary}
            </pre>
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="secondary"
              onClick={() => setSummaryOpen(false)}
            >
              Close
            </Button>
            <Button 
              variant="primary"
              onClick={handleCopySummary}
              leftIcon={<Copy size={15} />}
            >
              Copy to Clipboard
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
