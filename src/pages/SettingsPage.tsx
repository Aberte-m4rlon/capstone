import { useState, useEffect, useRef } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { Camera, KeyRound, Eye, EyeOff, User } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, FormField } from '../components/ui/Input';

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
    if (file.size > 2 * 1024 * 1024) { toast('Image must be under 2 MB.', 'danger'); return; }
    if (!file.type.startsWith('image/')) { toast('Please select an image file.', 'danger'); return; }

    setUploadingAvatar(true);
    try {
      // Upload to Supabase Storage (requires "avatars" bucket to be created)
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Get permanent public URL
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = data.publicUrl + `?t=${Date.now()}`;

      // Save to user metadata so it persists across sessions
      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
      if (updateError) throw updateError;

      setAvatarUrl(url);
      toast('Profile photo updated successfully.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      toast(`Upload failed: ${msg}. Make sure the "avatars" storage bucket is created in Supabase.`, 'danger');
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = '';
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
      toast(err instanceof Error ? err.message : 'Unable to save settings.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const numField = (label: string, key: keyof typeof form, hint?: string) => (
    <FormField label={label} hint={hint}>
      <Input
        type="number"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      />
    </FormField>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Settings</h1>
        <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
          Configure your profile and farm preferences.
        </p>
      </div>

      {/* ── Profile Section ── */}
      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={16} color="var(--color-brand-primary, #FF7A18)" />
          Profile
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: avatarUrl ? 'transparent' : 'linear-gradient(135deg, #FF7A18, #FF4B26)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: '#fff',
              overflow: 'hidden', flexShrink: 0,
              border: '3px solid var(--border-light, rgba(255,255,255,0.15))',
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
                background: 'var(--color-brand-primary, #FF7A18)', color: '#fff', border: '2px solid var(--color-surface, #fff)',
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
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginTop: 2 }}>Farmer · AlpasFarm</div>
            <Button
              variant="secondary"
              size="sm"
              style={{ marginTop: 8 }}
              onClick={() => fileRef.current?.click()}
              loading={uploadingAvatar}
              leftIcon={<Camera size={13} />}
            >
              Change Photo
            </Button>
          </div>
        </div>

        {/* Change Password */}
        <div style={{ borderTop: '1px solid var(--border-light, rgba(255,255,255,0.08))', paddingTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <KeyRound size={15} color="var(--color-text-secondary, #475569)" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Change Password</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <FormField label="New Password">
              <div style={{ position: 'relative' }}>
                <Input
                  type={showPw ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  value={pwForm.newPw}
                  onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary, #475569)' }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </FormField>
            <FormField label="Confirm New Password">
              <Input
                type={showPw ? 'text' : 'password'}
                placeholder="Repeat new password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              />
            </FormField>
          </div>
          {pwError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.10)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12, marginTop: 8 }}>
              {pwError}
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleChangePassword}
            loading={savingPw}
            disabled={savingPw || !pwForm.newPw}
            leftIcon={<KeyRound size={13} />}
            style={{ marginTop: 10 }}
          >
            Change Password
          </Button>
        </div>
      </Card>

      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Farm Information</div>
        <FormField label="Farm Name">
          <Input value={form.farm_name} onChange={(e) => setForm({ ...form, farm_name: e.target.value })} />
        </FormField>
      </Card>

      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Health Risk Thresholds</div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginBottom: 14 }}>
          These thresholds are used by the Smart Health Risk Prediction to determine alert levels.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {numField('Critical Temperature (°C)', 'temp_critical', 'Above this triggers a critical alert')}
          {numField('High Heart Rate (BPM)', 'heart_rate_high', 'Above this triggers a heart rate warning')}
        </div>
      </Card>

      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Breeding Settings</div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginBottom: 14 }}>
          Used for kidding date calculation and breeding readiness assessment.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {numField('Gestation Days', 'gestation_days', 'Default: 150 days for goats')}
          {numField('Min Breeding Age (months)', 'breeding_min_age_months')}
          {numField('Min Breeding Weight (kg)', 'breeding_min_weight_kg')}
        </div>
      </Card>

      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Growth & Inventory</div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginBottom: 14 }}>
          Used for market-ready predictions and inventory alerts.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {numField('Target Weight (kg)', 'target_weight_kg', 'For market-ready date estimation')}
          {numField('Expiry Warning (days)', 'expiry_warning_days', 'Items expiring within this many days alert')}
          {numField('Vaccine Due (days)', 'vaccine_due_days', 'Vaccinations due within this many days alert')}
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 30 }}>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}
