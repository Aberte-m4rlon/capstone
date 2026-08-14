import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Mail, Phone } from 'lucide-react';

function formatPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function AuthPage() {
  const { sendOtpToEmail, sendOtpToPhone, verifyEmailOtp, verifyPhoneOtp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendVerificationCode = async () => {
    setError(null);

    if (authMethod === 'email') {
      if (!email.trim()) {
        setError('Email is required.');
        return;
      }

      setLoading(true);
      const { error } = await sendOtpToEmail(email.trim());
      setLoading(false);

      if (error) {
        setError(error);
        toast(error, 'error');
        return;
      }

      setIsCodeSent(true);
      setVerificationCode('');
      toast('Verification code sent to your email.', 'success');
    } else {
      if (!phone.trim()) {
        setError('Phone number is required.');
        return;
      }

      const formattedPhone = formatPhoneNumber(phone);
      if (formattedPhone.length < 10) {
        setError('Please enter a valid phone number.');
        return;
      }

      setLoading(true);
      const { error } = await sendOtpToPhone(formattedPhone);
      setLoading(false);

      if (error) {
        setError(error);
        toast(error, 'error');
        return;
      }

      setIsCodeSent(true);
      setVerificationCode('');
      toast('Verification code sent via SMS.', 'success');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isCodeSent) {
      await sendVerificationCode();
      return;
    }

    if (!verificationCode.trim()) {
      setError('Please enter the verification code.');
      return;
    }

    setLoading(true);

    let verifyError: string | null = null;

    if (authMethod === 'email') {
      const result = await verifyEmailOtp(email.trim(), verificationCode.trim());
      verifyError = result.error;
    } else {
      const result = await verifyPhoneOtp(formatPhoneNumber(phone), verificationCode.trim());
      verifyError = result.error;
    }

    setLoading(false);

    if (verifyError) {
      const friendlyError = verifyError.includes('Invalid OTP') || verifyError.includes('expired')
        ? 'The verification code is invalid or expired. Please request a new one.'
        : verifyError;
      setError(friendlyError);
      toast(friendlyError, 'error');
      return;
    }

    toast('Authentication successful! Welcome to AlpasFarm.', 'success');
    navigate('/dashboard');
  };

  const resetAuthState = () => {
    setVerificationCode('');
    setIsCodeSent(false);
    setError(null);
    setEmail('');
    setPhone('');
    setAuthMethod('email');
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

        {/* Auth Method Toggle */}
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
              setAuthMethod('email');
              resetAuthState();
            }}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.5px',
              background: authMethod === 'email' ? 'var(--surface-hover)' : 'transparent',
              color: authMethod === 'email' ? 'var(--accent)' : 'var(--text-secondary)',
              border: authMethod === 'email' ? '1px solid var(--border)' : 'none',
              boxShadow: authMethod === 'email' ? '0 4px 12px rgba(255, 75, 43, 0.15)' : 'none',
              transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Mail size={16} /> Email
          </button>
          <button
            onClick={() => {
              setAuthMethod('phone');
              resetAuthState();
            }}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.5px',
              background: authMethod === 'phone' ? 'var(--surface-hover)' : 'transparent',
              color: authMethod === 'phone' ? 'var(--accent)' : 'var(--text-secondary)',
              border: authMethod === 'phone' ? '1px solid var(--border)' : 'none',
              boxShadow: authMethod === 'phone' ? '0 4px 12px rgba(255, 75, 43, 0.15)' : 'none',
              transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Phone size={16} /> SMS
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email Input */}
          {authMethod === 'email' && (
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
                  required={authMethod === 'email'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="farmer@alpasfarm.com"
                  disabled={isCodeSent}
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
                    opacity: isCodeSent ? 0.6 : 1,
                    cursor: isCodeSent ? 'not-allowed' : 'auto',
                  }}
                  onFocus={(e) => {
                    if (!isCodeSent) {
                      (e.target as HTMLInputElement).style.border = '1px solid var(--accent)';
                      (e.target as HTMLInputElement).style.boxShadow = '0 0 20px rgba(255, 75, 43, 0.2)';
                    }
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLInputElement).style.border = '1px solid var(--border-light)';
                    (e.target as HTMLInputElement).style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>
          )}

          {/* Phone Input */}
          {authMethod === 'phone' && (
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
                  required={authMethod === 'phone'}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+63 9123456789"
                  disabled={isCodeSent}
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
                    opacity: isCodeSent ? 0.6 : 1,
                    cursor: isCodeSent ? 'not-allowed' : 'auto',
                  }}
                  onFocus={(e) => {
                    if (!isCodeSent) {
                      (e.target as HTMLInputElement).style.border = '1px solid var(--accent)';
                      (e.target as HTMLInputElement).style.boxShadow = '0 0 20px rgba(255, 75, 43, 0.2)';
                    }
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLInputElement).style.border = '1px solid var(--border-light)';
                    (e.target as HTMLInputElement).style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>
          )}

          {/* Verification Code Input */}
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
            ✓ Real {authMethod === 'email' ? 'email' : 'SMS'} verification powered by Supabase
          </div>

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
            {loading ? 'Processing...' : isCodeSent ? 'Verify Code' : `Send Code via ${authMethod === 'email' ? 'Email' : 'SMS'}`}
          </button>

          {/* Change Method Link */}
          {isCodeSent && (
            <button
              type="button"
              onClick={resetAuthState}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '10px 14px',
                background: 'transparent',
                border: '1px solid var(--border-light)',
                borderRadius: 12,
                color: 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.3px',
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-light)';
              }}
            >
              Use different method
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
