import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { KeyRound, ShieldCheck, Sparkles, User, ArrowRight } from 'lucide-react';

export function AuthPage() {
  const { signInWithPass } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('farmer@alpasfarm.com');
  const [passcode, setPasscode] = useState('123456');
  const [loading, setLoading] = useState(false);

  const handleContinue = async (e?: React.FormEvent, customEmail?: string) => {
    if (e) e.preventDefault();
    setLoading(true);

    const targetEmail = customEmail || email.trim() || 'farmer@alpasfarm.com';
    const targetName = targetEmail === 'marlonaberte00@gmail.com' ? 'Marlon Aberte (Admin)' : 'Farm Manager';

    await signInWithPass(targetEmail, targetName);
    setLoading(false);

    toast(`Welcome to AlpasFarm, ${targetName}!`, 'success');
    if (targetEmail === 'marlonaberte00@gmail.com') {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  };

  const handleQuickPass = (userEmail: string) => {
    setEmail(userEmail);
    handleContinue(undefined, userEmail);
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
        width: '450px',
        height: '450px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
        top: '10%',
        right: '10%',
        zIndex: 0,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed',
        width: '350px',
        height: '350px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 70%)',
        bottom: '10%',
        left: '5%',
        zIndex: 0,
        pointerEvents: 'none',
      }} />

      <div style={{
        background: 'var(--surface)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border)',
        borderRadius: 24,
        boxShadow: 'var(--shadow), var(--shadow-inner)',
        width: '100%',
        maxWidth: 450,
        padding: 36,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: 'linear-gradient(135deg, #10B981, #059669)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            fontWeight: 900,
            marginBottom: 14,
            boxShadow: '0 12px 30px rgba(16, 185, 129, 0.35)',
          }}>A</div>
          <h1 style={{
            fontSize: 26,
            fontWeight: 900,
            color: 'var(--text)',
            letterSpacing: '-0.5px',
            margin: 0,
          }}>AlpasFarm</h1>
          <p style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginTop: 4,
            letterSpacing: '0.3px',
          }}>Smart Goat & Sheep Farm Management</p>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            padding: '4px 12px',
            borderRadius: 20,
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#10B981',
            fontSize: 12,
            fontWeight: 700,
          }}>
            <Sparkles size={13} />
            Quick Pass Access Active
          </div>
        </div>

        {/* Pass Login Form */}
        <form onSubmit={(e) => handleContinue(e)}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 6,
            }}>
              Farmer Email / ID
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none',
              }} />
              <input
                type="text"
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
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 6,
            }}>
              Passcode
            </label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={16} style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none',
              }} />
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 12,
                  color: 'var(--text)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Primary Continue Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px 16px',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: '0.3px',
              boxShadow: '0 10px 25px rgba(16, 185, 129, 0.3)',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
            }}
          >
            {loading ? 'Entering...' : (
              <>
                Continue to Dashboard
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '22px 0 16px',
          color: 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 600,
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
          <span>OR 1-CLICK QUICK PASS</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
        </div>

        {/* 1-Click Fast Pass Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => handleQuickPass('farmer@alpasfarm.com')}
            style={{
              width: '100%',
              padding: '11px 14px',
              background: 'var(--surface-active)',
              border: '1px solid var(--border-light)',
              borderRadius: 12,
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#10B981',
              }} />
              <span>Enter as <strong>Farm Manager</strong></span>
            </div>
            <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>1-Click &rarr;</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickPass('marlonaberte00@gmail.com')}
            style={{
              width: '100%',
              padding: '11px 14px',
              background: 'var(--surface-active)',
              border: '1px solid var(--border-light)',
              borderRadius: 12,
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} style={{ color: '#3B82F6' }} />
              <span>Enter as <strong>System Admin</strong></span>
            </div>
            <span style={{ fontSize: 12, color: '#3B82F6', fontWeight: 600 }}>1-Click &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
