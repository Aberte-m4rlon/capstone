/**
 * MyAIPage — The AI Cloud assistant is now the global floating assistant.
 * This page redirects to dashboard; users open AI Cloud via the floating button.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export function MyAIPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to dashboard after a short moment so the user sees the message
    const t = setTimeout(() => navigate('/dashboard', { replace: true }), 1800);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: 20, textAlign: 'center',
      padding: 24,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'linear-gradient(135deg, #FF3B30, #FF7A18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 28px rgba(255,59,48,0.38)',
      }}>
        <Sparkles size={32} color="#fff" />
      </div>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.5px' }}>
          AI Cloud is now global
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 360 }}>
          The AI Cloud assistant is available on every page.
          Look for the <strong style={{ color: '#FF7A18' }}>AI Cloud</strong> button
          floating at the bottom-right of your screen.
        </p>
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 999,
        background: 'rgba(255,106,42,0.12)', border: '1px solid rgba(255,106,42,0.30)',
        fontSize: 13, color: '#FF7A18', fontWeight: 600,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF7A18', animation: 'pulse 1.5s ease-in-out infinite' }} />
        Redirecting to Dashboard…
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }`}</style>
    </div>
  );
}
