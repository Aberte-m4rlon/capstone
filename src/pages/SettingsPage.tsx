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
    if (!pwForm.newPw) { setPwError('Kailangan ang bagong password.'); return; }
    if (pwForm.newPw.length < 6) { setPwError('Dapat may hindi bababa sa 6 na karakter ang password.'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Hindi magkatugma ang mga password.'); return; }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
      if (error) throw error;
      toast('Matagumpay na napalitan ang password.', 'success');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Hindi maiproseso ang pagpapalit ng password.');
    } finally {
      setSavingPw(false);
    }
  };

  // ── Upload Profile Photo ─────────────────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast('Dapat mas maliit sa 2 MB ang larawan.', 'danger'); return; }
    if (!file.type.startsWith('image/')) { toast('Pumili lamang ng wastong image file.', 'danger'); return; }

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
      toast('Matagumpay na na-update ang larawan ng profile.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pumalya ang pag-upload.';
      toast(`Pumalya ang pag-upload: ${msg}. Siguraduhing nilikha ang "avatars" storage bucket sa Supabase.`, 'danger');
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
      toast('Matagumpay na na-save ang mga setting.', 'success');
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'May problema sa pag-save ng mga setting.', 'danger');
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
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Mga Setting</h1>
        <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
          Isaayos ang iyong profile at mga kagustuhan sa bukid.
        </p>
      </div>

      {/* ── Profile Section ── */}
      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={16} color="var(--color-primary, #238B45)" />
          Profile ng User
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: avatarUrl ? 'transparent' : 'linear-gradient(135deg, #238B45, #176B35)',
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
                background: 'var(--color-primary, #238B45)', color: '#fff', border: '2px solid var(--color-surface, #fff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 12,
              }}
              title="Mag-upload ng larawan"
            >
              <Camera size={12} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{user?.email}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginTop: 2 }}>Magbubukid · AlpasFarm</div>
            <Button
              variant="secondary"
              size="sm"
              style={{ marginTop: 8 }}
              onClick={() => fileRef.current?.click()}
              loading={uploadingAvatar}
              leftIcon={<Camera size={13} />}
            >
              Palitan ang Larawan
            </Button>
          </div>
        </div>

        {/* Change Password */}
        <div style={{ borderTop: '1px solid var(--border-light, rgba(255,255,255,0.08))', paddingTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <KeyRound size={15} color="var(--color-text-secondary, #475569)" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Palitan ang Password</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <FormField label="Bagong Password">
              <div style={{ position: 'relative' }}>
                <Input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Hindi bababa sa 6 na karakter"
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
            <FormField label="Kumpirmahin ang Bagong Password">
              <Input
                type={showPw ? 'text' : 'password'}
                placeholder="I-type muli ang bagong password"
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
            I-save ang Bagong Password
          </Button>
        </div>
      </Card>

      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Impormasyon ng Bukid</div>
        <FormField label="Pangalan ng Bukid">
          <Input value={form.farm_name} onChange={(e) => setForm({ ...form, farm_name: e.target.value })} />
        </FormField>
      </Card>

      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Mga Parameter ng Health Risk</div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginBottom: 14 }}>
          Ginagamit ang mga limitasyong ito ng AI Health Risk para tukuyin ang antas ng babala.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {numField('Kritikal na Temperatura (°C)', 'temp_critical', 'Lampas dito ay magbibigay ng kritikal na alerto')}
          {numField('Mataas na Heart Rate (BPM)', 'heart_rate_high', 'Lampas dito ay magbibigay ng babala sa bilis ng tibok ng puso')}
        </div>
      </Card>

      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Mga Setting sa Breeding</div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginBottom: 14 }}>
          Ginagamit sa pagtatantya ng panganganak at pagsusuri ng kahandaan sa pagpaparami.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {numField('Araw ng Pagbubuntis (Gestation Days)', 'gestation_days', 'Pamantayan: 150 araw para sa kambing at tupa')}
          {numField('Pinakamababang Edad sa Breeding (buwan)', 'breeding_min_age_months')}
          {numField('Pinakamababang Timbang sa Breeding (kg)', 'breeding_min_weight_kg')}
        </div>
      </Card>

      <Card variant="glass" padding="lg" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Paglaki at Imbentaryo</div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginBottom: 14 }}>
          Ginagamit sa pagtatantya kung kailan maaaring ibenta at sa mga paalala sa stock.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {numField('Target na Timbang (kg)', 'target_weight_kg', 'Para sa pagtatantya kung handa nang ibenta')}
          {numField('Babala sa Paso / Expiry (araw)', 'expiry_warning_days', 'Magpapadala ng paalala kapag nalalapit nang mag-expire')}
          {numField('Iskedyul ng Bakuna (araw)', 'vaccine_due_days', 'Magpapadala ng paalala ilang araw bago ang takdang bakuna')}
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 30 }}>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          I-save ang mga Setting
        </Button>
      </div>
    </div>
  );
}
