import { useState, useEffect, useRef } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Icons } from '../lib/icons';
import { Camera, KeyRound, Eye, EyeOff, User } from 'lucide-react';

export function SettingsPage() {
  const farmData = useFarmData();
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState('');

  // Load avatar from user metadata
  useEffect(() => {
    if (user?.user_metadata?.avatar_url) {
      setAvatarUrl(user.user_metadata.avatar_url);
    }
  }, [user]);

  // ── Change Password ──────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    setPwError('');
    if (!pwForm.newPw) { setPwError('New password is required.'); return; }
    if (pwForm.newPw.length < 6) { setPwError('Password must be at least 6 characters.'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
      if (error) throw error;
      toast('Password changed successfully.', 'success');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Unable to change password.');
    } finally {
      setSavingPw(false);
    }
  };

  // ── Upload Profile Photo ─────────────────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast('Image must be under 2 MB.', 'error'); return; }
    if (!file.type.startsWith('image/')) { toast('Please select an image file.', 'error'); return; }

    setUploadingAvatar(true);
    try {
      // Upload to Supabase Storage
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = data.publicUrl + `?t=${Date.now()}`; // cache-bust

      // Update user metadata
      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
      if (updateError) throw updateError;

      setAvatarUrl(url);
      toast('Profile photo updated.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      // Fallback: use object URL locally if storage bucket not set up
      if (msg.includes('Bucket') || msg.includes('bucket') || msg.includes('not found')) {
        const localUrl = URL.createObjectURL(file);
        setAvatarUrl(localUrl);
        toast('Profile photo updated locally. (Set up a "avatars" storage bucket in Supabase for permanent storage.)', 'success');
      } else {
        toast(msg, 'error');
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const initials = user?.email ? user.email[0].toUpperCase() : 'F';

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
          Configure your profile and farm preferences.
        </p>
      </div>

      {/* ── Profile Section ── */}
      <div className="card section-gap">
        <div className="card-title" style={{ marginBottom: 16 }}>
          <User size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Profile
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: avatarUrl ? 'transparent' : 'linear-gradient(135deg, #B91C1C, #991B1B)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: '#fff',
              overflow: 'hidden', flexShrink: 0,
              border: '3px solid var(--border)',
            }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--primary)', color: '#fff', border: '2px solid var(--card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 12,
              }}
              title="Upload photo"
            >
              <Camera size={12} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{user?.email}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Farmer · AlpasFarm</div>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
            >
              <Camera size={13} /> {uploadingAvatar ? 'Uploading…' : 'Change Photo'}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <KeyRound size={15} color="var(--text-secondary)" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Change Password</span>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  value={pwForm.newPw}
                  onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                className="form-input"
                type={showPw ? 'text' : 'password'}
                placeholder="Repeat new password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              />
            </div>
          </div>
          {pwError && (
            <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
              {pwError}
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleChangePassword} disabled={savingPw || !pwForm.newPw}>
            <KeyRound size={13} /> {savingPw ? 'Changing…' : 'Change Password'}
          </button>
        </div>
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
