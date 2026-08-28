import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { generateRecommendations } from '../lib/recommendations';
import {
  inventoryStatus,
  daysUntil,
  formatDate,
} from '../lib/analytics';
import { Icons } from '../lib/icons';
import {
  Plus, Brain, TrendingUp, AlertCircle, Layers,
  HeartPulse, PawPrint, Scale, Baby, Package, AlertTriangle,
  Lightbulb, Activity, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { useMLInsights } from '../lib/mlHooks';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

export function Dashboard() {
  const farmData = useFarmData();
  const navigate = useNavigate();
  const { animals, healthRecords, weightRecords, vaccinations, inventory, breedingRecords, settings } = farmData;
  const mlInsights = useMLInsights();

  const activeAnimals = animals.filter((a) => !a.archived);

  const stats = useMemo(() => {
    const total = activeAnimals.length;
    const healthy = activeAnimals.filter((a) => a.health_status === 'Healthy').length;
    const atRisk = activeAnimals.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical').length;
    const pregnant = activeAnimals.filter((a) => a.breeding_status === 'Pregnant').length;
    const avgWeight =
      activeAnimals.length > 0
        ? +(activeAnimals.reduce((s, a) => s + (Number(a.weight_kg) || 0), 0) / activeAnimals.length).toFixed(1)
        : 0;
    const invCount = inventory.length;
    const expiringSoon = inventory.filter((i) => {
      const s = inventoryStatus(i, settings?.expiry_warning_days ?? 15);
      return s.status === 'Expiring Soon' || s.status === 'Expired';
    }).length;
    const vaccDue = activeAnimals.filter(
      (a) => a.vaccination_status === 'Due Soon' || a.vaccination_status === 'Overdue'
    ).length;
    const newThisMonth = activeAnimals.filter((a) => {
      const d = new Date(a.created_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    return { total, healthy, atRisk, pregnant, avgWeight, invCount, expiringSoon, vaccDue, newThisMonth };
  }, [activeAnimals, inventory, settings]);

  const { recommendations, priorities } = useMemo(
    () => generateRecommendations(animals, healthRecords, weightRecords, vaccinations, inventory, breedingRecords, settings ?? undefined),
    [animals, healthRecords, weightRecords, vaccinations, inventory, breedingRecords, settings]
  );

  // Health trend chart (last 30 days)
  const healthTrendData = useMemo(() => {
    const days: string[] = [];
    const counts: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      days.push(label);
      const dayStr = d.toISOString().split('T')[0];
      const count = healthRecords.filter((r) => r.record_date === dayStr).length;
      counts.push(count);
    }
    return { labels: days, counts };
  }, [healthRecords]);

  // Weight growth chart (avg weight per week for last 12 weeks)
  const weightTrendData = useMemo(() => {
    const weeks: string[] = [];
    const avgWeights: number[] = [];
    for (let w = 11; w >= 0; w--) {
      const end = new Date();
      end.setDate(end.getDate() - w * 7);
      const endStr = end.toISOString().split('T')[0];
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      const startStr = start.toISOString().split('T')[0];
      weeks.push(end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

      const weekWeights = weightRecords.filter((r) => r.record_date >= startStr && r.record_date <= endStr);
      if (weekWeights.length > 0) {
        avgWeights.push(+(weekWeights.reduce((s, r) => s + Number(r.weight_kg), 0) / weekWeights.length).toFixed(1));
      } else {
        avgWeights.push(0);
      }
    }
    return { labels: weeks, avgWeights };
  }, [weightRecords]);

  // Health status distribution
  const healthDistData = useMemo(() => {
    const healthy = activeAnimals.filter((a) => a.health_status === 'Healthy').length;
    const monitor = activeAnimals.filter((a) => a.health_status === 'Monitor').length;
    const atRisk = activeAnimals.filter((a) => a.health_status === 'At Risk').length;
    const critical = activeAnimals.filter((a) => a.health_status === 'Critical').length;
    return { healthy, monitor, atRisk, critical };
  }, [activeAnimals]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (farmData.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <LoadingSpinner size="lg" text="Loading farm dashboard..." />
      </div>
    );
  }

  const kpiCards = [
    {
      title: 'Total Animals',
      value: stats.total,
      change: `+${stats.newThisMonth} this month`,
      changeType: 'positive' as const,
      icon: <PawPrint size={22} />,
      statusColor: 'var(--color-primary, #FF6A2A)',
      onClick: () => navigate('/animals'),
    },
    {
      title: 'Healthy Animals',
      value: stats.healthy,
      change: stats.total > 0 ? `${((stats.healthy / stats.total) * 100).toFixed(1)}% of herd` : 'All clear',
      changeType: 'positive' as const,
      icon: <HeartPulse size={22} />,
      statusColor: 'var(--color-success, #10B981)',
      onClick: () => navigate('/health'),
    },
    {
      title: 'Health Alerts',
      value: stats.atRisk,
      change: stats.atRisk > 0 ? 'Requires attention' : 'No urgent risks',
      changeType: stats.atRisk > 0 ? ('negative' as const) : ('positive' as const),
      icon: <AlertTriangle size={22} />,
      statusColor: stats.atRisk > 0 ? 'var(--color-danger, #EF4444)' : 'var(--color-warning, #F59E0B)',
      onClick: () => navigate('/health'),
    },
    {
      title: 'Breeding & Pregnant',
      value: stats.pregnant,
      change: `${activeAnimals.filter((a) => a.breeding_status === 'Pregnant' && a.expected_kidding_date && daysUntil(a.expected_kidding_date) <= 30).length} due soon`,
      changeType: 'neutral' as const,
      icon: <Baby size={22} />,
      statusColor: 'var(--color-warning, #F59E0B)',
      onClick: () => navigate('/breeding'),
    },
    {
      title: 'Inventory Stock',
      value: stats.invCount,
      change: stats.expiringSoon > 0 ? `${stats.expiringSoon} items expiring` : 'Stock optimal',
      changeType: stats.expiringSoon > 0 ? ('warning' as const) : ('positive' as const),
      icon: <Package size={22} />,
      statusColor: 'var(--color-info, #3B82F6)',
      onClick: () => navigate('/inventory'),
    },
    {
      title: 'Average Weight',
      value: `${stats.avgWeight} kg`,
      change: 'Active herd average',
      changeType: 'neutral' as const,
      icon: <Scale size={22} />,
      statusColor: 'var(--color-purple, #8B5CF6)',
      onClick: () => navigate('/weights'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* Greeting Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1
          style={{
            margin: 0,
            fontSize: '28px',
            fontWeight: 800,
            color: 'var(--color-text-primary, #0F172A)',
            letterSpacing: '-0.02em',
          }}
        >
          {greeting}, Farmer
        </h1>
        <p style={{ margin: 0, fontSize: '14.5px', color: 'var(--color-text-secondary, #475569)' }}>
          Here is your live herd summary, ML predictions, and operational tasks for today.
        </p>
      </div>

      {/* Quick Actions Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        {[
          { label: 'Add Animal', to: '/animals', icon: 'PawPrint' as const },
          { label: 'Health Check', to: '/health', icon: 'HeartPulse' as const },
          { label: 'Record Weight', to: '/weights', icon: 'Scale' as const },
          { label: 'Breeding Record', to: '/breeding', icon: 'Heart' as const },
          { label: 'Add Vaccine', to: '/vaccinations', icon: 'Syringe' as const },
          { label: 'Add Inventory', to: '/inventory', icon: 'Package' as const },
          { label: 'Record Feed', to: '/feed', icon: 'Wheat' as const },
        ].map((a) => {
          const Icon = Icons[a.icon];
          return (
            <Button
              key={a.label}
              variant="secondary"
              size="sm"
              onClick={() => navigate(a.to)}
              leftIcon={<Plus size={14} />}
              style={{
                justifyContent: 'flex-start',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md, 14px)',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.label}
              </span>
            </Button>
          );
        })}
      </div>

      {/* KPI Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {kpiCards.map((kpi) => (
          <StatCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            change={kpi.change}
            changeType={kpi.changeType}
            icon={kpi.icon}
            statusColor={kpi.statusColor}
            onClick={kpi.onClick}
          />
        ))}
      </div>

      {/* Charts Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 20,
        }}
      >
        {/* Health Activity Chart */}
        <Card variant="default" padding="lg">
          <CardHeader
            title="Health Check Activity"
            subtitle="Records logged in the last 30 days"
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/health')}>
                View Logs
              </Button>
            }
          />
          <CardContent>
            {healthTrendData.counts.every((c) => c === 0) ? (
              <EmptyState
                icon={<HeartPulse size={36} />}
                title="No health checks recorded"
                description="Start logging daily health checks to visualize herd trends."
                actionLabel="Log Health Check"
                onAction={() => navigate('/health')}
              />
            ) : (
              <div style={{ height: 260 }}>
                <Line
                  data={{
                    labels: healthTrendData.labels,
                    datasets: [
                      {
                        label: 'Health Checks',
                        data: healthTrendData.counts,
                        borderColor: '#FF6A2A',
                        backgroundColor: 'rgba(255, 106, 42, 0.12)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 3,
                        pointBackgroundColor: '#FF6A2A',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        grid: { color: 'rgba(148, 163, 184, 0.12)' },
                      },
                      x: { grid: { display: false } },
                    },
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Health Status Distribution */}
        <Card variant="default" padding="lg">
          <CardHeader
            title="Health Status Distribution"
            subtitle="Current active herd breakdown"
          />
          <CardContent>
            {activeAnimals.length === 0 ? (
              <EmptyState
                icon={<PawPrint size={36} />}
                title="No animals registered"
                description="Add your first goat or sheep to view distribution data."
                actionLabel="Add Animal"
                onAction={() => navigate('/animals')}
              />
            ) : (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: 280 }}>
                  <Doughnut
                    data={{
                      labels: ['Healthy', 'Monitor', 'At Risk', 'Critical'],
                      datasets: [
                        {
                          data: [
                            healthDistData.healthy,
                            healthDistData.monitor,
                            healthDistData.atRisk,
                            healthDistData.critical,
                          ],
                          backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'],
                          borderWidth: 0,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      plugins: {
                        legend: {
                          position: 'bottom',
                          labels: {
                            font: { size: 12, weight: 600 },
                            color: 'var(--color-text-secondary, #475569)',
                            padding: 12,
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ML Insights Panel */}
      <Card variant="elevated" padding="lg">
        <CardHeader
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Brain size={20} color="var(--color-primary, #FF6A2A)" />
              <span>Machine Learning Insights</span>
            </div>
          }
          subtitle={`Predictive models trained on your farm records — ${mlInsights.totalInsights} active insights`}
          action={
            <Badge variant="primary" size="sm">
              {mlInsights.totalInsights} Active Models
            </Badge>
          }
        />
        <CardContent>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
            }}
          >
            {/* Health Risk Model */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md, 14px)',
                background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
                border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Brain size={16} color="var(--color-primary, #FF6A2A)" />
                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary, #0F172A)' }}>
                  Health Risk AI
                </span>
              </div>
              {mlInsights.healthModel?.canPredict ? (
                <>
                  <div
                    style={{
                      fontSize: '26px',
                      fontWeight: 800,
                      color:
                        mlInsights.healthModel.accuracy >= 0.7
                          ? 'var(--color-success, #10B981)'
                          : 'var(--color-warning, #F59E0B)',
                      marginBottom: 4,
                    }}
                  >
                    {Math.round(mlInsights.healthModel.accuracy * 100)}%
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted, #64748B)' }}>
                    Model accuracy · {mlInsights.healthModel.trainingSamples} samples
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-muted, #64748B)' }}>
                  Awaiting more records
                </div>
              )}
            </div>

            {/* Anomaly Detection */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md, 14px)',
                background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
                border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertCircle size={16} color="var(--color-danger, #EF4444)" />
                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary, #0F172A)' }}>
                  Vitals Anomalies
                </span>
              </div>
              <div
                style={{
                  fontSize: '26px',
                  fontWeight: 800,
                  color:
                    mlInsights.anomalies.length > 0
                      ? 'var(--color-danger, #EF4444)'
                      : 'var(--color-success, #10B981)',
                  marginBottom: 4,
                }}
              >
                {mlInsights.anomalies.length}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted, #64748B)' }}>
                {mlInsights.anomalies.length === 0 ? 'No irregular readings' : 'Readings flagged'}
              </div>
            </div>

            {/* Growth Forecasts */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md, 14px)',
                background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
                border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <TrendingUp size={16} color="var(--color-info, #3B82F6)" />
                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary, #0F172A)' }}>
                  Growth Forecasts
                </span>
              </div>
              <div
                style={{
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--color-info, #3B82F6)',
                  marginBottom: 4,
                }}
              >
                {mlInsights.growthPredictions.filter((g) => g.model).length}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted, #64748B)' }}>
                Polynomial models active
              </div>
            </div>

            {/* Animal Clustering */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md, 14px)',
                background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
                border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Layers size={16} color="var(--color-purple, #8B5CF6)" />
                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary, #0F172A)' }}>
                  Herd Clusters
                </span>
              </div>
              <div
                style={{
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--color-purple, #8B5CF6)',
                  marginBottom: 4,
                }}
              >
                {mlInsights.clusters ? mlInsights.clusters.k : 0}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted, #64748B)' }}>
                K-means cluster groups
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations & Priorities Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 20,
        }}
      >
        {/* Smart Recommendations */}
        <Card variant="default" padding="lg">
          <CardHeader
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lightbulb size={18} color="var(--color-primary, #FF6A2A)" />
                <span>Smart Recommendations</span>
              </div>
            }
            subtitle="Auto-generated suggestions from farm telemetry"
          />
          <CardContent>
            {recommendations.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={32} />}
                title="All clear"
                description="No urgent farm recommendations at this moment."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recommendations.slice(0, 5).map((rec, i) => (
                  <div
                    key={i}
                    onClick={() => rec.link && navigate(rec.link)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md, 14px)',
                      background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
                      border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
                      cursor: rec.link ? 'pointer' : 'default',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background:
                          rec.severity_color === 'red'
                            ? 'var(--color-danger, #EF4444)'
                            : rec.severity_color === 'orange'
                            ? 'var(--color-warning, #F59E0B)'
                            : 'var(--color-primary, #FF6A2A)',
                        marginTop: 6,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                        {rec.title}
                      </div>
                      {rec.description && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)', marginTop: 2, lineHeight: 1.4 }}>
                          {rec.description}
                        </div>
                      )}
                    </div>
                    {rec.link && <ChevronRight size={16} color="var(--color-text-muted, #94A3B8)" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Priorities */}
        <Card variant="default" padding="lg">
          <CardHeader
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={18} color="var(--color-primary, #FF6A2A)" />
                <span>Today's Priorities</span>
              </div>
            }
            subtitle="Ranked operations by time and impact"
          />
          <CardContent>
            {priorities.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={32} />}
                title="Nothing urgent"
                description="All operational tasks and reminders are up to date."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {priorities.slice(0, 5).map((p, i) => (
                  <div
                    key={p.id}
                    onClick={() => p.link && navigate(p.link)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md, 14px)',
                      background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
                      border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
                      cursor: p.link ? 'pointer' : 'default',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 'var(--radius-xs, 6px)',
                        background: 'rgba(255, 106, 42, 0.12)',
                        color: 'var(--color-primary, #FF6A2A)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)', marginTop: 2, lineHeight: 1.4 }}>
                        {p.description}
                      </div>
                    </div>
                    {p.link && <ChevronRight size={16} color="var(--color-text-muted, #94A3B8)" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Animals Section */}
      <Card variant="default" padding="lg">
        <CardHeader
          title="Recent Animals"
          subtitle="Latest herd additions and status overview"
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/animals')}>
              View All
            </Button>
          }
        />
        <CardContent>
          {activeAnimals.length === 0 ? (
            <EmptyState
              icon={<PawPrint size={36} />}
              title="No animals found"
              description="Register animals to start tracking individual records."
              actionLabel="Add Animal"
              onAction={() => navigate('/animals')}
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Tag ID</th>
                    <th>Species</th>
                    <th>Sex</th>
                    <th>Weight</th>
                    <th>Health</th>
                    <th>Date Added</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAnimals.slice(0, 6).map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => navigate(`/animals/${a.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                        {a.name}
                      </td>
                      <td style={{ color: 'var(--color-primary, #FF6A2A)', fontWeight: 600 }}>
                        {a.tag_id}
                      </td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>{a.species}</td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>{a.sex}</td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>
                        {a.weight_kg ? `${a.weight_kg} kg` : '—'}
                      </td>
                      <td>
                        <Badge
                          variant={
                            a.health_status === 'Healthy'
                              ? 'success'
                              : a.health_status === 'Monitor'
                              ? 'info'
                              : a.health_status === 'At Risk'
                              ? 'warning'
                              : 'danger'
                          }
                          size="sm"
                          dot
                        >
                          {a.health_status}
                        </Badge>
                      </td>
                      <td style={{ color: 'var(--color-text-muted, #64748B)' }}>
                        {formatDate(a.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
