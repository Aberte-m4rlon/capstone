import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    const { error } = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password);

    setLoading(false);

    if (error) {
      const friendlyError = error.includes('Email not confirmed')
        ? 'Your email is not yet confirmed. Please check your inbox, or ask the admin to disable email confirmation in Supabase settings.'
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
      toast('Account created! You are now signed in.', 'success');
    } else {
      toast('Welcome back to AlpasFarm!', 'success');
    }
    navigate('/dashboard');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #B91C1C, #991B1B)',
      padding: 20,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        width: '100%',
        maxWidth: 420,
        padding: 36,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 60, height: 60,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #B91C1C, #991B1B)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 800,
            marginBottom: 14,
          }}>A</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1F2937' }}>AlpasFarm</h1>
          <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>Goat & Sheep Farm Management</p>
        </div>

        <div style={{ display: 'flex', gap: 4, background: '#F5F5F5', borderRadius: 10, padding: 4, marginBottom: 22 }}>
          <button
            onClick={() => setMode('login')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8,
              fontWeight: 600, fontSize: 13,
              background: mode === 'login' ? '#fff' : 'transparent',
              color: mode === 'login' ? '#B91C1C' : '#9CA3AF',
              boxShadow: mode === 'login' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >Sign In</button>
          <button
            onClick={() => setMode('signup')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8,
              fontWeight: 600, fontSize: 13,
              background: mode === 'signup' ? '#fff' : 'transparent',
              color: mode === 'signup' ? '#B91C1C' : '#9CA3AF',
              boxShadow: mode === 'signup' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >Sign Up</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email <span className="req">*</span></label>
            <input
              className="form-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="farmer@alpasfarm.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password <span className="req">*</span></label>
            <input
              className="form-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          {mode === 'signup' && (
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#166534' }}>
              ✅ No email verification needed — you can log in immediately after signing up.
            </div>
          )}
          {error && (
            <div style={{
              background: '#FEE2E2', color: '#991B1B',
              padding: '10px 14px', borderRadius: 8,
              fontSize: 12, fontWeight: 600, marginBottom: 16,
            }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            disabled={loading}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', marginTop: 18 }}>
          {mode === 'login'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            style={{ color: '#B91C1C', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
