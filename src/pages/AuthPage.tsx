import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { defaultRouteForRole } from '../lib/auth';
import { Eye, EyeOff, User, Lock, ArrowRight, AlertCircle } from 'lucide-react';

export function AuthPage() {
  const { signIn, role } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError(null);

    // Basic client-side validation
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn(trimmedEmail, password);
    setLoading(false);

    if (signInError) {
      setError(signInError);
      return;
    }

    // Navigate to the role-appropriate dashboard
    navigate(defaultRouteForRole(role), { replace: true });
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '20px',
      overflowX: 'hidden',
      position: 'relative',
    }}>

      {/* Background glow orbs — orange/red brand, no green */}
      <div style={{
        position: 'fixed',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255, 59, 48, 0.16) 0%, transparent 70%)',
        top: '-80px',
        right: '-60px',
        zIndex: 0,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255, 106, 42, 0.14) 0%, transparent 70%)',
        bottom: '-60px',
        left: '-40px',
        zIndex: 0,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255, 159, 10, 0.10) 0%, transparent 70%)',
        top: '40%',
        left: '10%',
        zIndex: 0,
        pointerEvents: 'none',
      }} />

      {/* Login Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.04) 100%)',
        backdropFilter: 'blur(40px) saturate(200%)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%)',
        border: '1px solid rgba(255, 255, 255, 0.22)',
        borderRadius: '28px',
        boxShadow: '0 30px 80px rgba(0, 0, 0, 0.45), inset 0 1.5px 1px rgba(255, 255, 255, 0.40), 0 0 40px rgba(255, 106, 42, 0.10)',
        width: '100%',
        maxWidth: '440px',
        padding: 'clamp(28px, 5vw, 44px)',
        position: 'relative',
        zIndex: 1,
        boxSizing: 'border-box',
      }}>

        {/* Glass specular highlight */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '28px',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.22), transparent 30%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '22px',
              background: 'linear-gradient(135deg, #FF3B30, #FF7A18)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '34px',
              fontWeight: 900,
              marginBottom: '16px',
              boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.40), 0 14px 36px rgba(255, 59, 48, 0.40)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
            }}>A</div>

            <h1 style={{
              fontSize: 'clamp(22px, 4vw, 28px)',
              fontWeight: 900,
              color: 'var(--text)',
              letterSpacing: '-0.5px',
              margin: '0 0 6px',
              lineHeight: 1.2,
            }}>AlpasFarm</h1>

            <p style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              margin: 0,
              letterSpacing: '0.2px',
              lineHeight: 1.5,
            }}>Smart Goat &amp; Sheep Farm Management</p>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              marginBottom: '20px',
              borderRadius: '12px',
              background: 'rgba(255, 59, 48, 0.12)',
              border: '1px solid rgba(255, 59, 48, 0.28)',
              color: '#FF3B30',
              fontSize: '13px',
              fontWeight: 600,
              lineHeight: 1.4,
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>

            {/* Email field */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '7px',
              }}>
                Farmer Email / ID
              </label>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)',
                  pointerEvents: 'none',
                }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  placeholder="you@example.com"
                  autoComplete="username"
                  autoFocus
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    background: 'rgba(255, 255, 255, 0.07)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    borderRadius: '12px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    opacity: loading ? 0.6 : 1,
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(255, 106, 42, 0.60)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(255, 106, 42, 0.18)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* Password field */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '7px',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)',
                  pointerEvents: 'none',
                }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px 44px 12px 42px',
                    background: 'rgba(255, 255, 255, 0.07)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    borderRadius: '12px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    opacity: loading ? 0.6 : 1,
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(255, 106, 42, 0.60)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(255, 106, 42, 0.18)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {/* Show / hide toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={loading}
                  style={{
                    position: 'absolute',
                    right: '13px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                    borderRadius: '6px',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Sign In button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px 20px',
                background: loading
                  ? 'rgba(255, 106, 42, 0.5)'
                  : 'linear-gradient(135deg, #FF3B30, #FF7A18)',
                border: '1px solid rgba(255, 255, 255, 0.20)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 800,
                letterSpacing: '0.2px',
                boxShadow: loading ? 'none' : 'inset 0 1.5px 1px rgba(255,255,255,0.25), 0 10px 28px rgba(255, 59, 48, 0.38)',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box',
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.35)',
                    borderTopColor: '#fff',
                    animation: 'spin 0.7s linear infinite',
                    flexShrink: 0,
                  }} />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={17} />
                </>
              )}
            </button>

          </form>

          {/* Forgot password */}
          <p style={{
            textAlign: 'center',
            marginTop: '20px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}>
            <button
              type="button"
              onClick={() => {
                // Future: navigate to /forgot-password or trigger Supabase resetPasswordForEmail
                alert('Please contact your system administrator to reset your password.');
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
                padding: 0,
                textDecoration: 'underline',
                textDecorationColor: 'transparent',
                transition: 'color 0.2s, text-decoration-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#FF7A18';
                e.currentTarget.style.textDecorationColor = '#FF7A18';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.textDecorationColor = 'transparent';
              }}
            >
              Forgot Password?
            </button>
          </p>

        </div>
      </div>

      {/* Spin keyframe injected inline */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
