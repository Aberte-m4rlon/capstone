import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';

import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select, FormField } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterToolbar, FilterSelect } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2, Brain } from 'lucide-react';
import { calculateGrowth, formatDate, daysBetween } from '../lib/analytics';
import { useGrowthPrediction } from '../lib/mlHooks';
import { Line } from 'react-chartjs-2';
import type { WeightRecord } from '../types';

const emptyForm = {
  animal_id: '',
  record_date: new Date().toISOString().split('T')[0],
  weight_kg: '',
  notes: '',
};

export function WeightsPage() {
  const farmData = useFarmData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WeightRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WeightRecord | null>(null);
  const [fAnimal, setFAnimal] = useState('All');
  const mlGrowth = useGrowthPrediction(fAnimal !== 'All' ? fAnimal : null);

  const activeAnimals = useMemo(
    () => farmData.animals.filter((a) => !a.archived),
    [farmData.animals]
  );

  const animalMap = useMemo(
    () => new Map(farmData.animals.map((a) => [a.id, a])),
    [farmData.animals]
  );

  const filtered = useMemo(() => {
    return farmData.weightRecords
      .filter((r) => fAnimal === 'All' || r.animal_id === fAnimal)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  }, [farmData.weightRecords, fAnimal]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, animal_id: activeAnimals[0]?.id ?? '' });
    setErrors({});
    setModalOpen(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'add') {
      openAdd();
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);

  const openEdit = (r: WeightRecord) => {
    setEditing(r);
    setForm({
      animal_id: r.animal_id,
      record_date: r.record_date,
      weight_kg: String(r.weight_kg),
      notes: r.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.animal_id) e.animal_id = 'Please select an animal.';
    if (!form.weight_kg || isNaN(Number(form.weight_kg)) || Number(form.weight_kg) <= 0)
      e.weight_kg = 'Please enter a valid weight greater than 0.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const animalWeights = farmData.weightRecords
      .filter((r) => r.animal_id === form.animal_id && (!editing || r.id !== editing.id))
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());

    const prev = animalWeights[0] ?? null;
    let prevWeight: number | null = null;
    let weightChange: number | null = null;
    let dailyGain: number | null = null;

    if (prev) {
      prevWeight = prev.weight_kg;
      weightChange = Number(form.weight_kg) - prev.weight_kg;
      const days = daysBetween(prev.record_date, form.record_date);
      if (days > 0) {
        dailyGain = Math.round((weightChange / days) * 1000) / 1000;
      }
    }

    const payload = {
      animal_id: form.animal_id,
      record_date: form.record_date,
      weight_kg: Number(form.weight_kg),
      previous_weight_kg: prevWeight,
      weight_change_kg: weightChange,
      daily_gain_kg: dailyGain,
      notes: form.notes.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('weight_records').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast('Weight record updated.', 'success');
      } else {
        const { error } = await supabase.from('weight_records').insert(payload);
        if (error) throw error;
        toast('Weight record created.', 'success');
      }

      await supabase
        .from('animals')
        .update({ weight_kg: Number(form.weight_kg) })
        .eq('id', form.animal_id);

      setModalOpen(false);
      farmData.refresh();
    } catch {
      toast('Unable to save weight record. Please try again.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error } = await supabase.from('weight_records').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Weight record deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Unable to delete weight record. Please try again.', 'danger');
    }
  };

  const animalName = (id: string) => {
    const a = farmData.animals.find((x) => x.id === id);
    return a ? `${a.name} (${a.tag_id})` : 'Unknown';
  };

  const growthSummaries = useMemo(() => {
    return activeAnimals
      .map((a) => {
        const weights = farmData.weightRecords.filter((w) => w.animal_id === a.id);
        return { animal: a, growth: calculateGrowth(weights, farmData.settings?.target_weight_kg ?? 40) };
      })
      .filter((x) => x.growth.currentWeight !== null);
  }, [activeAnimals, farmData.weightRecords, farmData.settings]);

  const chartData = useMemo(() => {
    if (fAnimal === 'All') return { labels: [], datasets: [] };
    const records = farmData.weightRecords
      .filter((r) => r.animal_id === fAnimal)
      .sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());

    return {
      labels: records.map((r) => formatDate(r.record_date)),
      datasets: [
        {
          label: 'Weight (kg)',
          data: records.map((r) => Number(r.weight_kg)),
          borderColor: '#FF7A18',
          backgroundColor: 'rgba(255,122,24,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#FF7A18',
        },
      ],
    };
  }, [farmData.weightRecords, fAnimal]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', letterSpacing: '-0.02em' }}>
            Weight & Growth Tracking
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary, #475569)', fontSize: '14px' }}>
            {filtered.length} weight records · Daily gain and growth trends auto-calculated
          </p>
        </div>
        <Button variant="primary" onClick={openAdd} disabled={activeAnimals.length === 0} leftIcon={<Plus size={16} />}>
          Record Weight
        </Button>
      </div>

      {/* Growth Summary Card */}
      <Card variant="default">
        <CardContent>
          <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-text-primary, #0F172A)', marginBottom: 14 }}>
            Growth Summary
          </div>
          {growthSummaries.length === 0 ? (
            <EmptyState
              icon={<Icons.Scale size={32} />}
              title="No weight data yet"
              description="Record weigh-ins to see growth predictions."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Animal</th>
                    <th>Current</th>
                    <th>Previous</th>
                    <th>Change</th>
                    <th>Daily Gain</th>
                    <th>Trend</th>
                    <th>Days to Target</th>
                  </tr>
                </thead>
                <tbody>
                  {growthSummaries.map(({ animal, growth }) => (
                    <tr key={animal.id}>
                      <td style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>{animal.name}</td>
                      <td>{growth.currentWeight} kg</td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>
                        {growth.previousWeight !== null ? `${growth.previousWeight} kg` : '—'}
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color:
                            growth.weightChange !== null && growth.weightChange > 0
                              ? 'var(--color-success, #16A34A)'
                              : growth.weightChange !== null && growth.weightChange < 0
                              ? 'var(--color-danger, #EF4444)'
                              : 'inherit',
                        }}
                      >
                        {growth.weightChange !== null
                          ? `${growth.weightChange > 0 ? '+' : ''}${growth.weightChange} kg`
                          : '—'}
                      </td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>
                        {growth.dailyGain !== null ? `${growth.dailyGain} kg/day` : '—'}
                      </td>
                      <td>
                        <Badge
                          variant={
                            growth.trend === 'Good'
                              ? 'success'
                              : growth.trend === 'Declining'
                              ? 'danger'
                              : growth.trend === 'Slow'
                              ? 'warning'
                              : 'default'
                          }
                          size="sm"
                        >
                          {growth.trend}
                        </Badge>
                      </td>
                      <td style={{ color: 'var(--color-primary, #FF6A2A)', fontWeight: 600 }}>
                        {growth.daysToTarget !== null ? `${growth.daysToTarget} days` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      {fAnimal !== 'All' && chartData.labels.length > 0 && (
        <Card variant="default">
          <CardContent>
            <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-text-primary, #0F172A)', marginBottom: 14 }}>
              Weight Chart — {animalName(fAnimal)}
            </div>
            <Line data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
          </CardContent>
        </Card>
      )}

      {/* ML Growth Prediction */}
      {mlGrowth && (
        <Card variant="default" style={{ borderLeft: '4px solid var(--color-primary, #43A047)' }}>
          <CardContent>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <Brain size={18} color="#43A047" />
              <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-text-primary, #1F2933)' }}>
                ML Growth Prediction — Polynomial Regression
              </span>
              <Badge variant="warning" size="sm">
                R² = {mlGrowth.rSquared.toFixed(3)}
              </Badge>
              <Badge variant="primary" size="sm">
                {mlGrowth.confidence}% confidence
              </Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #667085)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  Projected Daily Gain
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: mlGrowth.projectedDailyGain > 0 ? 'var(--color-success, #2E7D32)' : 'var(--color-danger, #EF4444)' }}>
                  {mlGrowth.projectedDailyGain} kg/day
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #667085)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  30-Day Projection
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary, #1F2933)' }}>
                  {mlGrowth.projectedWeights[Math.min(4, mlGrowth.projectedWeights.length - 1)]?.weight ?? '—'} kg
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #667085)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  Market Ready Date
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, paddingTop: 4, color: 'var(--color-primary, #43A047)' }}>
                  {mlGrowth.marketReadyDate ?? 'Already at target'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #667085)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  Model Fit (R²)
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: mlGrowth.rSquared >= 0.7 ? 'var(--color-success, #2E7D32)' : mlGrowth.rSquared >= 0.4 ? 'var(--color-warning, #F59E0B)' : 'var(--color-danger, #EF4444)' }}>
                  {mlGrowth.rSquared.toFixed(3)}
                </div>
              </div>
            </div>
            {mlGrowth.projectedWeights.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary, #667085)' }}>
                  Projected Growth Curve with Confidence Interval
                </div>
                <Line
                  data={{
                    labels: mlGrowth.projectedWeights.map((p) => p.date),
                    datasets: [
                      {
                        label: 'Projected Weight',
                        data: mlGrowth.projectedWeights.map((p) => p.weight),
                        borderColor: '#43A047',
                        backgroundColor: 'rgba(67, 160, 71, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 2,
                      },
                      {
                        label: 'Upper Bound',
                        data: mlGrowth.projectedWeights.map((p) => p.upper),
                        borderColor: 'rgba(255,106,42,0.3)',
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 0,
                      },
                      {
                        label: 'Lower Bound',
                        data: mlGrowth.projectedWeights.map((p) => p.lower),
                        borderColor: 'rgba(255,106,42,0.3)',
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 0,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: { legend: { display: true, labels: { font: { size: 10 } } } },
                    scales: { y: { beginAtZero: true } },
                  }}
                />
              </div>
            )}
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748B)', marginTop: 8, margin: 0 }}>
              This model fits a polynomial curve to your weight history and projects forward 90 days. The dashed lines show the confidence interval based on historical variance.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <FilterToolbar>
        <FilterSelect
          value={fAnimal}
          onChange={setFAnimal}
          options={[
            { value: 'All', label: 'All Animals' },
            ...activeAnimals.map((a) => ({ value: a.id, label: `${a.name} (${a.tag_id})` })),
          ]}
          ariaLabel="Filter Animal"
          minWidth={180}
        />
      </FilterToolbar>

      {/* Table */}
      <Card variant="default" padding="none">
        <CardContent>
          {filtered.length === 0 ? (
            <div style={{ padding: 32 }}>
              <EmptyState
                icon={<Icons.Scale size={32} />}
                title="No weight records"
                description="Record a weigh-in to start tracking growth."
                actionLabel="Record Weight"
                onAction={openAdd}
              />
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Animal</th>
                    <th>Weight</th>
                    <th>Previous</th>
                    <th>Change</th>
                    <th>Daily Gain</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w) => (
                    <tr key={w.id}>
                      <td>{formatDate(w.record_date)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                        {animalName(w.animal_id)}
                      </td>
                      <td style={{ fontWeight: 600 }}>{w.weight_kg} kg</td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>
                        {w.previous_weight_kg !== null ? `${w.previous_weight_kg} kg` : '—'}
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color:
                            w.weight_change_kg !== null && w.weight_change_kg > 0
                              ? 'var(--color-success, #16A34A)'
                              : w.weight_change_kg !== null && w.weight_change_kg < 0
                              ? 'var(--color-danger, #EF4444)'
                              : 'inherit',
                        }}
                      >
                        {w.weight_change_kg !== null ? `${w.weight_change_kg > 0 ? '+' : ''}${w.weight_change_kg} kg` : '—'}
                      </td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>
                        {w.daily_gain_kg !== null ? `${w.daily_gain_kg} kg/day` : '—'}
                      </td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(w)}>
                            <Pencil size={15} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(w)}>
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md">
        <ModalHeader
          title={editing ? 'Edit Weight Record' : 'Record Weight'}
          onClose={() => setModalOpen(false)}
        />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Animal" required error={errors.animal_id}>
              <Select
                value={form.animal_id}
                onChange={(e) => setForm({ ...form, animal_id: e.target.value })}
                options={[
                  { value: '', label: 'Select animal...' },
                  ...activeAnimals.map((a) => ({ value: a.id, label: `${a.name} (${a.tag_id})` })),
                ]}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Date" required>
                <Input
                  type="date"
                  value={form.record_date}
                  onChange={(e) => setForm({ ...form, record_date: e.target.value })}
                />
              </FormField>

              <FormField label="Weight (kg)" required error={errors.weight_kg}>
                <Input
                  type="number"
                  step="0.1"
                  value={form.weight_kg}
                  onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                  placeholder="35.5"
                />
              </FormField>
            </div>

            <FormField label="Notes">
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Weight observation notes..."
                style={{ minHeight: 80 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {editing ? 'Save Changes' : 'Save Record'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Weight Record"
        message="Are you sure you want to delete this weight record? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
