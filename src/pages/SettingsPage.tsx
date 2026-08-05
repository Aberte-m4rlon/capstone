import { useState, useEffect } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Icons } from '../lib/icons';

export function SettingsPage() {
  const farmData = useFarmData();
  const { user } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    farm_name: 'AlpasFarm',
    target_weight_kg: 40,
    gestation_days: 150,
    temp_critical: 40,
    heart_rate_high: 90,
    expiry_warning_days: 15,
    vaccine_due_days: 30,
    breeding_min_age_months: 8,
    breeding_min_weight_kg: 25,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (farmData.settings) {
      setForm({
        farm_name: farmData.settings.farm_name,
        target_weight_kg: Number(farmData.settings.target_weight_kg),
        gestation_days: farmData.settings.gestation_days,
        temp_critical: Number(farmData.settings.temp_critical),
        heart_rate_high: farmData.settings.heart_rate_high,
        expiry_warning_days: farmData.settings.expiry_warning_days,
        vaccine_due_days: farmData.settings.vaccine_due_days,
        breeding_min_age_months: farmData.settings.breeding_min_age_months,
        breeding_min_weight_kg: Number(farmData.settings.breeding_min_weight_kg),
      });
    }
  }, [farmData.settings]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (farmData.settings) {
        const { error } = await supabase.from('settings').update(form).eq('id', farmData.settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('settings').insert({ ...form, user_id: user.id });
        if (error) throw error;
      }
      toast('Settings saved successfully.', 'success');
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const numField = (label: string, key: keyof typeof form, hint?: string) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type="number"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      />
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Settings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          Configure farm thresholds and preferences. These values are used by the smart calculations.
        </p>
      </div>

      <div className="card section-gap">
        <div className="card-title" style={{ marginBottom: 14 }}>Farm Information</div>
        <div className="form-group">
          <label className="form-label">Farm Name</label>
          <input className="form-input" value={form.farm_name} onChange={(e) => setForm({ ...form, farm_name: e.target.value })} />
        </div>
      </div>

      <div className="card section-gap">
        <div className="card-title" style={{ marginBottom: 4 }}>Health Risk Thresholds</div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          These thresholds are used by the Smart Health Risk Prediction to determine alert levels.
        </p>
        <div className="form-row">
          {numField('Critical Temperature (°C)', 'temp_critical', 'Above this triggers a critical alert')}
          {numField('High Heart Rate (BPM)', 'heart_rate_high', 'Above this triggers a heart rate warning')}
        </div>
      </div>

      <div className="card section-gap">
        <div className="card-title" style={{ marginBottom: 4 }}>Breeding Settings</div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Used for kidding date calculation and breeding readiness assessment.
        </p>
        <div className="form-row-3">
          {numField('Gestation Days', 'gestation_days', 'Default: 150 days for goats')}
          {numField('Min Breeding Age (months)', 'breeding_min_age_months')}
          {numField('Min Breeding Weight (kg)', 'breeding_min_weight_kg')}
        </div>
      </div>

      <div className="card section-gap">
        <div className="card-title" style={{ marginBottom: 4 }}>Growth & Inventory</div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Used for market-ready predictions and inventory alerts.
        </p>
        <div className="form-row-3">
          {numField('Target Weight (kg)', 'target_weight_kg', 'For market-ready date estimation')}
          {numField('Expiry Warning (days)', 'expiry_warning_days', 'Items expiring within this many days alert')}
          {numField('Vaccine Due (days)', 'vaccine_due_days', 'Vaccinations due within this many days alert')}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
