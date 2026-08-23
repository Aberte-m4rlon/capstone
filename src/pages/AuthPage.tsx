import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, defaultRouteForRole } from '../lib/auth';
import {
  Eye, EyeOff, User, Lock, ArrowRight, AlertCircle,
  Mail, Building2, MapPin, CheckCircle2, UserPlus, LogIn,
  KeyRound, RefreshCw, Edit2, ShieldCheck,
} from 'lucide-react';

// ─── Password strength ────────────────────────────────────────────────────────
function passwordStrength(pw: string): { score: number; label: string; color: string; checks: Record<string, boolean> } {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const label = score <= 1 ? 'Weak' : score <= 3 ? 'Medium' : score <= 4 ? 'Good' : 'Strong';
  const color = score <= 1 ? '#EF4444' : score <= 3 ? '#F59E0B' : score <= 4 ? '#3B82F6' : '#16A34A';
  return { score, label, color, checks };
}

// ─── Shared input style ───────────────────────────────────────────────────────
function inputStyle(focused?: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '11px 14px 11px 42px',
    background: 'rgba(255, 255, 255, 0.07)',
    border: `1px solid ${focused ? 'rgba(255, 106, 42, 0.60)' : 'rgba(255, 255, 255, 0.18)'}`,
    borderRadius: '12px',
    color: 'var(--text)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxShadow: focused ? '0 0 0 3px rgba(255, 106, 42, 0.18)' : 'none',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
type View = 'signin' | 'signup' | 'verify';

export function AuthPage() {
  const { signIn, signUp, verifyEmailOtp, resendVerificationCode, role } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState('');

  // Verification state
  const [verificationCode, setVerificationCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState(false);

  // Sign-in state
  const [siEmail, setSiEmail] = useState('');
  const [siPassword, setSiPassword] = useState('');
  const [siShowPw, setSiShowPw] = useState(false);

  // Sign-up state
  const [suFullName, setSuFullName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirmPw, setSuConfirmPw] = useState('');
  const [suFarmName, setSuFarmName] = useState('');
  const [suFarmLocation, setSuFarmLocation] = useState('');
  const [suShowPw, setSuShowPw] = useState(false);
  const [suShowConfirmPw, setSuShowConfirmPw] = useState(false);
  const [suTerms, setSuTerms] = useState(false);

  const pwStr = passwordStrength(suPassword);

  // Cooldown countdown timer for resend code
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const switchView = (v: View) => {
    setView(v);
    setError(null);
    setResendSuccess(null);
  };

  // ── Sign In ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const email = siEmail.trim();
    if (!email) { setError('Please enter your email address.'); return; }
    if (!siPassword) { setError('Please enter your password.'); return; }
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, siPassword);
    setLoading(false);
    if (err) {
      if (err.toLowerCase().includes('verify your email')) {
        setConfirmedEmail(email);
        setView('verify');
        setError('Please enter the verification code sent to your email.');
        return;
      }
      setError(err);
      return;
    }
    navigate(defaultRouteForRole(role), { replace: true });
  };

  // ── Sign Up ────────────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setResendSuccess(null);

    // Client-side validation
    if (!suFullName.trim()) { setError('Full name is required.'); return; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(suEmail.trim())) { setError('Please enter a valid email address.'); return; }
    if (!pwStr.checks.length) { setError('Password must be at least 8 characters.'); return; }
    if (suPassword !== suConfirmPw) { setError('Passwords do not match.'); return; }
    if (!suFarmName.trim()) { setError('Farm name is required.'); return; }
    if (!suTerms) { setError('You must agree to the Terms and Privacy Policy to create an account.'); return; }

    setLoading(true);
    const { error: err, needsConfirmation } = await signUp({
      email: suEmail.trim(),
      password: suPassword,
      fullName: suFullName.trim(),
      farmName: suFarmName.trim(),
      farmLocation: suFarmLocation.trim(),
    });
    setLoading(false);

    if (err) { setError(err); return; }

    if (needsConfirmation) {
      setConfirmedEmail(suEmail.trim());
      setView('verify');
      setResendCooldown(60);
      setVerificationCode('');
    } else {
      // Email confirmation is disabled in Supabase — immediately signed in
      navigate(defaultRouteForRole(role), { replace: true });
    }
  };

  // ── Verify Code ────────────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || verifySuccess) return;
    const code = verificationCode.trim();
    if (!code) {
      setError('Please enter the verification code.');
      return;
    }
    setError(null);
    setResendSuccess(null);
    setLoading(true);

    const { error: err } = await verifyEmailOtp(confirmedEmail, code, {
      fullName: suFullName.trim(),
      farmName: suFarmName.trim(),
    });
    setLoading(false);

    if (err) {
      setError(err);
      return;
    }

    setVerifySuccess(true);
    setTimeout(() => {
      navigate(defaultRouteForRole(role || 'farm_manager'), { replace: true });
    }, 1100);
  };

  // ── Resend Code ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setResendSuccess(null);
    setLoading(true);
    const { error: err } = await resendVerificationCode(confirmedEmail);
    setLoading(false);

    if (err) {
      setError(err);
      return;
    }

    setResendSuccess('A fresh 6-digit verification code has been sent to your email.');
    setResendCooldown(60);
  };

  // ── Shared background ──────────────────────────────────────────────────────
  const bg = (
    <>
      <div style={{ position: 'fixed', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,59,48,0.16) 0%, transparent 70%)', top: '-80px', right: '-60px', zIndex: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,106,42,0.14) 0%, transparent 70%)', bottom: '-60px', left: '-40px', zIndex: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,159,10,0.10) 0%, transparent 70%)', top: '40%', left: '10%', zIndex: 0, pointerEvents: 'none' }} />
    </>
  );

  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%)',
    backdropFilter: 'blur(40px) saturate(200%)',
    WebkitBackdropFilter: 'blur(40px) saturate(200%)',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: '28px',
    boxShadow: '0 30px 80px rgba(0,0,0,0.45), inset 0 1.5px 1px rgba(255,255,255,0.40), 0 0 40px rgba(255,106,42,0.10)',
    width: '100%',
    maxWidth: view === 'signup' ? '520px' : '440px',
    padding: 'clamp(24px, 5vw, 40px)',
    position: 'relative',
    zIndex: 1,
    boxSizing: 'border-box',
  };

  // ── Verification / Confirmed screen ────────────────────────────────────────
  if (view === 'verify') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '20px', position: 'relative' }}>
        {bg}
        <div style={cardStyle}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '28px', background: 'linear-gradient(135deg, rgba(255,255,255,0.22), transparent 30%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: verifySuccess ? 'linear-gradient(135deg,#16A34A,#22C55E)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 18,
              boxShadow: verifySuccess ? '0 14px 36px rgba(22,163,74,0.35)' : '0 14px 36px rgba(255,59,48,0.35)',
              transition: 'all 0.3s ease',
            }}>
              {verifySuccess ? <CheckCircle2 size={36} color="#fff" /> : <ShieldCheck size={36} color="#fff" />}
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.5px' }}>
              {verifySuccess ? 'Account Verified!' : 'Enter Verification Code'}
            </h2>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
              We sent a 6-digit authentication verification code to:
            </p>

            {/* Email pill with edit option */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 999,
              background: 'rgba(255,106,42,0.12)', border: '1px solid rgba(255,106,42,0.30)',
              marginBottom: 20, maxWidth: '100%',
            }}>
              <Mail size={13} color="#FF7A18" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#FF7A18', wordBreak: 'break-all' }}>
                {confirmedEmail || 'your email'}
              </span>
              <button
                type="button"
                onClick={() => switchView('signup')}
                title="Change email"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 2 }}
              >
                <Edit2 size={12} />
              </button>
            </div>

            {/* Success message */}
            {resendSuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16, borderRadius: 12, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.30)', color: '#22C55E', fontSize: 13, fontWeight: 600, textAlign: 'left' }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <span>{resendSuccess}</span>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', marginBottom: 16, borderRadius: 12, background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.28)', color: '#FF3B30', fontSize: 13, fontWeight: 600, textAlign: 'left', lineHeight: 1.4 }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Verification Form */}
            <form onSubmit={handleVerifyOtp} noValidate>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  6-Digit Verification Code
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    autoFocus
                    value={verificationCode}
                    onChange={(e) => {
                      setVerificationCode(e.target.value.replace(/[^0-9a-zA-Z]/g, ''));
                      setError(null);
                    }}
                    placeholder="123456"
                    disabled={loading || verifySuccess}
                    style={{
                      ...inputStyle(),
                      padding: '13px 14px 13px 44px',
                      fontSize: '20px',
                      fontWeight: 800,
                      letterSpacing: '6px',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(255,106,42,0.70)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,106,42,0.20)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || verifySuccess || !verificationCode.trim()}
                style={{
                  width: '100%', padding: '13px',
                  background: verifySuccess
                    ? 'linear-gradient(135deg,#16A34A,#22C55E)'
                    : loading || !verificationCode.trim()
                      ? 'rgba(255,106,42,0.5)'
                      : 'linear-gradient(135deg,#FF3B30,#FF7A18)',
                  border: '1px solid rgba(255,255,255,0.20)', borderRadius: 12,
                  color: '#fff', fontSize: 15, fontWeight: 800,
                  boxShadow: loading ? 'none' : 'inset 0 1.5px 1px rgba(255,255,255,0.25), 0 10px 28px rgba(255,59,48,0.38)',
                  cursor: (loading || !verificationCode.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxSizing: 'border-box',
                  transition: 'all 0.2s ease',
                }}
              >
                {loading ? (
                  <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />Verifying code…</>
                ) : verifySuccess ? (
                  <><CheckCircle2 size={18} /> Verified! Loading…</>
                ) : (
                  <>Verify &amp; Activate Account <ArrowRight size={17} /></>
                )}
              </button>
            </form>

            {/* Resend button */}
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
                style={{
                  background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'default' : 'pointer',
                  color: resendCooldown > 0 ? 'var(--text-secondary)' : '#FF7A18',
                  fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6,
                  opacity: resendCooldown > 0 ? 0.65 : 1,
                  padding: '4px 8px', borderRadius: 8,
                }}
              >
                <RefreshCw size={13} className={loading ? 'spin' : ''} />
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Verification Code'}
              </button>

              <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                <button
                  type="button"
                  onClick={() => switchView('signin')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600, padding: 0, textDecoration: 'underline' }}
                >
                  Back to Sign In
                </button>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
                <button
                  type="button"
                  onClick={() => switchView('signup')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600, padding: 0, textDecoration: 'underline' }}
                >
                  Edit Registration
                </button>
              </div>
            </div>
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 0.8s linear infinite;}`}</style>
      </div>
    );
  }

  const logoBlock = (
    <div style={{ textAlign: 'center', marginBottom: view === 'signup' ? 24 : 32 }}>
      <div style={{ width: 64, height: 64, borderRadius: '20px', background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 900, marginBottom: 14, boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.40), 0 14px 36px rgba(255,59,48,0.40)', border: '1px solid rgba(255,255,255,0.25)' }}>A</div>
      <h1 style={{ fontSize: 'clamp(20px,4vw,26px)', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px', margin: '0 0 5px', lineHeight: 1.2 }}>AlpasFarm</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Smart Goat &amp; Sheep Farm Management</p>
    </div>
  );

  const tabBar = (
    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 3, marginBottom: 24, gap: 4 }}>
      {([['signin', <LogIn size={14} />, 'Sign In'] as const, ['signup', <UserPlus size={14} />, 'Create Account'] as const]).map(([v, icon, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => switchView(v as View)}
          style={{
            flex: 1, padding: '9px 8px', borderRadius: 9, fontSize: 13, fontWeight: 700,
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.2s',
            background: view === v ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'transparent',
            color: view === v ? '#fff' : 'var(--text-secondary)',
            boxShadow: view === v ? '0 4px 12px rgba(255,59,48,0.30)' : 'none',
          }}
        >
          {icon}{label}
        </button>
      ))}
    </div>
  );

  // ── Field helper ───────────────────────────────────────────────────────────
  const Field = ({ label, icon: Icon, children }: { label: string; icon: React.ComponentType<any>; children: React.ReactNode }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <Icon size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
        {children}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '20px', overflowX: 'hidden', position: 'relative' }}>
      {bg}
      <div style={cardStyle}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '28px', background: 'linear-gradient(135deg, rgba(255,255,255,0.22), transparent 30%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          {logoBlock}
          {tabBar}

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', marginBottom: 18, borderRadius: 12, background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.28)', color: '#FF3B30', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ── SIGN IN ── */}
          {view === 'signin' && (
            <form onSubmit={handleSignIn} noValidate>
              <Field label="Email Address" icon={Mail}>
                <input type="email" value={siEmail} onChange={(e) => { setSiEmail(e.target.value); setError(null); }}
                  placeholder="you@example.com" autoComplete="username" autoFocus disabled={loading}
                  style={inputStyle()}
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(255,106,42,0.60)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,106,42,0.18)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none'; }}
                />
              </Field>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                  <input type={siShowPw ? 'text' : 'password'} value={siPassword}
                    onChange={(e) => { setSiPassword(e.target.value); setError(null); }}
                    placeholder="Enter your password" autoComplete="current-password" disabled={loading}
                    style={{ ...inputStyle(), padding: '11px 42px 11px 42px' }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(255,106,42,0.60)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,106,42,0.18)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button type="button" onClick={() => setSiShowPw(v => !v)} disabled={loading}
                    style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 4, borderRadius: 6 }}>
                    {siShowPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', background: loading ? 'rgba(255,106,42,0.5)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 800, boxShadow: loading ? 'none' : 'inset 0 1.5px 1px rgba(255,255,255,0.25), 0 10px 28px rgba(255,59,48,0.38)', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box' }}>
                {loading ? <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />Signing in…</> : <>Sign In <ArrowRight size={17} /></>}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, fontSize: 13 }}>
                <button
                  type="button"
                  onClick={() => {
                    if (siEmail.trim()) setConfirmedEmail(siEmail.trim());
                    switchView('verify');
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF7A18', fontSize: 13, fontWeight: 700, padding: 0 }}
                >
                  Enter Verification Code
                </button>
                <button type="button" onClick={() => alert('Please contact your administrator or use the Supabase email reset link.')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>
                  Forgot Password?
                </button>
              </div>
            </form>
          )}

          {/* ── SIGN UP ── */}
          {view === 'signup' && (
            <form onSubmit={handleSignUp} noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>

                <Field label="Full Name *" icon={User}>
                  <input type="text" value={suFullName} onChange={(e) => { setSuFullName(e.target.value); setError(null); }}
                    placeholder="Juan dela Cruz" autoComplete="name" autoFocus disabled={loading} style={inputStyle()}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(255,106,42,0.60)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,106,42,0.18)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none'; }}
                  />
                </Field>

                <Field label="Email Address *" icon={Mail}>
                  <input type="email" value={suEmail} onChange={(e) => { setSuEmail(e.target.value); setError(null); }}
                    placeholder="you@example.com" autoComplete="email" disabled={loading} style={inputStyle()}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(255,106,42,0.60)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,106,42,0.18)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none'; }}
                  />
                </Field>

                {/* Password with strength */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Password *</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                    <input type={suShowPw ? 'text' : 'password'} value={suPassword}
                      onChange={(e) => { setSuPassword(e.target.value); setError(null); }}
                      placeholder="Min 8 characters" autoComplete="new-password" disabled={loading}
                      style={{ ...inputStyle(), padding: '11px 42px 11px 42px' }}
                      onFocus={(e) => { e.target.style.borderColor = 'rgba(255,106,42,0.60)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,106,42,0.18)'; }}
                      onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none'; }}
                    />
                    <button type="button" onClick={() => setSuShowPw(v => !v)} style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 4 }}>
                      {suShowPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {suPassword && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                        {[1,2,3,4,5].map(i => (
                          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= pwStr.score ? pwStr.color : 'rgba(255,255,255,0.12)', transition: 'background 0.2s' }} />
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span>Strength: <strong style={{ color: pwStr.color }}>{pwStr.label}</strong></span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[['8+ chars', pwStr.checks.length], ['Upper', pwStr.checks.upper], ['Number', pwStr.checks.number]].map(([l, ok]) => (
                            <span key={l as string} style={{ color: ok ? '#16A34A' : 'var(--text-secondary)' }}>{ok ? '✓' : '○'} {l}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Confirm Password *</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                    <input type={suShowConfirmPw ? 'text' : 'password'} value={suConfirmPw}
                      onChange={(e) => { setSuConfirmPw(e.target.value); setError(null); }}
                      placeholder="Re-enter password" autoComplete="new-password" disabled={loading}
                      style={{ ...inputStyle(), padding: '11px 42px 11px 42px', borderColor: suConfirmPw && suPassword !== suConfirmPw ? 'rgba(239,68,68,0.60)' : undefined }}
                      onFocus={(e) => { e.target.style.borderColor = 'rgba(255,106,42,0.60)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,106,42,0.18)'; }}
                      onBlur={(e) => { e.target.style.borderColor = suConfirmPw && suPassword !== suConfirmPw ? 'rgba(239,68,68,0.60)' : 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none'; }}
                    />
                    <button type="button" onClick={() => setSuShowConfirmPw(v => !v)} style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 4 }}>
                      {suShowConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {suConfirmPw && suPassword !== suConfirmPw && (
                    <p style={{ fontSize: 11, color: '#EF4444', marginTop: 5 }}>Passwords do not match.</p>
                  )}
                </div>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Farm Details</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
                </div>

                <Field label="Farm Name *" icon={Building2}>
                  <input type="text" value={suFarmName} onChange={(e) => { setSuFarmName(e.target.value); setError(null); }}
                    placeholder="e.g. Aberte Family Farm" disabled={loading} style={inputStyle()}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(255,106,42,0.60)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,106,42,0.18)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none'; }}
                  />
                </Field>

                <Field label="Farm Location" icon={MapPin}>
                  <input type="text" value={suFarmLocation} onChange={(e) => setSuFarmLocation(e.target.value)}
                    placeholder="e.g. Cavite, Philippines" disabled={loading} style={inputStyle()}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(255,106,42,0.60)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,106,42,0.18)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.18)'; e.target.style.boxShadow = 'none'; }}
                  />
                </Field>

                {/* Terms */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => setSuTerms(v => !v)}
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                      background: suTerms ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'rgba(255,255,255,0.07)',
                      border: `1px solid ${suTerms ? 'rgba(255,122,24,0.70)' : 'rgba(255,255,255,0.25)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    {suTerms && <CheckCircle2 size={12} color="#fff" />}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    I agree to the AlpasFarm{' '}
                    <span style={{ color: '#FF7A18', fontWeight: 600 }}>Terms of Service</span>
                    {' '}and{' '}
                    <span style={{ color: '#FF7A18', fontWeight: 600 }}>Privacy Policy</span>
                  </span>
                </label>

                {/* Role note — transparency */}
                <div style={{ padding: '10px 13px', borderRadius: 10, background: 'rgba(255,122,24,0.08)', border: '1px solid rgba(255,122,24,0.20)', marginBottom: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  🌾 New accounts receive <strong style={{ color: '#FF7A18' }}>Farm Manager</strong> access by default. Contact a system administrator for elevated permissions.
                </div>

                <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', background: loading ? 'rgba(255,106,42,0.5)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 800, boxShadow: loading ? 'none' : 'inset 0 1.5px 1px rgba(255,255,255,0.25), 0 10px 28px rgba(255,59,48,0.38)', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box' }}>
                  {loading ? <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />Creating account…</> : <><UserPlus size={16} /> Create Account</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 0.8s linear infinite;}`}</style>
    </div>
  );
}
