import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, defaultRouteForRole } from '../lib/auth';
import { formatPhoneNumber } from '../lib/sms';
import {
  Eye, EyeOff, User, Lock, ArrowRight, AlertCircle,
  Mail, Building2, MapPin, CheckCircle2, UserPlus, LogIn,
  KeyRound, RefreshCw, Edit2, ShieldCheck, Smartphone,
  Phone, Sparkles, Sprout, Info
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
  const color = score <= 1 ? '#EF4444' : score <= 3 ? '#F59E0B' : score <= 4 ? '#43A047' : '#2E7D32';
  return { score, label, color, checks };
}

// ─── Shared input style ───────────────────────────────────────────────────────
function inputStyle(focused?: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '12px 14px 12px 42px',
    background: 'var(--card-bg, #FFFFFF)',
    border: `1.5px solid ${focused ? '#43A047' : '#DDE7DF'}`,
    borderRadius: '14px',
    color: 'var(--text, #1F2933)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s, box-shadow 0.2s, background-color 0.2s',
    boxShadow: focused ? '0 0 0 4px rgba(67, 160, 71, 0.14)' : 'none',
  };
}

// ─── Field helper — defined OUTSIDE AuthPage to prevent remount on every render ──
function Field({
  label,
  icon: Icon,
  children,
  badge,
}: {
  label: string;
  icon: React.ComponentType<any>;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text, #1F2933)',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
        }}>
          {label}
        </label>
        {badge}
      </div>
      <div style={{ position: 'relative' }}>
        <Icon
          size={16}
          style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-secondary, #667085)',
            pointerEvents: 'none',
          }}
        />
        {children}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
type View = 'signin' | 'signup' | 'verify';
type AuthMethod = 'phone' | 'email';

export function AuthPage() {
  const {
    signIn,
    signUp,
    verifyEmailOtp,
    resendVerificationCode,
    signInWithPhoneOtp,
    signUpWithPhoneOtp,
    verifyPhoneOtp,
    resendPhoneOtp,
    role,
  } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('signin');
  const [method, setMethod] = useState<AuthMethod>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetDestination, setTargetDestination] = useState('');
  const [activeVerifyType, setActiveVerifyType] = useState<'phone' | 'email'>('phone');

  // Verification state
  const [verificationCode, setVerificationCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState(false);

  // Phone state
  const [phoneInput, setPhoneInput] = useState('');

  // Sign-in Email state
  const [siEmail, setSiEmail] = useState('');
  const [siPassword, setSiPassword] = useState('');
  const [siShowPw, setSiShowPw] = useState(false);

  // Sign-up state
  const [suFullName, setSuFullName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPhone, setSuPhone] = useState('');
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

  // ── Phone Sign In ───────────────────────────────────────────────────────────
  const handlePhoneSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const formatted = formatPhoneNumber(phoneInput);
    if (!formatted.valid) {
      setError('Please enter a valid Philippine mobile number (e.g., 0917 123 4567).');
      return;
    }

    setError(null);
    setLoading(true);
    const res = await signInWithPhoneOtp(formatted.e164);
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setTargetDestination(formatted.display);
    setActiveVerifyType('phone');
    setView('verify');
    setResendCooldown(60);
    setVerificationCode('');
    setResendSuccess(res.message || 'SMS verification code dispatched.');
  };

  // ── Email Sign In ───────────────────────────────────────────────────────────
  const handleEmailSignIn = async (e: React.FormEvent) => {
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
        setTargetDestination(email);
        setActiveVerifyType('email');
        setView('verify');
        setError('Please enter the verification code sent to your email.');
        return;
      }
      setError(err);
      return;
    }
    navigate(defaultRouteForRole(role), { replace: true });
  };

  // ── Phone Sign Up ───────────────────────────────────────────────────────────
  const handlePhoneSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setResendSuccess(null);

    const formatted = formatPhoneNumber(suPhone);
    if (!suFullName.trim()) { setError('Full name is required.'); return; }
    if (!formatted.valid) { setError('Please enter a valid Philippine mobile number (e.g. 0917 123 4567).'); return; }
    if (!suFarmName.trim()) { setError('Farm name is required.'); return; }
    if (!suTerms) { setError('You must agree to the Terms and Privacy Policy to continue.'); return; }

    setLoading(true);
    const res = await signUpWithPhoneOtp({
      phone: formatted.e164,
      fullName: suFullName.trim(),
      farmName: suFarmName.trim(),
      farmLocation: suFarmLocation.trim(),
    });
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setTargetDestination(formatted.display);
    setActiveVerifyType('phone');
    setView('verify');
    setResendCooldown(60);
    setVerificationCode('');
    setResendSuccess(res.message || 'SMS verification code dispatched.');
  };

  // ── Email Sign Up ───────────────────────────────────────────────────────────
  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setResendSuccess(null);

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
      setTargetDestination(suEmail.trim());
      setActiveVerifyType('email');
      setView('verify');
      setResendCooldown(60);
      setVerificationCode('');
    } else {
      navigate(defaultRouteForRole(role), { replace: true });
    }
  };

  // ── Verify OTP Code (SMS or Email) ──────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || verifySuccess) return;
    const code = verificationCode.trim();
    if (!code) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setError(null);
    setResendSuccess(null);
    setLoading(true);

    if (activeVerifyType === 'phone') {
      const { error: err } = await verifyPhoneOtp(targetDestination, code, {
        fullName: suFullName.trim(),
        farmName: suFarmName.trim(),
        farmLocation: suFarmLocation.trim(),
      });
      setLoading(false);

      if (err) {
        setError(err);
        return;
      }
    } else {
      const { error: err } = await verifyEmailOtp(targetDestination, code, {
        fullName: suFullName.trim(),
        farmName: suFarmName.trim(),
      });
      setLoading(false);

      if (err) {
        setError(err);
        return;
      }
    }

    setVerifySuccess(true);
    setTimeout(() => {
      navigate(defaultRouteForRole(role || 'farm_manager'), { replace: true });
    }, 1000);
  };

  // ── Resend Code ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setResendSuccess(null);
    setLoading(true);

    if (activeVerifyType === 'phone') {
      const { error: err, message } = await resendPhoneOtp(targetDestination);
      setLoading(false);
      if (err) {
        setError(err);
        return;
      }
      setResendSuccess(message || 'A fresh 6-digit SMS verification code has been dispatched.');
    } else {
      const { error: err } = await resendVerificationCode(targetDestination);
      setLoading(false);
      if (err) {
        setError(err);
        return;
      }
      setResendSuccess('A fresh 6-digit verification code has been sent to your email.');
    }

    setResendCooldown(60);
  };

  // ── Nature Themed Background ───────────────────────────────────────────────
  const bg = (
    <>
      <div
        style={{
          position: 'fixed',
          width: '520px',
          height: '520px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(67, 160, 71, 0.14) 0%, transparent 70%)',
          top: '-100px',
          right: '-80px',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'fixed',
          width: '460px',
          height: '460px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(129, 199, 132, 0.12) 0%, transparent 70%)',
          bottom: '-80px',
          left: '-60px',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'fixed',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(46, 125, 50, 0.08) 0%, transparent 70%)',
          top: '40%',
          left: '15%',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
    </>
  );

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.94)',
    backdropFilter: 'blur(30px) saturate(180%)',
    WebkitBackdropFilter: 'blur(30px) saturate(180%)',
    border: '1px solid #E5EDE6',
    borderRadius: '24px',
    boxShadow: '0 20px 60px rgba(25, 70, 35, 0.08), 0 1px 3px rgba(0, 0, 0, 0.02)',
    width: '100%',
    maxWidth: view === 'signup' ? '540px' : '460px',
    padding: 'clamp(24px, 5vw, 38px)',
    position: 'relative',
    zIndex: 1,
    boxSizing: 'border-box',
    transition: 'max-width 0.3s ease',
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ── VERIFICATION / OTP SCREEN ───────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'verify') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #F5F8F5)', padding: '20px', position: 'relative' }}>
        {bg}
        <div style={cardStyle}>
          <div style={{ position: 'relative', textAlign: 'center' }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '24px',
              background: verifySuccess
                ? 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)'
                : 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
              boxShadow: verifySuccess
                ? '0 12px 30px rgba(46, 125, 50, 0.30)'
                : '0 8px 24px rgba(67, 160, 71, 0.12)',
              transition: 'all 0.3s ease',
            }}>
              {verifySuccess ? (
                <CheckCircle2 size={36} color="#FFFFFF" />
              ) : activeVerifyType === 'phone' ? (
                <Smartphone size={36} color="#2E7D32" />
              ) : (
                <ShieldCheck size={36} color="#2E7D32" />
              )}
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text, #1F2933)', marginBottom: 8, letterSpacing: '-0.5px' }}>
              {verifySuccess ? 'Authentication Verified!' : 'Enter 6-Digit Code'}
            </h2>

            <p style={{ fontSize: 13, color: 'var(--text-secondary, #667085)', lineHeight: 1.5, marginBottom: 12 }}>
              {activeVerifyType === 'phone'
                ? 'We sent a real 6-digit SMS verification code to your mobile number:'
                : 'We sent a 6-digit authentication verification code to:'}
            </p>

            {/* Destination Pill with Edit Action */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 16px',
              borderRadius: 999,
              background: '#E8F5E9',
              border: '1px solid #C8E6C9',
              marginBottom: 20,
              maxWidth: '100%',
            }}>
              {activeVerifyType === 'phone' ? (
                <Phone size={14} color="#2E7D32" />
              ) : (
                <Mail size={14} color="#2E7D32" />
              )}
              <span style={{ fontSize: 13, fontWeight: 700, color: '#2E7D32', wordBreak: 'break-all' }}>
                {targetDestination || 'your number'}
              </span>
              <button
                type="button"
                onClick={() => switchView(view === 'verify' ? 'signin' : 'signup')}
                title="Change number"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#43A047', display: 'flex', padding: 2 }}
              >
                <Edit2 size={13} />
              </button>
            </div>

            {/* Success message */}
            {resendSuccess && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 14px',
                marginBottom: 16,
                borderRadius: 12,
                background: '#E8F5E9',
                border: '1px solid #A5D6A7',
                color: '#2E7D32',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'left',
              }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span>{resendSuccess}</span>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '11px 14px',
                marginBottom: 16,
                borderRadius: 12,
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#DC2626',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'left',
                lineHeight: 1.4,
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Verification Form */}
            <form onSubmit={handleVerifyOtp} noValidate>
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text, #1F2933)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  6-Digit Verification Code
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound
                    size={18}
                    style={{
                      position: 'absolute',
                      left: 16,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-secondary, #667085)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    value={verificationCode}
                    onChange={(e) => {
                      setVerificationCode(e.target.value.replace(/[^0-9]/g, ''));
                      setError(null);
                    }}
                    placeholder="------"
                    disabled={loading || verifySuccess}
                    style={{
                      ...inputStyle(),
                      padding: '14px 14px 14px 44px',
                      fontSize: '22px',
                      fontWeight: 800,
                      letterSpacing: '8px',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#43A047';
                      e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.16)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#DDE7DF';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || verifySuccess || !verificationCode.trim()}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: verifySuccess
                    ? 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)'
                    : loading || !verificationCode.trim()
                      ? 'rgba(67, 160, 71, 0.45)'
                      : 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)',
                  border: 'none',
                  borderRadius: '14px',
                  color: '#FFFFFF',
                  fontSize: 15,
                  fontWeight: 800,
                  boxShadow: (loading || !verificationCode.trim())
                    ? 'none'
                    : '0 8px 24px rgba(46, 125, 50, 0.28)',
                  cursor: (loading || !verificationCode.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxSizing: 'border-box',
                  transition: 'all 0.2s ease',
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.35)',
                      borderTopColor: '#FFFFFF',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    Verifying code…
                  </>
                ) : verifySuccess ? (
                  <>
                    <CheckCircle2 size={18} /> Verified! Entering AlpasFarm…
                  </>
                ) : (
                  <>
                    Verify &amp; Continue <ArrowRight size={17} />
                  </>
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
                  background: 'none',
                  border: 'none',
                  cursor: resendCooldown > 0 ? 'default' : 'pointer',
                  color: resendCooldown > 0 ? 'var(--text-secondary, #667085)' : '#2E7D32',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: resendCooldown > 0 ? 0.65 : 1,
                  padding: '4px 8px',
                  borderRadius: 8,
                }}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                {resendCooldown > 0 ? `Resend SMS in ${resendCooldown}s` : 'Resend Verification Code'}
              </button>

              <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                <button
                  type="button"
                  onClick={() => switchView('signin')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary, #667085)',
                    fontWeight: 600,
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  Back to Sign In
                </button>
                <span style={{ color: '#DDE7DF' }}>•</span>
                <button
                  type="button"
                  onClick={() => switchView('signup')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary, #667085)',
                    fontWeight: 600,
                    padding: 0,
                    textDecoration: 'underline',
                  }}
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

  // ── Header Logo Block ───────────────────────────────────────────────────────
  const logoBlock = (
    <div style={{ textAlign: 'center', marginBottom: view === 'signup' ? 20 : 28 }}>
      <div style={{
        width: 62,
        height: 62,
        borderRadius: '20px',
        background: 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)',
        color: '#FFFFFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        boxShadow: '0 12px 28px rgba(46, 125, 50, 0.24)',
      }}>
        <Sprout size={32} color="#FFFFFF" strokeWidth={2.5} />
      </div>
      <h1 style={{
        fontSize: 'clamp(22px, 4vw, 26px)',
        fontWeight: 900,
        color: 'var(--text, #1F2933)',
        letterSpacing: '-0.5px',
        margin: '0 0 4px',
        lineHeight: 1.2,
      }}>
        ALPAS<span style={{ color: '#43A047' }}>FARM</span>
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary, #667085)', margin: 0, fontWeight: 500 }}>
        Smart Goat &amp; Sheep Farm Management
      </p>
    </div>
  );

  // ── Main View Switcher (Sign In vs Sign Up) ──────────────────────────────────
  const tabBar = (
    <div style={{
      display: 'flex',
      background: '#EEF5EF',
      borderRadius: '14px',
      padding: 4,
      marginBottom: 20,
      gap: 4,
    }}>
      {([['signin', <LogIn size={15} />, 'Sign In'] as const, ['signup', <UserPlus size={15} />, 'Create Account'] as const]).map(([v, icon, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => switchView(v as View)}
          style={{
            flex: 1,
            padding: '10px 8px',
            borderRadius: '10px',
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.2s',
            background: view === v ? '#FFFFFF' : 'transparent',
            color: view === v ? '#2E7D32' : 'var(--text-secondary, #667085)',
            boxShadow: view === v ? '0 3px 10px rgba(0, 0, 0, 0.05)' : 'none',
          }}
        >
          {icon}{label}
        </button>
      ))}
    </div>
  );

  // ── Method Toggle (Phone vs Email) ──────────────────────────────────────────
  const methodSwitcher = (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 20,
    }}>
      <button
        type="button"
        onClick={() => { setMethod('phone'); setError(null); }}
        style={{
          flex: 1,
          padding: '8px 12px',
          borderRadius: '10px',
          fontSize: 12,
          fontWeight: 700,
          border: `1.5px solid ${method === 'phone' ? '#43A047' : '#DDE7DF'}`,
          background: method === 'phone' ? '#E8F5E9' : '#FFFFFF',
          color: method === 'phone' ? '#2E7D32' : 'var(--text-secondary, #667085)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'all 0.15s ease',
        }}
      >
        <Smartphone size={14} color={method === 'phone' ? '#2E7D32' : '#667085'} />
        Mobile SMS OTP
      </button>

      <button
        type="button"
        onClick={() => { setMethod('email'); setError(null); }}
        style={{
          flex: 1,
          padding: '8px 12px',
          borderRadius: '10px',
          fontSize: 12,
          fontWeight: 700,
          border: `1.5px solid ${method === 'email' ? '#43A047' : '#DDE7DF'}`,
          background: method === 'email' ? '#E8F5E9' : '#FFFFFF',
          color: method === 'email' ? '#2E7D32' : 'var(--text-secondary, #667085)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'all 0.15s ease',
        }}
      >
        <Mail size={14} color={method === 'email' ? '#2E7D32' : '#667085'} />
        Email &amp; Password
      </button>
    </div>
  );

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg, #F5F8F5)',
      padding: '20px',
      overflowX: 'hidden',
      position: 'relative',
    }}>
      {bg}
      <div style={cardStyle}>
        <div style={{ position: 'relative' }}>
          {logoBlock}
          {tabBar}
          {methodSwitcher}

          {/* Error Banner */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '11px 14px',
              marginBottom: 18,
              borderRadius: '12px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#DC2626',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.4,
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── SIGN IN VIEW ────────────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {view === 'signin' && (
            <>
              {method === 'phone' ? (
                /* Phone Sign In */
                <form onSubmit={handlePhoneSignIn} noValidate>
                  <Field
                    label="Philippine Mobile Number"
                    icon={Phone}
                    badge={
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D32', background: '#E8F5E9', padding: '2px 8px', borderRadius: 999 }}>
                        +63 (PH)
                      </span>
                    }
                  >
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => {
                        setPhoneInput(e.target.value);
                        setError(null);
                      }}
                      placeholder="0917 123 4567"
                      autoComplete="tel"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#F7FAF7',
                    border: '1px solid #E5EDE6',
                    marginBottom: 20,
                    fontSize: 12,
                    color: 'var(--text-secondary, #667085)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    <Sparkles size={15} color="#43A047" style={{ flexShrink: 0 }} />
                    <span>A real 6-digit SMS verification code will be sent to your phone.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: loading ? 'rgba(67, 160, 71, 0.5)' : 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)',
                      border: 'none',
                      borderRadius: '14px',
                      color: '#FFFFFF',
                      fontSize: 15,
                      fontWeight: 800,
                      boxShadow: loading ? 'none' : '0 8px 24px rgba(46, 125, 50, 0.28)',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxSizing: 'border-box',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {loading ? (
                      <>
                        <div style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: '2px solid rgba(255,255,255,0.35)',
                          borderTopColor: '#FFFFFF',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                        Sending SMS Code…
                      </>
                    ) : (
                      <>
                        Send SMS Verification Code <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Email & Password Sign In */
                <form onSubmit={handleEmailSignIn} noValidate>
                  <Field label="Email Address" icon={Mail}>
                    <input
                      type="email"
                      value={siEmail}
                      onChange={(e) => {
                        setSiEmail(e.target.value);
                        setError(null);
                      }}
                      placeholder="you@example.com"
                      autoComplete="username"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  <div style={{ marginBottom: 20 }}>
                    <label style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text, #1F2933)',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                    }}>
                      Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Lock
                        size={16}
                        style={{
                          position: 'absolute',
                          left: 14,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--text-secondary, #667085)',
                          pointerEvents: 'none',
                        }}
                      />
                      <input
                        type={siShowPw ? 'text' : 'password'}
                        value={siPassword}
                        onChange={(e) => {
                          setSiPassword(e.target.value);
                          setError(null);
                        }}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        disabled={loading}
                        style={{ ...inputStyle(), padding: '12px 42px 12px 42px' }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#43A047';
                          e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#DDE7DF';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setSiShowPw((v) => !v)}
                        disabled={loading}
                        style={{
                          position: 'absolute',
                          right: 13,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary, #667085)',
                          display: 'flex',
                          padding: 4,
                          borderRadius: 6,
                        }}
                      >
                        {siShowPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: loading ? 'rgba(67, 160, 71, 0.5)' : 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)',
                      border: 'none',
                      borderRadius: '14px',
                      color: '#FFFFFF',
                      fontSize: 15,
                      fontWeight: 800,
                      boxShadow: loading ? 'none' : '0 8px 24px rgba(46, 125, 50, 0.28)',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxSizing: 'border-box',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {loading ? (
                      <>
                        <div style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: '2px solid rgba(255,255,255,0.35)',
                          borderTopColor: '#FFFFFF',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                        Signing in…
                      </>
                    ) : (
                      <>
                        Sign In <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>
              )}

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 18,
                fontSize: 13,
              }}>
                <button
                  type="button"
                  onClick={() => {
                    const fallbackDest = method === 'phone' ? phoneInput : siEmail;
                    if (fallbackDest.trim()) setTargetDestination(fallbackDest.trim());
                    setActiveVerifyType(method === 'phone' ? 'phone' : 'email');
                    switchView('verify');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#2E7D32',
                    fontSize: 13,
                    fontWeight: 700,
                    padding: 0,
                  }}
                >
                  Enter Verification Code
                </button>
                <button
                  type="button"
                  onClick={() => alert('Please contact your administrator or check your registered contact information.')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary, #667085)',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  Need Help?
                </button>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── SIGN UP VIEW ────────────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {view === 'signup' && (
            <>
              {method === 'phone' ? (
                /* Phone Sign Up */
                <form onSubmit={handlePhoneSignUp} noValidate>
                  <Field label="Full Name *" icon={User}>
                    <input
                      type="text"
                      value={suFullName}
                      onChange={(e) => {
                        setSuFullName(e.target.value);
                        setError(null);
                      }}
                      placeholder="Juan dela Cruz"
                      autoComplete="name"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  <Field
                    label="Mobile Phone Number *"
                    icon={Phone}
                    badge={
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D32', background: '#E8F5E9', padding: '2px 8px', borderRadius: 999 }}>
                        +63 (PH)
                      </span>
                    }
                  >
                    <input
                      type="tel"
                      value={suPhone}
                      onChange={(e) => {
                        setSuPhone(e.target.value);
                        setError(null);
                      }}
                      placeholder="0917 123 4567"
                      autoComplete="tel"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  {/* Divider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#E5EDE6' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-secondary, #667085)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Farm Details</span>
                    <div style={{ flex: 1, height: 1, background: '#E5EDE6' }} />
                  </div>

                  <Field label="Farm Name *" icon={Building2}>
                    <input
                      type="text"
                      value={suFarmName}
                      onChange={(e) => {
                        setSuFarmName(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g. Aberte Family Farm"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  <Field label="Farm Location" icon={MapPin}>
                    <input
                      type="text"
                      value={suFarmLocation}
                      onChange={(e) => setSuFarmLocation(e.target.value)}
                      placeholder="e.g. Cavite, Philippines"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  {/* Terms */}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, cursor: 'pointer', userSelect: 'none' }}>
                    <div
                      onClick={() => setSuTerms((v) => !v)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        flexShrink: 0,
                        marginTop: 1,
                        background: suTerms ? 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)' : '#FFFFFF',
                        border: `1.5px solid ${suTerms ? '#2E7D32' : '#DDE7DF'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {suTerms && <CheckCircle2 size={13} color="#FFFFFF" />}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary, #667085)', lineHeight: 1.5 }}>
                      I agree to the AlpasFarm{' '}
                      <span style={{ color: '#2E7D32', fontWeight: 600 }}>Terms of Service</span>
                      {' '}and{' '}
                      <span style={{ color: '#2E7D32', fontWeight: 600 }}>Privacy Policy</span>
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: loading ? 'rgba(67, 160, 71, 0.5)' : 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)',
                      border: 'none',
                      borderRadius: '14px',
                      color: '#FFFFFF',
                      fontSize: 15,
                      fontWeight: 800,
                      boxShadow: loading ? 'none' : '0 8px 24px rgba(46, 125, 50, 0.28)',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxSizing: 'border-box',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {loading ? (
                      <>
                        <div style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: '2px solid rgba(255,255,255,0.35)',
                          borderTopColor: '#FFFFFF',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                        Registering Account…
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} /> Register with SMS Code
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Email Sign Up */
                <form onSubmit={handleEmailSignUp} noValidate>
                  <Field label="Full Name *" icon={User}>
                    <input
                      type="text"
                      value={suFullName}
                      onChange={(e) => {
                        setSuFullName(e.target.value);
                        setError(null);
                      }}
                      placeholder="Juan dela Cruz"
                      autoComplete="name"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  <Field label="Email Address *" icon={Mail}>
                    <input
                      type="email"
                      value={suEmail}
                      onChange={(e) => {
                        setSuEmail(e.target.value);
                        setError(null);
                      }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  {/* Password with strength indicator */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text, #1F2933)',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                    }}>
                      Password *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Lock
                        size={16}
                        style={{
                          position: 'absolute',
                          left: 14,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--text-secondary, #667085)',
                          pointerEvents: 'none',
                        }}
                      />
                      <input
                        type={suShowPw ? 'text' : 'password'}
                        value={suPassword}
                        onChange={(e) => {
                          setSuPassword(e.target.value);
                          setError(null);
                        }}
                        placeholder="Min 8 characters"
                        autoComplete="new-password"
                        disabled={loading}
                        style={{ ...inputStyle(), padding: '12px 42px 12px 42px' }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#43A047';
                          e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#DDE7DF';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setSuShowPw((v) => !v)}
                        style={{
                          position: 'absolute',
                          right: 13,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary, #667085)',
                          display: 'flex',
                          padding: 4,
                        }}
                      >
                        {suShowPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {suPassword && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              style={{
                                flex: 1,
                                height: 4,
                                borderRadius: 2,
                                background: i <= pwStr.score ? pwStr.color : '#E5EDE6',
                                transition: 'background 0.2s',
                              }}
                            />
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary, #667085)' }}>
                          <span>Strength: <strong style={{ color: pwStr.color }}>{pwStr.label}</strong></span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {[['8+ chars', pwStr.checks.length], ['Upper', pwStr.checks.upper], ['Number', pwStr.checks.number]].map(([l, ok]) => (
                              <span key={l as string} style={{ color: ok ? '#2E7D32' : 'var(--text-secondary, #667085)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                {ok ? <CheckCircle2 size={12} color="#2E7D32" /> : <span style={{ opacity: 0.5 }}>-</span>} {l}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text, #1F2933)',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                    }}>
                      Confirm Password *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Lock
                        size={16}
                        style={{
                          position: 'absolute',
                          left: 14,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--text-secondary, #667085)',
                          pointerEvents: 'none',
                        }}
                      />
                      <input
                        type={suShowConfirmPw ? 'text' : 'password'}
                        value={suConfirmPw}
                        onChange={(e) => {
                          setSuConfirmPw(e.target.value);
                          setError(null);
                        }}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        disabled={loading}
                        style={{
                          ...inputStyle(),
                          padding: '12px 42px 12px 42px',
                          borderColor: suConfirmPw && suPassword !== suConfirmPw ? '#EF4444' : undefined,
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#43A047';
                          e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = suConfirmPw && suPassword !== suConfirmPw ? '#EF4444' : '#DDE7DF';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setSuShowConfirmPw((v) => !v)}
                        style={{
                          position: 'absolute',
                          right: 13,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary, #667085)',
                          display: 'flex',
                          padding: 4,
                        }}
                      >
                        {suShowConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {suConfirmPw && suPassword !== suConfirmPw && (
                      <p style={{ fontSize: 11, color: '#EF4444', marginTop: 5 }}>Passwords do not match.</p>
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#E5EDE6' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-secondary, #667085)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Farm Details</span>
                    <div style={{ flex: 1, height: 1, background: '#E5EDE6' }} />
                  </div>

                  <Field label="Farm Name *" icon={Building2}>
                    <input
                      type="text"
                      value={suFarmName}
                      onChange={(e) => {
                        setSuFarmName(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g. Aberte Family Farm"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  <Field label="Farm Location" icon={MapPin}>
                    <input
                      type="text"
                      value={suFarmLocation}
                      onChange={(e) => setSuFarmLocation(e.target.value)}
                      placeholder="e.g. Cavite, Philippines"
                      disabled={loading}
                      style={inputStyle()}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#43A047';
                        e.target.style.boxShadow = '0 0 0 4px rgba(67, 160, 71, 0.14)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#DDE7DF';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </Field>

                  {/* Terms */}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, cursor: 'pointer', userSelect: 'none' }}>
                    <div
                      onClick={() => setSuTerms((v) => !v)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        flexShrink: 0,
                        marginTop: 1,
                        background: suTerms ? 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)' : '#FFFFFF',
                        border: `1.5px solid ${suTerms ? '#2E7D32' : '#DDE7DF'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {suTerms && <CheckCircle2 size={13} color="#FFFFFF" />}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary, #667085)', lineHeight: 1.5 }}>
                      I agree to the AlpasFarm{' '}
                      <span style={{ color: '#2E7D32', fontWeight: 600 }}>Terms of Service</span>
                      {' '}and{' '}
                      <span style={{ color: '#2E7D32', fontWeight: 600 }}>Privacy Policy</span>
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: loading ? 'rgba(67, 160, 71, 0.5)' : 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)',
                      border: 'none',
                      borderRadius: '14px',
                      color: '#FFFFFF',
                      fontSize: 15,
                      fontWeight: 800,
                      boxShadow: loading ? 'none' : '0 8px 24px rgba(46, 125, 50, 0.28)',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxSizing: 'border-box',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {loading ? (
                      <>
                        <div style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: '2px solid rgba(255,255,255,0.35)',
                          borderTopColor: '#FFFFFF',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                        Creating account…
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} /> Create Account
                      </>
                    )}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 0.8s linear infinite;}`}</style>
    </div>
  );
}
