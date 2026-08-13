import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Icons } from '../lib/icons';
import { TrendingUp, BarChart3, AlertCircle, Zap, Smartphone, Lightbulb } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Navigation */}
      <nav style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card)', boxShadow: 'var(--shadow-sm)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>🐐 AlpasFarm</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button 
            className="btn btn-ghost"
            onClick={() => setDarkMode(!darkMode)}
            style={{ fontSize: 18 }}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/login')}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{ padding: '80px 40px', textAlign: 'center', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: 48, fontWeight: 900, marginBottom: 20, color: 'var(--text)' }}>
          Smart Farm Management<br />for Goats & Sheep
        </h1>
        <p style={{ fontSize: 18, marginBottom: 40, color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto 40px' }}>
          Track health, breeding, nutrition, and more. Make data-driven decisions with AI-powered recommendations.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/login')}
            style={{ padding: '12px 32px', fontSize: 16, fontWeight: 700 }}
          >
            Get Started
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' })}
            style={{ padding: '12px 32px', fontSize: 16, fontWeight: 700 }}
          >
            Learn More
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" style={{ padding: '80px 40px', background: 'var(--bg)' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 60, color: 'var(--text)' }}>
          Comprehensive Features
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 1200, margin: '0 auto' }}>
          {/* Feature 1: Animal Tracking */}
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Icons.PawPrint size={32} color="var(--primary)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Animal Profiles</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Add animals with breed, age, weight, and health status. Track each individual and build a complete inventory.
            </p>
          </div>

          {/* Feature 2: Health Monitoring */}
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Icons.HeartPulse size={32} color="var(--critical)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Health Monitoring</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Record vitals, symptoms, and conditions. AI analyzes health risks and flags animals needing attention.
            </p>
          </div>

          {/* Feature 3: Vaccination Tracking */}
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Icons.Syringe size={32} color="var(--warning)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Vaccination Schedules</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Auto-track vaccination dates, send reminders, and never miss critical immunizations.
            </p>
          </div>

          {/* Feature 4: Breeding Management */}
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Icons.Heart size={32} color="var(--info)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Breeding & Kidding</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Track mating, pregnancy, and kidding dates. Get alerts when animals are due.
            </p>
          </div>

          {/* Feature 5: Weight & Growth */}
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Icons.Scale size={32} color="var(--healthy)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Growth Tracking</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Monitor weight trends, predict market-ready dates, and optimize feed efficiency.
            </p>
          </div>

          {/* Feature 6: QR Code Scanner */}
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Icons.ScanLine size={32} color="var(--primary)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>QR Scanner</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Scan QR codes on animal tags to instantly pull up profiles and record data.
            </p>
          </div>

          {/* Feature 7: Inventory Management */}
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Icons.Package size={32} color="var(--warning)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Inventory & Supplies</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Track feed, medicines, vaccines, and supplies. Get alerts for low stock and expiry dates.
            </p>
          </div>

          {/* Feature 8: AI Assistant */}
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Icons.Lightbulb size={32} color="var(--warning)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>AI Farm Assistant</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Ask the AI chatbot (in Tagalog) for health advice, breeding tips, and farm management guidance.
            </p>
          </div>

          {/* Feature 9: Daily Alerts */}
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Icons.Calendar size={32} color="var(--critical)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Daily Alerts</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Prioritized task reminders, push notifications, and SMS/email summaries to stay on top of farm work.
            </p>
          </div>
        </div>
      </section>

      {/* System Flow Section */}
      <section style={{ padding: '80px 40px', background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 60, color: 'var(--text)' }}>
          How It Works
        </h2>

        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'grid', gap: 40 }}>
            {/* Step 1 */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--primary)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 800,
                flexShrink: 0,
              }}>
                1
              </div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Add Your Animals</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  Register each goat or sheep with species, breed, age, weight, and photos. Assign unique tag IDs for QR code scanning.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--primary)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 800,
                flexShrink: 0,
              }}>
                2
              </div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Record Daily Activities</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  Log health checks, weights, vaccinations, breeding events, feed records, and milk yields. Use the QR scanner for quick access.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--primary)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 800,
                flexShrink: 0,
              }}>
                3
              </div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Get AI Insights</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  The system analyzes your data using machine learning to detect health risks, predict breeding success, and suggest optimizations.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--primary)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 800,
                flexShrink: 0,
              }}>
                4
              </div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Act on Recommendations</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  Review daily alerts, smart recommendations, and health warnings. Take action (vaccinate, isolate, breed, restock) with confidence.
                </p>
              </div>
            </div>

            {/* Step 5 */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--primary)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 800,
                flexShrink: 0,
              }}>
                5
              </div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Measure & Report</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  View analytics, generate reports, and track progress over time. Share public animal profiles and export summaries.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Highlights */}
      <section style={{ padding: '80px 40px', background: 'var(--bg)' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 60, color: 'var(--text)' }}>
          Why Choose AlpasFarm?
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <TrendingUp size={40} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Data-Driven Decisions</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Machine learning models predict health risks, breeding success, and growth trends.</p>
          </div>

          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <BarChart3 size={40} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Detailed Analytics</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Charts, reports, and performance metrics to track farm health and productivity.</p>
          </div>

          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <AlertCircle size={40} color="var(--critical)" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Proactive Alerts</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Never miss vaccinations, kidding dates, or health emergencies with smart notifications.</p>
          </div>

          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <Smartphone size={40} color="var(--info)" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Mobile-Ready</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Access from any device. Built for farmers in the field with responsive design.</p>
          </div>

          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <Lightbulb size={40} color="var(--warning)" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>AI Chatbot (Tagalog)</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Get farming advice, disease information, and recommendations in your language.</p>
          </div>

          <div style={{ padding: 24, borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <Zap size={40} color="var(--healthy)" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Fast & Reliable</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Cloud-based with real-time sync. Your data is always secure and accessible.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{ padding: '80px 40px', background: 'var(--card)', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 20, color: 'var(--text)' }}>
          Ready to Transform Your Farm?
        </h2>
        <p style={{ fontSize: 16, marginBottom: 40, color: 'var(--text-secondary)' }}>
          Start managing your farm smarter today. Sign up and get your free account.
        </p>
        <button 
          className="btn btn-primary"
          onClick={() => navigate('/login')}
          style={{ padding: '14px 40px', fontSize: 16, fontWeight: 700 }}
        >
          Get Started Now
        </button>
      </section>

      {/* Footer */}
      <footer style={{ padding: '40px', background: 'var(--card)', borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
        <p>🐐 AlpasFarm — Smart Farm Management for Goats & Sheep</p>
        <p style={{ marginTop: 8 }}>© 2026. All rights reserved.</p>
      </footer>
    </div>
  );
}
