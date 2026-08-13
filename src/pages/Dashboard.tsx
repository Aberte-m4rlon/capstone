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
      {/* Greeting Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 900,
          color: 'var(--text)',
          letterSpacing: '-0.5px',
          marginBottom: 8,
        }}>
          {greeting}, Farmer
        </h1>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: 14,
          letterSpacing: '0.3px',
        }}>
          Here's what's happening on your farm today.
        </p>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
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
            <button
              key={a.label}
              onClick={() => navigate(a.to)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border-light)',
                borderRadius: 12,
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                backdropFilter: 'var(--glass-blur)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
                (e.currentTarget as HTMLButtonElement).style.border = '1px solid var(--border)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)';
                (e.currentTarget as HTMLButtonElement).style.border = '1px solid var(--border-light)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              <Plus size={16} color="var(--accent)" />
              {a.label}
            </button>
          );
        })}
      </div>

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 14,
        marginBottom: 28,
      }}>
        {kpiCards.map((kpi) => {
          const Icon = Icons[kpi.icon];
          const colorMap = {
            red: '#EF4444',
            green: '#10B981',
            orange: '#F97316',
            purple: '#8B5CF6',
            blue: '#3B82F6',
            gray: '#6B7280',
          };
          return (
            <div
              key={kpi.label}
              style={{
                background: 'var(--surface)',
                backdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 18,
                boxShadow: 'var(--shadow-inner)',
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-8px)';
                (e.currentTarget as HTMLDivElement).style.border = '1px solid var(--border)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 20px 60px rgba(0, 0, 0, 0.25), 0 8px 24px ${colorMap[kpi.color]}20`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-inner)';
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${colorMap[kpi.color]}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `inset 0 1px 2px rgba(${colorMap[kpi.color]}, 0.1)`,
                }}>
                  <Icon size={20} color={colorMap[kpi.color]} />
                </div>
              </div>
              <div style={{
                fontSize: 22,
                fontWeight: 900,
                color: 'var(--text)',
                marginBottom: 4,
                letterSpacing: '-0.5px',
              }}>
                {kpi.value}
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 8,
                letterSpacing: '0.3px',
              }}>
                {kpi.label}
              </div>
              <div style={{
                fontSize: 11,
                color: kpi.deltaUp ? '#10B981' : '#F97316',
                fontWeight: 600,
              }}>
                {kpi.delta}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: 14,
        marginBottom: 28,
      }}>
        <div style={{
          background: 'var(--surface)',
          backdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 20,
          boxShadow: 'var(--shadow-inner)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
          }}>
            <div>
              <div style={{
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--text)',
                marginBottom: 4,
                letterSpacing: '-0.3px',
              }}>
                Health Check Activity
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                letterSpacing: '0.3px',
              }}>
                Records logged in the last 30 days
              </div>
            </div>
          </div>
          {healthTrendData.counts.every((c) => c === 0) ? (
            <div style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--text-secondary)',
            }}>
              <Icons.HeartPulse size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>No health records yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Start recording health checks to see trends</div>
            </div>
          ) : (
            <Line
              data={{
                labels: healthTrendData.labels,
                datasets: [
                  {
                    label: 'Health Records',
                    data: healthTrendData.counts,
                    borderColor: 'var(--accent)',
                    backgroundColor: 'rgba(255, 75, 43, 0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: 'var(--accent)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                  x: { grid: { display: false } },
                },
              }}
            />
          )}
        </div>

        <div style={{
          background: 'var(--surface)',
          backdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 20,
          boxShadow: 'var(--shadow-inner)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
          }}>
            <div>
              <div style={{
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--text)',
                marginBottom: 4,
                letterSpacing: '-0.3px',
              }}>
                Health Status Distribution
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                letterSpacing: '0.3px',
              }}>
                Current health of active animals
              </div>
            </div>
          </div>
          {activeAnimals.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--text-secondary)',
            }}>
              <Icons.PawPrint size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>No animals yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Add your first animal to see health distribution</div>
            </div>
          ) : (
            <div style={{ maxWidth: 300, margin: '0 auto' }}>
              <Doughnut
                data={{
                  labels: ['Healthy', 'Monitor', 'At Risk', 'Critical'],
                  datasets: [
                    {
                      data: [healthDistData.healthy, healthDistData.monitor, healthDistData.atRisk, healthDistData.critical],
                      backgroundColor: ['#10B981', '#3B82F6', '#F97316', '#EF4444'],
                      borderWidth: 0,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: {
                        font: { size: 12, weight: 600 },
                        color: 'var(--text-secondary)',
                        padding: 16,
                      },
                    },
                  },
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Weight Trend */}
      <div style={{
        background: 'var(--surface)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 20,
        boxShadow: 'var(--shadow-inner)',
        marginBottom: 28,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}>
          <div>
            <div style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--text)',
              marginBottom: 4,
              letterSpacing: '-0.3px',
            }}>
              Weight Growth Trend
            </div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              letterSpacing: '0.3px',
            }}>
              Average weight across all animals (last 12 weeks)
            </div>
          </div>
        </div>
        {weightTrendData.avgWeights.every((w) => w === 0) ? (
          <div style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--text-secondary)',
          }}>
            <Icons.Scale size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>No weight records yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Add the first weight record to start seeing growth trends</div>
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
                  pointRadius: 3,
                  pointBackgroundColor: '#3B82F6',
                  pointBorderColor: '#fff',
                  pointBorderWidth: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                x: { grid: { display: false } },
              },
            }}
          />
        )}
      </div>

      {/* ML Insights Panel */}
      <div style={{
        background: 'var(--surface)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 20,
        boxShadow: 'var(--shadow-inner)',
        marginBottom: 28,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}>
          <div>
            <div style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--text)',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              letterSpacing: '-0.3px',
            }}>
              <Brain size={18} color="var(--accent)" />
              ML-Powered Insights
            </div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              letterSpacing: '0.3px',
            }}>
              Real machine learning models trained on your farm data — {mlInsights.totalInsights} active insights
            </div>
          </div>
          <div style={{
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: '#8B5CF6',
          }}>
            {mlInsights.totalInsights} insights
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}>
          {/* Health Risk Model */}
          <div style={{
            padding: 16,
            borderRadius: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border-light)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Brain size={16} color="var(--accent)" />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Health Risk AI</span>
            </div>
            {mlInsights.healthModel?.canPredict ? (
              <>
                <div style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: mlInsights.healthModel.accuracy >= 0.7 ? '#10B981' : mlInsights.healthModel.accuracy >= 0.5 ? '#F97316' : '#EF4444',
                  marginBottom: 4,
                }}>
                  {Math.round(mlInsights.healthModel.accuracy * 100)}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Model accuracy · {mlInsights.healthModel.trainingSamples} samples
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Logistic regression
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Needs more health records</div>
            )}
          </div>

          {/* Anomaly Detection */}
          <div style={{
            padding: 16,
            borderRadius: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border-light)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertCircle size={16} color="#EF4444" />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Anomaly Detection</span>
            </div>
            <div style={{
              fontSize: 28,
              fontWeight: 900,
              color: mlInsights.anomalies.length > 0 ? '#EF4444' : '#10B981',
              marginBottom: 4,
            }}>
              {mlInsights.anomalies.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {mlInsights.anomalies.length === 0 ? 'No anomalies detected' : 'unusual readings'}
            </div>
            {mlInsights.anomalies.length > 0 && (
              <div style={{ fontSize: 10, color: '#EF4444' }}>
                {mlInsights.anomalies.slice(0, 1).map((a) => (
                  <div key={a.animal.id}>{a.animal.name}</div>
                ))}
              </div>
            )}
          </div>

          {/* Growth Predictions */}
          <div style={{
            padding: 16,
            borderRadius: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border-light)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TrendingUp size={16} color="#3B82F6" />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Growth Forecasts</span>
            </div>
            <div style={{
              fontSize: 28,
              fontWeight: 900,
              color: '#3B82F6',
              marginBottom: 4,
            }}>
              {mlInsights.growthPredictions.filter((g) => g.model).length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              polynomial models active
            </div>
          </div>

          {/* Animal Clustering */}
          <div style={{
            padding: 16,
            borderRadius: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border-light)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Layers size={16} color="#10B981" />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Animal Clusters</span>
            </div>
            {mlInsights.clusters ? (
              <>
                <div style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#10B981',
                  marginBottom: 4,
                }}>
                  {mlInsights.clusters.k}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  K-means clusters
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Needs 3+ animals</div>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations + Priorities */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: 14,
        marginBottom: 28,
      }}>
        <div style={{
          background: 'var(--surface)',
          backdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 20,
          boxShadow: 'var(--shadow-inner)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 16,
          }}>
            <div>
              <div style={{
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--text)',
                marginBottom: 4,
                letterSpacing: '-0.3px',
              }}>
                Smart Farm Assistant
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                letterSpacing: '0.3px',
              }}>
                Auto-generated from your farm data
              </div>
            </div>
            <Icons.Lightbulb size={18} color="var(--accent)" />
          </div>
          {recommendations.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 24,
              color: 'var(--text-secondary)',
            }}>
              <Icons.CheckCircle size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>All clear!</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>No urgent recommendations right now.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recommendations.slice(0, 6).map((rec, i) => {
                const colorMap = { red: '#EF4444', orange: '#F97316', yellow: '#F59E0B', blue: '#3B82F6' };
                return (
                  <div
                    key={i}
                    onClick={() => rec.link && navigate(rec.link)}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: 'var(--bg)',
                      border: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      transition: 'all 0.3s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                      (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-light)';
                      (e.currentTarget as HTMLDivElement).style.background = 'var(--bg)';
                    }}
                  >
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: colorMap[rec.severity_color as keyof typeof colorMap] || '#3B82F6',
                      marginTop: 4,
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--text)',
                        marginBottom: 2,
                      }}>
                        {rec.title}
                      </div>
                      {rec.description && (
                        <div style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                        }}>
                          {rec.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{
          background: 'var(--surface)',
          backdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 20,
          boxShadow: 'var(--shadow-inner)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 16,
          }}>
            <div>
              <div style={{
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--text)',
                marginBottom: 4,
                letterSpacing: '-0.3px',
              }}>
                Today's Priorities
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                letterSpacing: '0.3px',
              }}>
                Ranked by urgency
              </div>
            </div>
            <Icons.Activity size={18} color="var(--accent)" />
          </div>
          {priorities.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 24,
              color: 'var(--text-secondary)',
            }}>
              <Icons.CheckCircle size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>Nothing urgent</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>No priority tasks for today.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {priorities.slice(0, 6).map((p, i) => {
                const severityColor = p.severity === 'urgent' ? '#EF4444' : p.severity === 'attention' ? '#F97316' : p.severity === 'upcoming' ? '#F59E0B' : '#3B82F6';
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(p.link)}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: 'var(--bg)',
                      border: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      transition: 'all 0.3s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                      (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-light)';
                      (e.currentTarget as HTMLDivElement).style.background = 'var(--bg)';
                    }}
                  >
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: severityColor + '20',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: severityColor,
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--text)',
                        marginBottom: 2,
                      }}>
                        {p.title}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}>
                        {p.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Animals Table */}
      <div style={{
        background: 'var(--surface)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 20,
        boxShadow: 'var(--shadow-inner)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <div>
            <div style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--text)',
              marginBottom: 4,
              letterSpacing: '-0.3px',
            }}>
              Recent Animals
            </div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              letterSpacing: '0.3px',
            }}>
              Latest additions to your farm
            </div>
          </div>
          <button
            onClick={() => navigate('/animals')}
            style={{
              padding: '8px 14px',
              background: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-active)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
            }}
          >
            View all
          </button>
        </div>
        {activeAnimals.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--text-secondary)',
          }}>
            <Icons.PawPrint size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>No animals yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Add your first animal to get started</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{
                    padding: '12px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>Name</th>
                  <th style={{
                    padding: '12px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>Tag ID</th>
                  <th style={{
                    padding: '12px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>Species</th>
                  <th style={{
                    padding: '12px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>Sex</th>
                  <th style={{
                    padding: '12px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>Weight</th>
                  <th style={{
                    padding: '12px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>Health</th>
                  <th style={{
                    padding: '12px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>Added</th>
                </tr>
              </thead>
              <tbody>
                {activeAnimals.slice(0, 6).map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => navigate(`/animals/${a.id}`)}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      transition: 'background 0.3s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                    }}
                  >
                    <td style={{ padding: '14px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {a.name}
                    </td>
                    <td style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {a.tag_id}
                    </td>
                    <td style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {a.species}
                    </td>
                    <td style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {a.sex}
                    </td>
                    <td style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {a.weight_kg ? `${a.weight_kg} kg` : '—'}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <div style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: a.health_status === 'Healthy'
                          ? 'rgba(16, 185, 129, 0.2)'
                          : a.health_status === 'Monitor'
                          ? 'rgba(59, 130, 246, 0.2)'
                          : a.health_status === 'At Risk'
                          ? 'rgba(249, 115, 22, 0.2)'
                          : 'rgba(239, 68, 68, 0.2)',
                        color: a.health_status === 'Healthy'
                          ? '#10B981'
                          : a.health_status === 'Monitor'
                          ? '#3B82F6'
                          : a.health_status === 'At Risk'
                          ? '#F97316'
                          : '#EF4444',
                      }}>
                        {a.health_status}
                      </div>
                    </td>
                    <td style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {formatDate(a.created_at)}
                    </td>
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
