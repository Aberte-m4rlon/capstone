import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { Activity, AlertCircle, Layers, CheckCircle } from 'lucide-react';
import { useAnomalyDetection, useAnimalClusters } from '../lib/mlHooks';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { FilterToolbar, FilterPill } from '../components/FilterToolbar';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
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
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
);

type RangeKey = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: '7d', label: '7 Araw', days: 7 },
  { key: '30d', label: '30 Araw', days: 30 },
  { key: '3m', label: '3 Buwan', days: 90 },
  { key: '6m', label: '6 Buwan', days: 180 },
  { key: '1y', label: '1 Taon', days: 365 },
  { key: 'all', label: 'Lahat', days: 9999 },
];

export function AnalyticsPage() {
  const farmData = useFarmData();
  const [range, setRange] = useState<RangeKey>('30d');
  const anomalies = useAnomalyDetection();
  const clusters = useAnimalClusters();

  const rangeDays = RANGES.find((r) => r.key === range)?.days ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  // Health trend
  const healthTrend = useMemo(() => {
    const records = farmData.healthRecords.filter((r) => r.record_date >= cutoffStr);
    const days: string[] = [];
    const counts: number[] = [];
    const step = rangeDays > 90 ? 7 : 1;
    for (let i = rangeDays; i >= 0; i -= step) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      days.push(label);
      const dayStr = d.toISOString().split('T')[0];
      counts.push(records.filter((r) => r.record_date === dayStr).length);
    }
    return { labels: days, counts };
  }, [farmData.healthRecords, cutoffStr, rangeDays]);

  // Health distribution
  const healthDist = useMemo(() => {
    const healthy = activeAnimals.filter((a) => a.health_status === 'Healthy').length;
    const monitor = activeAnimals.filter((a) => a.health_status === 'Monitor').length;
    const atRisk = activeAnimals.filter((a) => a.health_status === 'At Risk').length;
    const critical = activeAnimals.filter((a) => a.health_status === 'Critical').length;
    return [healthy, monitor, atRisk, critical];
  }, [activeAnimals]);

  // Species distribution
  const speciesDist = useMemo(() => {
    const goats = activeAnimals.filter((a) => a.species === 'Goat').length;
    const sheep = activeAnimals.filter((a) => a.species === 'Sheep').length;
    return [goats, sheep];
  }, [activeAnimals]);

  // Weight trend
  const weightTrend = useMemo(() => {
    const records = farmData.weightRecords.filter((r) => r.record_date >= cutoffStr);
    const weeks: string[] = [];
    const avgWeights: number[] = [];
    const weekCount = Math.min(12, Math.ceil(rangeDays / 7));
    for (let w = weekCount - 1; w >= 0; w--) {
      const end = new Date();
      end.setDate(end.getDate() - w * 7);
      const endStr = end.toISOString().split('T')[0];
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      const startStr = start.toISOString().split('T')[0];
      weeks.push(end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      const weekWeights = records.filter((r) => r.record_date >= startStr && r.record_date <= endStr);
      avgWeights.push(weekWeights.length > 0 ? +(weekWeights.reduce((s, r) => s + Number(r.weight_kg), 0) / weekWeights.length).toFixed(1) : 0);
    }
    return { labels: weeks, avgWeights };
  }, [farmData.weightRecords, cutoffStr, rangeDays]);

  // Breeding overview
  const breedingOverview = useMemo(() => {
    const pregnant = activeAnimals.filter((a) => a.breeding_status === 'Pregnant').length;
    const open = activeAnimals.filter((a) => a.breeding_status === 'Open').length;
    const ready = activeAnimals.filter((a) => a.breeding_status === 'Ready').length;
    const other = activeAnimals.length - pregnant - open - ready;
    return [pregnant, open, ready, Math.max(0, other)];
  }, [activeAnimals]);

  // Vaccination compliance
  const vaccCompliance = useMemo(() => {
    const upToDate = activeAnimals.filter((a) => a.vaccination_status === 'Up to Date').length;
    const dueSoon = activeAnimals.filter((a) => a.vaccination_status === 'Due Soon').length;
    const overdue = activeAnimals.filter((a) => a.vaccination_status === 'Overdue').length;
    const none = activeAnimals.filter((a) => a.vaccination_status === 'None').length;
    return [upToDate, dueSoon, overdue, none];
  }, [activeAnimals]);

  // Inventory by category
  const invByCategory = useMemo(() => {
    const cats = ['Feed', 'Medicine', 'Vaccines', 'Supplies', 'Equipment', 'Other'];
    return cats.map((c) => farmData.inventory.filter((i) => i.category === c).length);
  }, [farmData.inventory]);

  // Feed efficiency
  const feedEfficiencyData = useMemo(() => {
    return activeAnimals.map((a) => {
      const feeds = farmData.feedRecords.filter((f) => f.animal_id === a.id);
      const weights = farmData.weightRecords.filter((w) => w.animal_id === a.id);
      if (feeds.length === 0) return null;
      const totalFeed = feeds.reduce((s, f) => s + Number(f.quantity_kg), 0);
      const totalCost = feeds.reduce((s, f) => s + Number(f.cost), 0);
      let gain = 0;
      if (weights.length >= 2) {
        const sorted = [...weights].sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());
        gain = Number(sorted[sorted.length - 1].weight_kg) - Number(sorted[0].weight_kg);
      }
      return { name: a.name, feed: totalFeed, cost: totalCost, gain };
    }).filter(Boolean) as { name: string; feed: number; cost: number; gain: number }[];
  }, [activeAnimals, farmData.feedRecords, farmData.weightRecords]);

  if (farmData.loading) return <LoadingSpinner fullScreen text="Ikinakarga ang pagsusuri..." />;

  const hasData = activeAnimals.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Pagsusuri at Ulat ng Bukid (Analytics)</h1>
          <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
            Pagsusuri sa pagganap ng bukid batay sa totoong datos
          </p>
        </div>
        <FilterToolbar>
          {RANGES.map((r) => (
            <FilterPill
              key={r.key}
              active={range === r.key}
              onClick={() => setRange(r.key)}
              label={r.label}
            />
          ))}
        </FilterToolbar>
      </div>

      {!hasData ? (
        <Card variant="glass" padding="none">
          <EmptyState
            icon={<Activity size={32} />}
            title="Wala pang sapat na datos para suriin"
            description="Magdagdag ng alagang hayop at mga rekord upang makita ang buong pagsusuri."
          />
        </Card>
      ) : (
        <>
          <div className="dashboard-charts-grid" style={{ marginBottom: 16 }}>
            <Card variant="glass" padding="md">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Dalas ng Pagsusuri sa Kalusugan</div>
              {healthTrend.counts.every((c) => c === 0) ? (
                <EmptyState title="Walang rekord sa kalusugan" description="Walang naitalang pagsusuri sa panahong ito." />
              ) : (
                <Line 
                  data={{ 
                    labels: healthTrend.labels, 
                    datasets: [{ 
                      label: 'Mga Tala', 
                      data: healthTrend.counts, 
                      borderColor: '#FF7A18', 
                      backgroundColor: 'rgba(255,122,24,0.15)', 
                      fill: true, 
                      tension: 0.3 
                    }] 
                  }} 
                  options={{ 
                    responsive: true, 
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { color: 'rgba(150, 170, 190, 0.10)' }, ticks: { color: 'var(--color-text-secondary, #475569)' } },
                      y: { grid: { color: 'rgba(150, 170, 190, 0.10)' }, ticks: { color: 'var(--color-text-secondary, #475569)' } }
                    }
                  }} 
                />
              )}
            </Card>

            <Card variant="glass" padding="md">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Distribusyon ng Kalusugan ng mga Hayop</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Doughnut 
                  data={{ 
                    labels: ['Malusog', 'Binabantayan', 'Nasa Panganib', 'Kritikal'], 
                    datasets: [{ 
                      data: healthDist, 
                      backgroundColor: ['#FFB340', '#FF9F0A', '#FF7A18', '#FF3B30'], 
                      borderWidth: 0 
                    }] 
                  }} 
                  options={{ 
                    responsive: true, 
                    plugins: { 
                      legend: { 
                        position: 'bottom', 
                        labels: { 
                          font: { size: 11, weight: 'bold' },
                          color: 'var(--color-text-secondary, #475569)'
                        } 
                      } 
                    } 
                  }} 
                />
              </div>
            </Card>
          </div>

          <div className="dashboard-charts-grid" style={{ marginBottom: 16 }}>
            <Card variant="glass" padding="md">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Takbo ng Paglaki ng Timbang</div>
              {weightTrend.avgWeights.every((w) => w === 0) ? (
                <EmptyState title="Walang rekord ng timbang" description="Walang naitalang timbang sa panahong ito." />
              ) : (
                <Line 
                  data={{ 
                    labels: weightTrend.labels, 
                    datasets: [{ 
                      label: 'Karaniwang Timbang (kg)', 
                      data: weightTrend.avgWeights, 
                      borderColor: '#FF7A18', 
                      backgroundColor: 'rgba(255,122,24,0.15)', 
                      fill: true, 
                      tension: 0.3 
                    }] 
                  }} 
                  options={{ 
                    responsive: true, 
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { color: 'rgba(150, 170, 190, 0.10)' }, ticks: { color: 'var(--color-text-secondary, #475569)' } },
                      y: { grid: { color: 'rgba(150, 170, 190, 0.10)' }, ticks: { color: 'var(--color-text-secondary, #475569)' } }
                    }
                  }} 
                />
              )}
            </Card>

            <Card variant="glass" padding="md">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Distribusyon ayon sa Uri (Species)</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Doughnut 
                  data={{ 
                    labels: ['Kambing', 'Tupa'], 
                    datasets: [{ 
                      data: speciesDist, 
                      backgroundColor: ['#FF3B30', '#FF9F0A'], 
                      borderWidth: 0 
                    }] 
                  }} 
                  options={{ 
                    responsive: true, 
                    plugins: { 
                      legend: { 
                        position: 'bottom', 
                        labels: { 
                          font: { size: 11, weight: 'bold' },
                          color: 'var(--color-text-secondary, #475569)'
                        } 
                      } 
                    } 
                  }} 
                />
              </div>
            </Card>
          </div>

          <div className="dashboard-charts-grid" style={{ marginBottom: 16 }}>
            <Card variant="glass" padding="md">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Pangkalahatang Kalagayan sa Breeding</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Doughnut 
                  data={{ 
                    labels: ['Buntis', 'Bukas (Open)', 'Handa (Ready)', 'Iba pa'], 
                    datasets: [{ 
                      data: breedingOverview, 
                      backgroundColor: ['#FF7A18', '#A7B8CC', '#FFB340', '#475569'], 
                      borderWidth: 0 
                    }] 
                  }} 
                  options={{ 
                    responsive: true, 
                    plugins: { 
                      legend: { 
                        position: 'bottom', 
                        labels: { 
                          font: { size: 11, weight: 'bold' },
                          color: 'var(--color-text-secondary, #475569)'
                        } 
                      } 
                    } 
                  }} 
                />
              </div>
            </Card>

            <Card variant="glass" padding="md">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Pagsunod sa Bakuna (Vaccination)</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Doughnut 
                  data={{ 
                    labels: ['Kumpleto', 'Kailangan Na', 'Lampas Na sa Araw', 'Wala'], 
                    datasets: [{ 
                      data: vaccCompliance, 
                      backgroundColor: ['#FFB340', '#FF9F0A', '#FF3B30', '#475569'], 
                      borderWidth: 0 
                    }] 
                  }} 
                  options={{ 
                    responsive: true, 
                    plugins: { 
                      legend: { 
                        position: 'bottom', 
                        labels: { 
                          font: { size: 11, weight: 'bold' },
                          color: 'var(--color-text-secondary, #475569)'
                        } 
                      } 
                    } 
                  }} 
                />
              </div>
            </Card>
          </div>

          <Card variant="glass" padding="md" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Imbentaryo ayon sa Kategorya</div>
            {invByCategory.every((c) => c === 0) ? (
              <EmptyState title="Walang gamit o supply" description="Magdagdag ng gamit o supply sa imbentaryo upang makita ang bilang." />
            ) : (
              <Bar 
                data={{ 
                  labels: ['Pakain', 'Gamot', 'Bakuna', 'Mga Kagamitan', 'Makinarya', 'Iba pa'], 
                  datasets: [{ 
                    label: 'Bilang ng Gamit', 
                    data: invByCategory, 
                    backgroundColor: '#FF7A18', 
                    borderRadius: 6 
                  }] 
                }} 
                options={{ 
                  responsive: true, 
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { color: 'rgba(150, 170, 190, 0.10)' }, ticks: { color: 'var(--color-text-secondary, #475569)' } },
                    y: { grid: { color: 'rgba(150, 170, 190, 0.10)' }, ticks: { color: 'var(--color-text-secondary, #475569)' } }
                  }
                }} 
              />
            )}
          </Card>

          {feedEfficiencyData.length > 0 && (
            <Card variant="glass" padding="md" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Pagkonsumo ng Pakain bawat Hayop</div>
              <Bar 
                data={{ 
                  labels: feedEfficiencyData.map((d) => d.name), 
                  datasets: [{ 
                    label: 'Pakain (kg)', 
                    data: feedEfficiencyData.map((d) => d.feed), 
                    backgroundColor: '#FF9F0A', 
                    borderRadius: 6 
                  }] 
                }} 
                options={{ 
                  responsive: true, 
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { color: 'rgba(150, 170, 190, 0.10)' }, ticks: { color: 'var(--color-text-secondary, #475569)' } },
                    y: { grid: { color: 'rgba(150, 170, 190, 0.10)' }, ticks: { color: 'var(--color-text-secondary, #475569)' } }
                  }
                }} 
              />
            </Card>
          )}

          {/* Health Anomaly Detection */}
          <Card variant="glass" padding="md" style={{ marginBottom: 16, borderLeft: '4px solid #FF3B30' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <AlertCircle size={20} color="#FF3B30" />
              <span style={{ fontWeight: 800, fontSize: 15 }}>Pagtukoy sa Hindi Pangkaraniwang Datos (Health Anomalies)</span>
              <Badge variant={anomalies.length > 0 ? 'danger' : 'warning'}>
                {anomalies.length} {anomalies.length === 1 ? 'hindi pangkaraniwang datos' : 'mga hindi pangkaraniwang datos'} ang napansin
              </Badge>
            </div>
            {anomalies.length === 0 ? (
              <EmptyState
                icon={<CheckCircle size={28} color="#FFB340" />}
                title="Walang napansing abnormal na datos"
                description="Lahat ng vital signs ay pasok sa karaniwang saklaw batay sa nakaraang datos."
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.08))', color: 'var(--color-text-secondary, #475569)' }}>
                      <th style={{ padding: '10px 8px', fontWeight: 600 }}>Hayop</th>
                      <th style={{ padding: '10px 8px', fontWeight: 600 }}>Metriko</th>
                      <th style={{ padding: '10px 8px', fontWeight: 600 }}>Halaga</th>
                      <th style={{ padding: '10px 8px', fontWeight: 600 }}>Z-Score</th>
                      <th style={{ padding: '10px 8px', fontWeight: 600 }}>Lala (Severity)</th>
                      <th style={{ padding: '10px 8px', fontWeight: 600 }}>Pagsusuri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const anomalyRows = anomalies.flatMap((a) => {
                        const rows: Array<{ animal: string; anomaly: { metric: string; zScore: number; severity: string; message: string } }> = [];
                        if (a.tempAnomaly?.isAnomaly) {
                          rows.push({ animal: a.animal.name, anomaly: a.tempAnomaly });
                        }
                        if (a.hrAnomaly?.isAnomaly) {
                          rows.push({ animal: a.animal.name, anomaly: a.hrAnomaly });
                        }
                        return rows;
                      });

                      return anomalyRows.map((row, i) => (
                        <tr key={`${row.animal}-${row.anomaly.metric}-${i}`} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.04))' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 700 }}>{row.animal}</td>
                          <td style={{ padding: '10px 8px' }}>{row.anomaly.metric === 'temperature' ? 'Surface Temperature' : 'Tibok ng Puso (Heart Rate)'}</td>
                          <td style={{ padding: '10px 8px' }}>{row.anomaly.metric === 'temperature' ? (row.anomaly.zScore > 0 ? 'Mataas' : 'Mababa') : (row.anomaly.zScore > 0 ? 'Mabilis' : 'Mabagal')}</td>
                          <td style={{ padding: '10px 8px', fontWeight: 800, color: Math.abs(row.anomaly.zScore) > 3 ? '#FF3B30' : '#FF9F0A' }}>{row.anomaly.zScore.toFixed(2)}</td>
                          <td style={{ padding: '10px 8px' }}>
                            <Badge variant={row.anomaly.severity === 'severe' ? 'danger' : row.anomaly.severity === 'moderate' ? 'warning' : 'neutral'} size="sm">
                              {row.anomaly.severity === 'severe' ? 'Malala' : row.anomaly.severity === 'moderate' ? 'Katamtaman' : 'Mababa'}
                            </Badge>
                          </td>
                          <td style={{ padding: '10px 8px', fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{row.anomaly.message}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Animal Clustering */}
          {clusters && (
            <Card variant="glass" padding="md" style={{ borderLeft: '4px solid #FF7A18', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <Layers size={20} color="#FF7A18" />
                <span style={{ fontWeight: 800, fontSize: 15 }}>Pagpapangkat ng mga Hayop sa Bukid</span>
                <Badge variant="warning">{clusters.k} pangkat · {clusters.converged ? 'nakumpleto' : 'natapos ang mga pagsusuri'}</Badge>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {clusters.clusterLabels.map((label, c) => {
                  const animalsInCluster = clusters.assignments.filter((a) => a.cluster === c);
                  return (
                    <div key={c} style={{ padding: 16, borderRadius: 14, background: 'var(--color-surface-elevated, rgba(0,0,0,0.04))', border: '1px solid var(--border-light, rgba(255,255,255,0.08))' }}>
                      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: ['#FFB340', '#FF7A18', '#FF9F0A', '#FF3B30'][c % 4] }} />
                        {label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', fontWeight: 600 }}>{animalsInCluster.length} {animalsInCluster.length === 1 ? 'hayop' : 'mga hayop'}</div>
                      <div style={{ fontSize: 12, marginTop: 8, wordBreak: 'break-word', lineHeight: 1.4 }}>
                        {animalsInCluster.map((a) => a.name).join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginTop: 14, lineHeight: 1.5 }}>
                Pinapangkat ng modelong ito ang mga hayop ayon sa pagkakapareho sa timbang, edad, kalusugan, at uri upang mas maging angkop ang paraan ng pag-aalaga.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
