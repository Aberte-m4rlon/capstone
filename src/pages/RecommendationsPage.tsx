import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { generateRecommendations } from '../lib/recommendations';
import { Icons } from '../lib/icons';

export function RecommendationsPage() {
  const farmData = useFarmData();
  const navigate = useNavigate();

  const { recommendations, priorities } = useMemo(
    () => generateRecommendations(
      farmData.animals, farmData.healthRecords, farmData.weightRecords,
      farmData.vaccinations, farmData.inventory, farmData.breedingRecords,
      farmData.settings ?? undefined,
    ),
    [farmData],
  );

  if (farmData.loading) return <div className="loading-center"><div className="spinner" /></div>;

  const severityIcon = (color: string) => {
    switch (color) {
      case 'red': return <Icons.AlertTriangle size={16} color="#EF4444" />;
      case 'orange': return <Icons.AlertTriangle size={16} color="#F59E0B" />;
      case 'yellow': return <Icons.Clock size={16} color="#FBBF24" />;
      case 'green': return <Icons.CheckCircle size={16} color="#10B981" />;
      default: return <Icons.Lightbulb size={16} color="#3B82F6" />;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Smart Farm Assistant</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          Recommendations are automatically generated from your farm data — not hardcoded.
        </p>
      </div>

      {/* Today's Priorities */}
      <div className="card section-gap">
        <div className="card-header">
          <div className="card-title">Today's Priorities</div>
          <Icons.Activity size={20} color="#B91C1C" />
        </div>
        {priorities.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.CheckCircle size={24} /></div>
            <h4>All clear!</h4>
            <p>No urgent priorities right now. Your farm is in great shape.</p>
          </div>
        ) : (
          priorities.map((p, i) => (
            <div key={p.id} className="priority-item" onClick={() => navigate(p.link)}>
              <div className={`priority-num ${p.severity}`}>{i + 1}</div>
              <div className="priority-content">
                <div className="priority-title">{p.title}</div>
                <div className="priority-desc">{p.description}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* All Recommendations */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">All Recommendations</div>
          <Icons.Lightbulb size={20} color="#F59E0B" />
        </div>
        {recommendations.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.CheckCircle size={24} /></div>
            <h4>No recommendations needed</h4>
            <p>Everything looks good on your farm right now.</p>
          </div>
        ) : (
          recommendations.map((rec, i) => (
            <div key={i} className="rec-card" onClick={() => rec.link && navigate(rec.link)}>
              <div className={`rec-dot ${rec.severity_color}`}></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {severityIcon(rec.severity_color)}
                  <div className="rec-title">{rec.title}</div>
                </div>
                {rec.description && <div className="rec-desc" style={{ marginTop: 4 }}>{rec.description}</div>}
                <div style={{ marginTop: 4 }}>
                  <span className={`badge badge-${rec.severity_color === 'red' ? 'red' : rec.severity_color === 'orange' ? 'orange' : rec.severity_color === 'yellow' ? 'yellow' : rec.severity_color === 'green' ? 'green' : 'blue'}`}>
                    {rec.category}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
