import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Lock, Mail, Phone, LogIn, UserPlus } from 'lucide-react';

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendVerificationCode = () => {
    const code = generateVerificationCode();
    setGeneratedCode(code);
    setIsCodeSent(true);
    setVerificationCode('');
    toast(`Verification code sent. Demo code: ${code}`, 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email.trim()) {
      setError('Email is required.');
      setLoading(false);
      return;
    }

    if (!phone.trim()) {
      setError('Phone number is required.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (!isCodeSent) {
      sendVerificationCode();
      setLoading(false);
      return;
    }

    if (!verificationCode.trim()) {
      setError('Please enter the verification code sent to your phone or email.');
      setLoading(false);
      return;
    }

    if (verificationCode.trim() !== generatedCode) {
      setError('Invalid verification code. Please try again.');
      setLoading(false);
      return;
    }

    const { error } = mode === 'login'
      ? await signIn(email, password, phone)
      : await signUp(email, password, phone);

    setLoading(false);

    if (error) {
      const friendlyError = error.includes('Email not confirmed')
        ? 'Your email is not yet confirmed. Please check your inbox and verify your email first.'
        : error.includes('Invalid login credentials')
        ? 'Incorrect email or password. Please try again.'
        : error.includes('User already registered')
        ? 'An account with this email already exists. Try signing in instead.'
        : error;
      setError(friendlyError);
      toast(friendlyError, 'error');
      return;
    }

    if (mode === 'signup') {
      toast('Account created! Please check your email for verification, then sign in.', 'success');
    } else {
      toast('Welcome back to AlpasFarm!', 'success');
    }
    navigate('/dashboard');
  };

  const resetAuthState = () => {
    setGeneratedCode('');
    setVerificationCode('');
    setIsCodeSent(false);
    setError(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 20,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Decorative background gradients */}
      <div style={{
        position: 'fixed',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255, 75, 43, 0.15) 0%, transparent 70%)',
        top: '10%',
        right: '10%',
        zIndex: 0,
      }} />
      <div style={{
        position: 'fixed',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
        bottom: '10%',
        left: '5%',
        zIndex: 0,
      }} />

      <div style={{
        background: 'var(--surface)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border)',
        borderRadius: 24,
        boxShadow: 'var(--shadow), var(--shadow-inner)',
        width: '100%',
        maxWidth: 440,
        padding: 40,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            fontWeight: 900,
            marginBottom: 16,
            boxShadow: '0 12px 32px rgba(255, 75, 43, 0.3)',
          }}>A</div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 900,
            color: 'var(--text)',
            letterSpacing: '-0.5px',
          }}>AlpasFarm</h1>
          <p style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginTop: 6,
            letterSpacing: '0.3px',
          }}>Smart Goat & Sheep Farm Management</p>
        </div>

        {/* Mode Toggle */}
        <div style={{
          display: 'flex',
          gap: 6,
          background: 'var(--surface-active)',
          borderRadius: 12,
          padding: 6,
          marginBottom: 28,
          border: '1px solid var(--border-light)',
        }}>
          <button
            onClick={() => {
              setMode('login');
              resetAuthState();
            }}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.5px',
              background: mode === 'login' ? 'var(--surface-hover)' : 'transparent',
              color: mode === 'login' ? 'var(--accent)' : 'var(--text-secondary)',
              border: mode === 'login' ? '1px solid var(--border)' : 'none',
              boxShadow: mode === 'login' ? '0 4px 12px rgba(255, 75, 43, 0.15)' : 'none',
              transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <LogIn size={16} /> Sign In
          </button>
          <button
            onClick={() => {
              setMode('signup');
              resetAuthState();
            }}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.5px',
              background: mode === 'signup' ? 'var(--surface-hover)' : 'transparent',
              color: mode === 'signup' ? 'var(--accent)' : 'var(--text-secondary)',
              border: mode === 'signup' ? '1px solid var(--border)' : 'none',
              boxShadow: mode === 'signup' ? '0 4px 12px rgba(255, 75, 43, 0.15)' : 'none',
              transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <UserPlus size={16} /> Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 8,
              letterSpacing: '0.3px',
            }}>
              Email Address <span style={{ color: 'var(--accent)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none',
              }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="farmer@alpasfarm.com"
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 12,
                  color: 'var(--text)',
                  fontSize: 14,
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  backdropFilter: 'var(--glass-blur)',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.border = '1px solid var(--accent)';
                  (e.target as HTMLInputElement).style.boxShadow = '0 0 20px rgba(255, 75, 43, 0.2)';
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.border = '1px solid var(--border-light)';
                  (e.target as HTMLInputElement).style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 8,
              letterSpacing: '0.3px',
            }}>
              Phone Number <span style={{ color: 'var(--accent)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Phone size={16} style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none',
              }} />
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09123456789"
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 12,
                  color: 'var(--text)',
                  fontSize: 14,
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  backdropFilter: 'var(--glass-blur)',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.border = '1px solid var(--accent)';
                  (e.target as HTMLInputElement).style.boxShadow = '0 0 20px rgba(255, 75, 43, 0.2)';
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.border = '1px solid var(--border-light)';
                  (e.target as HTMLInputElement).style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 8,
              letterSpacing: '0.3px',
            }}>
              Password <span style={{ color: 'var(--accent)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none',
              }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 12,
                  color: 'var(--text)',
                  fontSize: 14,
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  backdropFilter: 'var(--glass-blur)',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.border = '1px solid var(--accent)';
                  (e.target as HTMLInputElement).style.boxShadow = '0 0 20px rgba(255, 75, 43, 0.2)';
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.border = '1px solid var(--border-light)';
                  (e.target as HTMLInputElement).style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {/* Verification Code */}
          {isCodeSent && (
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: 8,
                letterSpacing: '0.3px',
              }}>
                Verification Code <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 12,
                  color: 'var(--text)',
                  fontSize: 14,
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  backdropFilter: 'var(--glass-blur)',
                  boxSizing: 'border-box',
                  outline: 'none',
                  letterSpacing: '8px',
                  textAlign: 'center',
                  fontWeight: 700,
                }}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.border = '1px solid var(--accent)';
                  (e.target as HTMLInputElement).style.boxShadow = '0 0 20px rgba(255, 75, 43, 0.2)';
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.border = '1px solid var(--border-light)';
                  (e.target as HTMLInputElement).style.boxShadow = 'none';
                }}
              />
            </div>
          )}

          {/* Info Banner */}
          {mode === 'signup' && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 18,
              fontSize: 12,
              color: '#3B82F6',
              fontWeight: 600,
              letterSpacing: '0.3px',
            }}>
              ✓ Account creation includes phone verification
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 18,
              fontSize: 12,
              color: '#EF4444',
              fontWeight: 600,
              letterSpacing: '0.3px',
            }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.5px',
              boxShadow: '0 12px 32px rgba(255, 75, 43, 0.3)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              transform: loading ? 'scale(0.98)' : 'scale(1)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 16px 40px rgba(255, 75, 43, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 32px rgba(255, 75, 43, 0.3)';
              }
            }}
          >
            {loading ? 'Processing...' : isCodeSent ? 'Verify & Continue' : mode === 'login' ? 'Send Code & Sign In' : 'Send Code & Sign Up'}
          </button>
        </form>

        {/* Toggle Mode Link */}
        <p style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--text-secondary)',
          marginTop: 20,
          letterSpacing: '0.3px',
        }}>
          {mode === 'login'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              resetAuthState();
            }}
            style={{
              color: 'var(--accent)',
              fontWeight: 700,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.3s',
              padding: 0,
              fontSize: 13,
              letterSpacing: '0.3px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.8';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            }}
          >
            {mode === 'login' ? 'Create account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
