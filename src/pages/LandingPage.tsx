import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Icons } from '../lib/icons';
import { TrendingUp, BarChart3, AlertCircle, Zap, Smartphone, Lightbulb, Sun, Moon, Heart, Syringe, Package, ScanLine, Calendar, Scale, HeartPulse, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SystemVideoDemo } from '../components/SystemVideoDemo';

export function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [darkMode]);

  if (user) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', overflow: 'hidden' }}>
      {/* Navigation */}
      <nav style={{ 
        padding: '16px 40px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: 'var(--surface)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderBottom: '1px solid var(--border-light)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
      }}>
        <div style={{ fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent)', letterSpacing: '-0.5px' }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(255, 75, 43, 0.3)'
          }}>
            <Icons.PawPrint size={22} color="#fff" />
          </div>
          AlpasFarm
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button 
            className="topbar-icon-btn"
            onClick={() => setDarkMode(!darkMode)}
            style={{ width: 44, height: 44 }}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/login')}
            style={{ padding: '10px 24px' }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{ 
        padding: '100px 40px', 
        textAlign: 'center',
        background: `linear-gradient(135deg, 
          rgba(255, 75, 43, 0.08) 0%, 
          rgba(99, 102, 241, 0.05) 50%, 
          rgba(139, 92, 246, 0.08) 100%)`,
        position: 'relative',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{
            display: 'inline-block',
            padding: '8px 16px',
            borderRadius: 999,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            marginBottom: 24,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            🚀 Premium Farm Management Platform
          </div>

          <h1 style={{
            fontSize: '56px',
            fontWeight: 900,
            marginBottom: 24,
            color: 'var(--text)',
            letterSpacing: '-1px',
            lineHeight: 1.1,
          }}>
            Smart Farm Management<br />
            <span style={{
              background: 'linear-gradient(135deg, var(--text) 0%, var(--accent) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              for Goats & Sheep
            </span>
          </h1>

          <p style={{
            fontSize: '18px',
            marginBottom: 40,
            color: 'var(--text-secondary)',
            maxWidth: 700,
            margin: '0 auto 40px',
            lineHeight: 1.8,
            fontWeight: 500,
          }}>
            Track health, breeding, nutrition, and more with AI-powered insights. Transform your farm into a data-driven operation.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-primary"
              onClick={() => navigate('/login')}
              style={{ padding: '13px 32px', fontSize: 15, fontWeight: 700 }}
            >
              Get Started Free
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => {
                const el = document.querySelector('#system-video-demo');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                padding: '13px 28px',
                fontSize: 15,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.20), rgba(255, 122, 24, 0.12))',
                border: '1px solid rgba(255, 122, 24, 0.40)',
                color: '#fff',
                boxShadow: '0 4px 20px rgba(255, 122, 24, 0.20)',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #FF3B30, #FF7A18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Play size={12} color="#fff" style={{ marginLeft: 2 }} />
              </div>
              ▶ Watch Demo
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ padding: '13px 28px', fontSize: 15, fontWeight: 700 }}
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Video System Walkthrough Section */}
      <section style={{ padding: '80px 20px 60px', background: 'var(--bg)', position: 'relative' }}>
        <SystemVideoDemo />
      </section>

      {/* Features Section */}
      <section id="features" style={{ padding: '100px 40px', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{
            fontSize: '44px',
            fontWeight: 900,
            textAlign: 'center',
            marginBottom: 16,
            color: 'var(--text)',
            letterSpacing: '-0.5px',
          }}>
            Powerful Features
          </h2>
          <p style={{
            fontSize: '16px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            marginBottom: 60,
            maxWidth: 600,
            margin: '0 auto 60px',
          }}>
            Everything you need to manage a thriving goat and sheep farm
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {/* Feature 1: Animal Profiles */}
            <div className="glass-card">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(255, 75, 43, 0.2), rgba(255, 122, 24, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 20px rgba(255, 75, 43, 0.15)',
              }}>
                <Icons.PawPrint size={28} color="var(--accent)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                Animal Profiles
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Track individual animals with breed, age, weight, and health status. Build a complete inventory.
              </p>
            </div>

            {/* Feature 2: Health Monitoring */}
            <div className="glass-card">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 20px rgba(239, 68, 68, 0.15)',
              }}>
                <HeartPulse size={28} color="var(--critical)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                Health Monitoring
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Record vitals, symptoms, and conditions. AI detects health risks and flags animals needing attention.
              </p>
            </div>

            {/* Feature 3: Vaccination Tracking */}
            <div className="glass-card">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 20px rgba(245, 158, 11, 0.15)',
              }}>
                <Syringe size={28} color="var(--warning)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                Vaccination Schedules
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Auto-track vaccinations and send reminders. Never miss critical immunizations.
              </p>
            </div>

            {/* Feature 4: Breeding Management */}
            <div className="glass-card">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 20px rgba(59, 130, 246, 0.15)',
              }}>
                <Heart size={28} color="var(--info)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                Breeding & Kidding
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Track mating, pregnancy, and kidding dates. Get alerts when animals are due.
              </p>
            </div>

            {/* Feature 5: Weight Tracking */}
            <div className="glass-card">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 20px rgba(16, 185, 129, 0.15)',
              }}>
                <Scale size={28} color="var(--healthy)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                Growth Tracking
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Monitor weight trends, predict market-ready dates, optimize feed efficiency.
              </p>
            </div>

            {/* Feature 6: QR Scanner */}
            <div className="glass-card">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(255, 75, 43, 0.2), rgba(255, 122, 24, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 20px rgba(255, 75, 43, 0.15)',
              }}>
                <ScanLine size={28} color="var(--accent)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                QR Code Scanner
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Scan QR codes on animal tags to instantly access profiles and record data in seconds.
              </p>
            </div>

            {/* Feature 7: Inventory Management */}
            <div className="glass-card">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 20px rgba(245, 158, 11, 0.15)',
              }}>
                <Package size={28} color="var(--warning)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                Inventory & Supplies
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Track feed, medicines, vaccines. Get alerts for low stock and expiry dates.
              </p>
            </div>

            {/* Feature 8: AI Assistant */}
            <div className="glass-card">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(255, 75, 43, 0.2), rgba(255, 122, 24, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 20px rgba(255, 75, 43, 0.15)',
              }}>
                <Lightbulb size={28} color="var(--accent)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                AI Farm Assistant
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Get farming advice, disease info, and recommendations in Tagalog via AI chatbot.
              </p>
            </div>

            {/* Feature 9: Daily Alerts */}
            <div className="glass-card">
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 20px rgba(239, 68, 68, 0.15)',
              }}>
                <Calendar size={28} color="var(--critical)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                Daily Alerts & Reminders
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Prioritized task reminders, push notifications, and SMS/email summaries for farm work.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section style={{
        padding: '100px 40px',
        background: `linear-gradient(135deg,
          rgba(255, 75, 43, 0.05) 0%,
          rgba(99, 102, 241, 0.03) 50%,
          rgba(139, 92, 246, 0.05) 100%)`,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{
            fontSize: '44px',
            fontWeight: 900,
            textAlign: 'center',
            marginBottom: 60,
            color: 'var(--text)',
            letterSpacing: '-0.5px',
          }}>
            How It Works
          </h2>

          <div style={{ display: 'grid', gap: 32 }}>
            {[1, 2, 3, 4, 5].map((step) => {
              const titles = [
                'Add Your Animals',
                'Record Daily Activities',
                'Get AI Insights',
                'Act on Recommendations',
                'Measure & Report'
              ];
              const descriptions = [
                'Register each goat or sheep with species, breed, age, weight, and photos. Assign unique tag IDs for QR scanning.',
                'Log health checks, weights, vaccinations, breeding events, feed records, and milk yields.',
                'System analyzes your data using machine learning to detect health risks and suggest optimizations.',
                'Review daily alerts, smart recommendations, and health warnings to make informed decisions.',
                'View analytics, generate reports, and track progress over time. Share public profiles.'
              ];

              return (
                <div key={step} style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    fontWeight: 900,
                    flexShrink: 0,
                    boxShadow: '0 12px 32px rgba(255, 75, 43, 0.25)',
                    letterSpacing: '-1px',
                  }}>
                    {step}
                  </div>
                  <div>
                    <h3 style={{
                      fontSize: 18,
                      fontWeight: 800,
                      marginBottom: 8,
                      color: 'var(--text)',
                      letterSpacing: '-0.3px',
                    }}>
                      {titles[step - 1]}
                    </h3>
                    <p style={{
                      fontSize: 14,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.8,
                    }}>
                      {descriptions[step - 1]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Choose */}
      <section style={{ padding: '100px 40px', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{
            fontSize: '44px',
            fontWeight: 900,
            textAlign: 'center',
            marginBottom: 60,
            color: 'var(--text)',
            letterSpacing: '-0.5px',
          }}>
            Why Choose AlpasFarm?
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {[
              { icon: TrendingUp, title: 'Data-Driven Decisions', desc: 'ML models predict health risks, breeding success, and growth trends.' },
              { icon: BarChart3, title: 'Detailed Analytics', desc: 'Charts, reports, and performance metrics to track farm health.' },
              { icon: AlertCircle, title: 'Proactive Alerts', desc: 'Never miss vaccinations, kidding dates, or health emergencies.' },
              { icon: Smartphone, title: 'Mobile-Ready', desc: 'Access from any device. Built for farmers in the field.' },
              { icon: Lightbulb, title: 'AI Chatbot', desc: 'Get farming advice and recommendations in Tagalog.' },
              { icon: Zap, title: 'Fast & Reliable', desc: 'Cloud-based with real-time sync. Your data is always secure.' },
            ].map((item, i) => (
              <div key={i} className="glass-card">
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(255, 75, 43, 0.2), rgba(255, 122, 24, 0.1))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                  boxShadow: '0 8px 20px rgba(255, 75, 43, 0.15)',
                }}>
                  <item.icon size={24} color="var(--accent)" />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, color: 'var(--text)' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '80px 40px',
        textAlign: 'center',
        background: `linear-gradient(135deg,
          rgba(255, 75, 43, 0.08) 0%,
          rgba(99, 102, 241, 0.05) 50%,
          rgba(139, 92, 246, 0.08) 100%)`,
      }}>
        <h2 style={{
          fontSize: '40px',
          fontWeight: 900,
          marginBottom: 16,
          color: 'var(--text)',
          letterSpacing: '-0.5px',
        }}>
          Ready to Transform Your Farm?
        </h2>
        <p style={{
          fontSize: 16,
          marginBottom: 32,
          color: 'var(--text-secondary)',
          maxWidth: 600,
          margin: '0 auto 32px',
        }}>
          Start managing your farm smarter today. Sign up and get your free account.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/login')}
          style={{ padding: '13px 40px', fontSize: 15, fontWeight: 700 }}
        >
          Get Started Now →
        </button>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '40px',
        background: 'var(--surface)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderTop: '1px solid var(--border-light)',
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--text-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 800 }}>
            <Icons.PawPrint size={18} />
            AlpasFarm
          </div>
          <p>© 2026 AlpasFarm. Premium Smart Farm Management for Goats & Sheep.</p>
        </div>
      </footer>
    </div>
  );
}
