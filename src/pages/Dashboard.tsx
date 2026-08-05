import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { generateRecommendations } from '../lib/recommendations';
import {
  inventoryStatus,
  daysUntil,
  calculateGrowth,
  formatDate,
} from '../lib/analytics';
import { Icons } from '../lib/icons';
import { Plus, Brain, TrendingUp, AlertCircle, Layers, Zap } from 'lucide-react';
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
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
      (a) => a.vaccination_status === 'Due Soon' || a.vaccination_status === 'Overdue',
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
    [animals, healthRecords, weightRecords, vaccinations, inventory, breedingRecords, settings],
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
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  const kpiCards = [
    { label: 'Total Animals', value: stats.total, delta: `+${stats.newThisMonth} this month`, icon: 'PawPrint' as const, color: 'red' as const, deltaUp: true },
    { label: 'Healthy Animals', value: stats.healthy, delta: stats.total > 0 ? `${((stats.healthy / stats.total) * 100).toFixed(1)}%` : '—', icon: 'HeartPulse' as const, color: 'green' as const, deltaUp: true },
    { label: 'At Risk', value: stats.atRisk, delta: stats.atRisk > 0 ? 'Requires attention' : 'All clear', icon: 'AlertTriangle' as const, color: 'orange' as const, deltaUp: stats.atRisk === 0 },
    { label: 'Pregnant / Breeding', value: stats.pregnant, delta: activeAnimals.filter((a) => a.breeding_status === 'Pregnant' && a.expected_kidding_date && daysUntil(a.expected_kidding_date) <= 30).length + ' due soon', icon: 'Baby' as const, color: 'purple' as const, deltaUp: true },
    { label: 'Average Weight', value: `${stats.avgWeight} kg`, delta: 'Across active animals', icon: 'Scale' as const, color: 'blue' as const, deltaUp: true },
    { label: 'Inventory Items', value: stats.invCount, delta: stats.expiringSoon > 0 ? `${stats.expiringSoon} expiring soon` : 'All stocked', icon: 'Package' as const, color: 'gray' as const, deltaUp: stats.expiringSoon === 0 },
  ];

  return (
    <div>
      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>{greeting}, Farmer</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          Here's what's happening on your farm today.
        </p>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {[
          { label: 'Add Animal', to: '/animals', icon: 'PawPrint' as const },
          { label: 'Health Check', to: '/health', icon: 'HeartPulse' as const },
          { label: 'Record Weight', to: '/weights', icon: 'Scale' as const },
          { label: 'Breeding Record', to: '/breeding', icon: 'Heart' as const },
          { label: 'Add Vaccination', to: '/vaccinations', icon: 'Syringe' as const },
          { label: 'Add Inventory', to: '/inventory', icon: 'Package' as const },
          { label: 'Record Feed', to: '/feed', icon: 'Wheat' as const },
        ].map((a) => {
          const Icon = Icons[a.icon];
          return (
            <button key={a.label} className="btn btn-secondary" onClick={() => navigate(a.to)}>
              <Plus size={15} /> {a.label}
            </button>
          );
        })}
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        {kpiCards.map((kpi) => {
          const Icon = Icons[kpi.icon];
          return (
            <div key={kpi.label} className="kpi-card">
              <div className="kpi-top">
                <div className={`kpi-icon ${kpi.color}`}>
                  <Icon size={20} />
                </div>
              </div>
              <div className="kpi-value">{kpi.value}</div>
              <div className="kpi-label">{kpi.label}</div>
              <div className={`kpi-delta ${kpi.deltaUp ? 'up' : 'neutral'}`}>{kpi.delta}</div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid-2 section-gap">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Health Check Activity</div>
              <div className="card-subtitle">Records logged in the last 30 days</div>
            </div>
          </div>
          {healthTrendData.counts.every((c) => c === 0) ? (
            <div className="empty-state">
              <div className="es-icon"><Icons.HeartPulse size={24} /></div>
              <h4>No health records yet</h4>
              <p>Start recording health checks to see trends.</p>
            </div>
          ) : (
            <Line
              data={{
                labels: healthTrendData.labels,
                datasets: [
                  {
                    label: 'Health Records',
                    data: healthTrendData.counts,
                    borderColor: '#B91C1C',
                    backgroundColor: 'rgba(185, 28, 28, 0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
              }}
            />
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Health Status Distribution</div>
              <div className="card-subtitle">Current health of active animals</div>
            </div>
          </div>
          {activeAnimals.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon"><Icons.PawPrint size={24} /></div>
              <h4>No animals yet</h4>
              <p>Add your first animal to see health distribution.</p>
            </div>
          ) : (
            <div style={{ maxWidth: 260, margin: '0 auto' }}>
              <Doughnut
                data={{
                  labels: ['Healthy', 'Monitor', 'At Risk', 'Critical'],
                  datasets: [
                    {
                      data: [healthDistData.healthy, healthDistData.monitor, healthDistData.atRisk, healthDistData.critical],
                      backgroundColor: ['#10B981', '#F59E0B', '#F97316', '#EF4444'],
                      borderWidth: 0,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Weight trend */}
      <div className="card section-gap">
        <div className="card-header">
          <div>
            <div className="card-title">Weight Growth Trend</div>
            <div className="card-subtitle">Average weight across all animals (last 12 weeks)</div>
          </div>
        </div>
        {weightTrendData.avgWeights.every((w) => w === 0) ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.Scale size={24} /></div>
            <h4>No weight records yet</h4>
            <p>Add the first weight record to start seeing growth trends.</p>
          </div>
        ) : (
          <Line
            data={{
              labels: weightTrendData.labels,
              datasets: [
                {
                  label: 'Avg Weight (kg)',
                  data: weightTrendData.avgWeights,
                  borderColor: '#3B82F6',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  fill: true,
                  tension: 0.3,
                  pointRadius: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true } },
            }}
          />
        )}
      </div>

      {/* ML Insights Panel */}
      <div className="card section-gap">
        <div className="card-header">
          <div>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Brain size={18} color="#7C3AED" /> ML-Powered Insights
            </div>
            <div className="card-subtitle">Real machine learning models trained on your farm data — {mlInsights.totalInsights} active insights</div>
          </div>
          <span className="badge badge-purple" style={{ background: '#EDE9FE', color: '#7C3AED' }}>{mlInsights.totalInsights} insights</span>
        </div>

        <div className="grid-4">
          {/* Health Risk Model */}
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Brain size={16} color="#7C3AED" />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Health Risk AI</span>
            </div>
            {mlInsights.healthModel?.canPredict ? (
              <>
                <div style={{ fontSize: 24, fontWeight: 800, color: mlInsights.healthModel.accuracy >= 0.7 ? 'var(--healthy)' : mlInsights.healthModel.accuracy >= 0.5 ? 'var(--warning)' : 'var(--critical)' }}>
                  {Math.round(mlInsights.healthModel.accuracy * 100)}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Model accuracy · {mlInsights.healthModel.trainingSamples} training samples</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Logistic regression trained on your health records</div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Needs more health records to train</div>
            )}
          </div>

          {/* Anomaly Detection */}
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <AlertCircle size={16} color="#EF4444" />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Anomaly Detection</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: mlInsights.anomalies.length > 0 ? 'var(--critical)' : 'var(--healthy)' }}>
              {mlInsights.anomalies.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{mlInsights.anomalies.length === 0 ? 'No anomalies detected' : 'unusual readings flagged'}</div>
            {mlInsights.anomalies.length > 0 && (
              <div style={{ fontSize: 11, marginTop: 4 }}>
                {mlInsights.anomalies.slice(0, 2).map((a) => (
                  <div key={a.animal.id} style={{ color: 'var(--critical)' }}>{a.animal.name}: {a.tempAnomaly?.message ?? a.hrAnomaly?.message}</div>
                ))}
              </div>
            )}
          </div>

          {/* Growth Predictions */}
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TrendingUp size={16} color="#3B82F6" />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Growth Forecasts</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--info)' }}>
              {mlInsights.growthPredictions.filter((g) => g.model).length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>polynomial regression models active</div>
            {mlInsights.growthPredictions.filter((g) => g.model && g.model.marketReadyDate).length > 0 && (
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>
                {mlInsights.growthPredictions.filter((g) => g.model?.marketReadyDate).slice(0, 2).map((g) => (
                  <div key={g.animalId}>{g.animalName}: market ready {g.model!.marketReadyDate}</div>
                ))}
              </div>
            )}
          </div>

          {/* Animal Clustering */}
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Layers size={16} color="#10B981" />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Animal Clusters</span>
            </div>
            {mlInsights.clusters ? (
              <>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--healthy)' }}>{mlInsights.clusters.k}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>K-means clusters found</div>
                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>
                  {mlInsights.clusters.clusterLabels.slice(0, 2).map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Needs 3+ animals</div>
            )}
          </div>
        </div>

        {/* Breeding + Milk + Feed predictions row */}
        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {mlInsights.breedingPredictions.filter((b) => b.prediction && b.prediction.probability >= 0.5).length > 0 && (
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg)', flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Zap size={14} color="#F59E0B" />
                <span style={{ fontWeight: 700, fontSize: 12 }}>Breeding Success Predictions</span>
              </div>
              {mlInsights.breedingPredictions.filter((b) => b.prediction && b.prediction.probability >= 0.5).slice(0, 3).map((b) => (
                <div key={b.animal.id} style={{ fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{b.animal.name}</span>: <span style={{ color: b.prediction!.probability >= 0.7 ? 'var(--healthy)' : 'var(--warning)' }}>{Math.round(b.prediction!.probability * 100)}% success</span>
                </div>
              ))}
            </div>
          )}
          {mlInsights.milkForecasts.filter((m) => m.forecast).length > 0 && (
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg)', flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <TrendingUp size={14} color="#3B82F6" />
                <span style={{ fontWeight: 700, fontSize: 12 }}>Milk Yield Forecast (Holt's Smoothing)</span>
              </div>
              {mlInsights.milkForecasts.filter((m) => m.forecast).slice(0, 3).map((m) => (
                <div key={m.animalId} style={{ fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{m.animalName}</span>: next 7 days avg <span style={{ fontWeight: 600, color: 'var(--info)' }}>{(m.forecast!.forecast.reduce((s, v) => s + v, 0) / m.forecast!.forecast.length).toFixed(2)} L/day</span>
                  <span style={{ marginLeft: 6, color: m.forecast!.confidence >= 70 ? 'var(--healthy)' : 'var(--warning)' }}>({m.forecast!.confidence}% conf.)</span>
                </div>
              ))}
            </div>
          )}
          {mlInsights.feedPrediction && (
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg)', flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <TrendingUp size={14} color="#10B981" />
                <span style={{ fontWeight: 700, fontSize: 12 }}>Feed-to-Gain Model</span>
              </div>
              <div style={{ fontSize: 12 }}>R² = <span style={{ fontWeight: 600 }}>{mlInsights.feedPrediction.rSquared.toFixed(3)}</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Slope: {mlInsights.feedPrediction.slope} kg gain per kg feed</div>
            </div>
          )}
        </div>
      </div>

      {/* Smart Recommendations + Priorities */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Smart Farm Assistant</div>
              <div className="card-subtitle">Auto-generated from your farm data</div>
            </div>
            <Icons.Lightbulb size={18} color="#F59E0B" />
          </div>
          {recommendations.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon"><Icons.CheckCircle size={24} /></div>
              <h4>All clear!</h4>
              <p>No urgent recommendations right now. Your farm is in great shape.</p>
            </div>
          ) : (
            recommendations.slice(0, 6).map((rec, i) => (
              <div
                key={i}
                className="rec-card"
                onClick={() => rec.link && navigate(rec.link)}
              >
                <div className={`rec-dot ${rec.severity_color}`}></div>
                <div>
                  <div className="rec-title">{rec.title}</div>
                  {rec.description && <div className="rec-desc">{rec.description}</div>}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Today's Priorities</div>
              <div className="card-subtitle">Ranked by urgency</div>
            </div>
            <Icons.Activity size={18} color="#B91C1C" />
          </div>
          {priorities.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon"><Icons.CheckCircle size={24} /></div>
              <h4>Nothing urgent</h4>
              <p>No priority tasks for today. Enjoy your day!</p>
            </div>
          ) : (
            priorities.slice(0, 6).map((p, i) => (
              <div
                key={p.id}
                className="priority-item"
                onClick={() => navigate(p.link)}
              >
                <div className={`priority-num ${p.severity}`}>{i + 1}</div>
                <div className="priority-content">
                  <div className="priority-title">{p.title}</div>
                  <div className="priority-desc">{p.description}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent animals */}
      <div className="card section-gap" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Recent Animals</div>
            <div className="card-subtitle">Latest additions to your farm</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/animals')}>View all</button>
        </div>
        {activeAnimals.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.PawPrint size={24} /></div>
            <h4>No animals yet</h4>
            <p>Add your first animal to get started.</p>
          </div>
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
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {activeAnimals.slice(0, 6).map((a) => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/animals/${a.id}`)}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td>{a.tag_id}</td>
                    <td>{a.species}</td>
                    <td>{a.sex}</td>
                    <td>{a.weight_kg ? `${a.weight_kg} kg` : '—'}</td>
                    <td>
                      <span className={`badge badge-${a.health_status === 'Healthy' ? 'green' : a.health_status === 'Monitor' ? 'blue' : a.health_status === 'At Risk' ? 'orange' : 'red'}`}>
                        {a.health_status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
