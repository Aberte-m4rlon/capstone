import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { inventoryStatus, formatDate, calculateGrowth } from '../lib/analytics';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { Icons } from '../lib/icons';
import { Brain, AlertCircle, Layers } from 'lucide-react';
import { useAnomalyDetection, useAnimalClusters } from '../lib/mlHooks';
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
import type { Animal } from '../types';

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
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: '3m', label: '3 Months', days: 90 },
  { key: '6m', label: '6 Months', days: 180 },
  { key: '1y', label: '1 Year', days: 365 },
  { key: 'all', label: 'All Time', days: 9999 },
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

  if (farmData.loading) return <div className="loading-center"><div className="spinner" /></div>;

  const hasData = activeAnimals.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Analytics</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Farm performance insights from real data</p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 10, padding: 4, boxShadow: 'var(--shadow)' }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              className={`btn btn-sm ${range === r.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="card">
          <div className="empty-state">
            <div className="es-icon"><Icons.Activity size={24} /></div>
            <h4>No data to analyze yet</h4>
            <p>Add animals and records to see analytics.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-2 section-gap">
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Health Check Activity</div>
              {healthTrend.counts.every((c) => c === 0) ? (
                <div className="empty-state"><p>No health records in this period.</p></div>
              ) : (
                <Line data={{ labels: healthTrend.labels, datasets: [{ label: 'Records', data: healthTrend.counts, borderColor: '#FF7A18', backgroundColor: 'rgba(255,122,24,0.12)', fill: true, tension: 0.3 }] }} options={{ responsive: true, plugins: { legend: { display: false } } }} />
              )}
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Health Status Distribution</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Doughnut data={{ labels: ['Healthy', 'Monitor', 'At Risk', 'Critical'], datasets: [{ data: healthDist, backgroundColor: ['#FFB340', '#FF9F0A', '#FF7A18', '#FF3B30'], borderWidth: 0 }] }} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }} />
              </div>
            </div>
          </div>

          <div className="grid-2 section-gap">
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Weight Growth Trend</div>
              {weightTrend.avgWeights.every((w) => w === 0) ? (
                <div className="empty-state"><p>No weight records in this period.</p></div>
              ) : (
                <Line data={{ labels: weightTrend.labels, datasets: [{ label: 'Avg Weight (kg)', data: weightTrend.avgWeights, borderColor: '#FF7A18', backgroundColor: 'rgba(255,122,24,0.12)', fill: true, tension: 0.3 }] }} options={{ responsive: true, plugins: { legend: { display: false } } }} />
              )}
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Species Distribution</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Doughnut data={{ labels: ['Goats', 'Sheep'], datasets: [{ data: speciesDist, backgroundColor: ['#FF3B30', '#FF9F0A'], borderWidth: 0 }] }} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }} />
              </div>
            </div>
          </div>

          <div className="grid-2 section-gap">
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Breeding Overview</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Doughnut data={{ labels: ['Pregnant', 'Open', 'Ready', 'Other'], datasets: [{ data: breedingOverview, backgroundColor: ['#FF7A18', '#A7B8CC', '#FFB340', '#475569'], borderWidth: 0 }] }} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }} />
              </div>
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Vaccination Compliance</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}>
                <Doughnut data={{ labels: ['Up to Date', 'Due Soon', 'Overdue', 'None'], datasets: [{ data: vaccCompliance, backgroundColor: ['#FFB340', '#FF9F0A', '#FF3B30', '#475569'], borderWidth: 0 }] }} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }} />
              </div>
            </div>
          </div>

          <div className="card section-gap">
            <div className="card-title" style={{ marginBottom: 14 }}>Inventory by Category</div>
            {invByCategory.every((c) => c === 0) ? (
              <div className="empty-state"><p>No inventory items.</p></div>
            ) : (
              <Bar data={{ labels: ['Feed', 'Medicine', 'Vaccines', 'Supplies', 'Equipment', 'Other'], datasets: [{ label: 'Items', data: invByCategory, backgroundColor: '#FF7A18', borderRadius: 6 }] }} options={{ responsive: true, plugins: { legend: { display: false } } }} />
            )}
          </div>

          {feedEfficiencyData.length > 0 && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Feed Consumption by Animal</div>
              <Bar data={{ labels: feedEfficiencyData.map((d) => d.name), datasets: [{ label: 'Feed (kg)', data: feedEfficiencyData.map((d) => d.feed), backgroundColor: '#FF9F0A', borderRadius: 6 }] }} options={{ responsive: true, plugins: { legend: { display: false } } }} />
            </div>
          )}

          {/* ML Anomaly Detection */}
          <div className="card section-gap" style={{ marginTop: 24, borderLeft: '3px solid #FF3B30' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <AlertCircle size={18} color="#FF3B30" />
              <span style={{ fontWeight: 700, fontSize: 14 }}>ML Anomaly Detection — Z-Score + IQR</span>
              <span className="badge" style={{ background: anomalies.length > 0 ? 'rgba(255,59,48,0.2)' : 'rgba(255,159,10,0.2)', color: anomalies.length > 0 ? '#FF3B30' : '#FFB340', border: '1px solid rgba(255,255,255,0.15)' }}>
                {anomalies.length} {anomalies.length === 1 ? 'anomaly' : 'anomalies'} detected
              </span>
            </div>
            {anomalies.length === 0 ? (
              <div className="empty-state"><div className="es-icon"><Icons.CheckCircle size={24} color="#FFB340" /></div><h4>No anomalies detected</h4><p>All vitals are within expected ranges based on historical data.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Animal</th><th>Metric</th><th>Value</th><th>Z-Score</th><th>Severity</th><th>Assessment</th></tr></thead>
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
                        <tr key={`${row.animal}-${row.anomaly.metric}-${i}`}>
                          <td style={{ fontWeight: 600 }}>{row.animal}</td>
                          <td>{row.anomaly.metric === 'temperature' ? 'Temperature' : 'Heart Rate'}</td>
                          <td>{row.anomaly.metric === 'temperature' ? (row.anomaly.zScore > 0 ? 'High' : 'Low') : (row.anomaly.zScore > 0 ? 'High' : 'Low')}</td>
                          <td style={{ fontWeight: 700, color: Math.abs(row.anomaly.zScore) > 3 ? 'var(--critical)' : 'var(--warning)' }}>{row.anomaly.zScore.toFixed(2)}</td>
                          <td><span className={`badge badge-${row.anomaly.severity === 'severe' ? 'red' : row.anomaly.severity === 'moderate' ? 'orange' : 'yellow'}`}>{row.anomaly.severity}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.anomaly.message}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ML K-Means Clustering */}
          {clusters && (
            <div className="card section-gap" style={{ borderLeft: '3px solid #FF7A18' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Layers size={18} color="#FF7A18" />
                <span style={{ fontWeight: 700, fontSize: 14 }}>ML Animal Clustering — K-Means</span>
                <span className="badge" style={{ background: 'rgba(255,159,10,0.2)', color: '#FFB340', border: '1px solid rgba(255,159,10,0.3)' }}>{clusters.k} clusters · {clusters.converged ? 'converged' : 'max iterations'}</span>
              </div>
              <div className="grid-auto">
                {clusters.clusterLabels.map((label, c) => {
                  const animalsInCluster = clusters.assignments.filter((a) => a.cluster === c);
                  return (
                    <div key={c} style={{ padding: 14, borderRadius: 12, background: 'var(--bg)' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: ['#FFB340', '#FF7A18', '#FF9F0A', '#FF3B30'][c % 4] }} />
                        {label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{animalsInCluster.length} {animalsInCluster.length === 1 ? 'animal' : 'animals'}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        {animalsInCluster.map((a) => a.name).join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10 }}>
                K-means clustering groups animals by similarity in weight, age, health risk, and species. Animals in the same cluster share similar characteristics and may need similar management strategies.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
