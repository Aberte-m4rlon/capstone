import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { generateRecommendations } from '../lib/recommendations';
import { FilterToolbar, FilterPill } from '../components/FilterToolbar';
import { Activity, Lightbulb, AlertTriangle, Clock, CheckCircle, ChevronRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

export function RecommendationsPage() {
  const farmData = useFarmData();
  const navigate = useNavigate();
  const [categoryFilter, setCategoryFilter] = useState('All');

  const { recommendations, priorities } = useMemo(
    () => generateRecommendations(
      farmData.animals, farmData.healthRecords, farmData.weightRecords,
      farmData.vaccinations, farmData.inventory, farmData.breedingRecords,
      farmData.settings ?? undefined,
    ),
    [farmData],
  );

  const categories = ['All', 'Health', 'Vaccination', 'Breeding', 'Inventory', 'Feed'];

  const filteredRecs = useMemo(() => {
    if (categoryFilter === 'All') return recommendations;
    return recommendations.filter((r) => r.category.toLowerCase().includes(categoryFilter.toLowerCase()));
  }, [recommendations, categoryFilter]);

  if (farmData.loading) return <LoadingSpinner fullScreen text="Analyzing recommendations..." />;

  const getSeverityBadgeVariant = (color: string): 'danger' | 'warning' | 'success' | 'info' | 'neutral' => {
    switch (color) {
      case 'red': return 'danger';
      case 'orange': return 'warning';
      case 'yellow': return 'warning';
      case 'green': return 'success';
      default: return 'info';
    }
  };

  const getSeverityIcon = (color: string) => {
    switch (color) {
      case 'red': return <AlertTriangle size={16} color="#FF3B30" />;
      case 'orange': return <AlertTriangle size={16} color="#FF7A18" />;
      case 'yellow': return <Clock size={16} color="#FF9F0A" />;
      case 'green': return <CheckCircle size={16} color="#FFB340" />;
      default: return <Lightbulb size={16} color="#FF7A18" />;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Smart Farm Assistant</h1>
        <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
          Recommendations are automatically generated from your farm data — not hardcoded.
        </p>
      </div>

      {/* Filter Toolbar */}
      <FilterToolbar>
        {categories.map((cat) => (
          <FilterPill
            key={cat}
            active={categoryFilter === cat}
            onClick={() => setCategoryFilter(cat)}
            label={cat}
            count={cat === 'All' ? recommendations.length : recommendations.filter((r) => r.category.toLowerCase().includes(cat.toLowerCase())).length}
          />
        ))}
      </FilterToolbar>

      {/* Today's Priorities */}
      <Card variant="glass" padding="none" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.08))' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Today's Priorities</div>
          <Activity size={20} color="#FF7A18" />
        </div>
        {priorities.length === 0 ? (
          <EmptyState
            icon={<CheckCircle size={32} color="#FFB340" />}
            title="All clear!"
            description="No urgent priorities right now. Your farm is in great shape."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {priorities.map((p, i) => (
              <div
                key={p.id}
                onClick={() => navigate(p.link)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 20px',
                  borderBottom: i < priorities.length - 1 ? '1px solid var(--border-light, rgba(255,255,255,0.04))' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-elevated, rgba(255,255,255,0.04))')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  background: p.severity === 'urgent' || p.severity === 'critical' ? 'rgba(255,59,48,0.15)' : 'rgba(255,159,10,0.15)',
                  color: p.severity === 'urgent' || p.severity === 'critical' ? '#FF3B30' : '#FF9F0A',
                  flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'inherit' }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginTop: 2 }}>{p.description}</div>
                </div>
                <ChevronRight size={16} color="var(--color-text-secondary, #475569)" />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* All Recommendations */}
      <Card variant="glass" padding="none">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.08))' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>All Recommendations</div>
          <Lightbulb size={20} color="#FF9F0A" />
        </div>
        {filteredRecs.length === 0 ? (
          <EmptyState
            icon={<CheckCircle size={32} color="#FFB340" />}
            title="No recommendations for this category"
            description="Everything looks good on your farm right now."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredRecs.map((rec, i) => (
              <div
                key={i}
                onClick={() => rec.link && navigate(rec.link)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '16px 20px',
                  borderBottom: i < filteredRecs.length - 1 ? '1px solid var(--border-light, rgba(255,255,255,0.04))' : 'none',
                  cursor: rec.link ? 'pointer' : 'default',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { if (rec.link) e.currentTarget.style.background = 'var(--color-surface-elevated, rgba(255,255,255,0.04))'; }}
                onMouseLeave={(e) => { if (rec.link) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ paddingTop: 2 }}>
                  {getSeverityIcon(rec.severity_color)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{rec.title}</span>
                    <Badge variant={getSeverityBadgeVariant(rec.severity_color)} size="sm">
                      {rec.category}
                    </Badge>
                  </div>
                  {rec.description && (
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #475569)', marginTop: 4, lineHeight: 1.4 }}>
                      {rec.description}
                    </div>
                  )}
                </div>
                {rec.link && <ChevronRight size={16} color="var(--color-text-secondary, #475569)" style={{ marginTop: 4 }} />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
