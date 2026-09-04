import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { useAllScreenings } from '../lib/useCameraScreenings';
import { generateRecommendations } from '../lib/recommendations';
import {
  inventoryStatus,
  daysUntil,
  formatDate,
} from '../lib/analytics';
import {
  FARM_LABELS,
  formatMonthlyAnimalGrowth,
  HEALTH_TIERS,
  formatFarmerHealthConcern,
} from '../lib/farmerTerminology';
import {
  Plus, Brain, TrendingUp, AlertCircle, Layers,
  HeartPulse, PawPrint, Scale, Baby, Package, AlertTriangle,
  Lightbulb, Activity, CheckCircle2, ChevronRight, Syringe,
  ShieldAlert, Clock, Stethoscope, ArrowRight, DollarSign, Camera,
} from 'lucide-react';
import { useMLInsights } from '../lib/mlHooks';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { QuickActions } from '../components/ui/QuickActions';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

export function Dashboard() {
  const farmData = useFarmData();
  const { screenings: cameraScreenings } = useAllScreenings();
  const navigate = useNavigate();
  const { animals, healthRecords, weightRecords, vaccinations, inventory, breedingRecords, settings } = farmData;
  const mlInsights = useMLInsights();

  const activeAnimals = useMemo(() => animals.filter((a) => !a.archived), [animals]);

  // ── Interactive Species Filter State: 'All' | 'Goat' | 'Sheep' ──────────────
  const [speciesFilter, setSpeciesFilter] = useState<'All' | 'Goat' | 'Sheep'>('All');

  // Displayed animals based on active species filter
  const displayedAnimals = useMemo(() => {
    if (speciesFilter === 'Goat') {
      return activeAnimals.filter((a) => (a.species || '').toLowerCase() === 'goat');
    }
    if (speciesFilter === 'Sheep') {
      return activeAnimals.filter((a) => (a.species || '').toLowerCase() === 'sheep');
    }
    return activeAnimals;
  }, [activeAnimals, speciesFilter]);

  // Dedicated Species Breakdown (always calculates both goats and sheep)
  const speciesBreakdown = useMemo(() => {
    const goats = activeAnimals.filter((a) => (a.species || '').toLowerCase() === 'goat');
    const sheep = activeAnimals.filter((a) => (a.species || '').toLowerCase() === 'sheep');

    return {
      goat: {
        total: goats.length,
        male: goats.filter((a) => a.sex === 'Male').length,
        female: goats.filter((a) => a.sex === 'Female').length,
        healthy: goats.filter((a) => (a.health_status || 'Healthy') === 'Healthy').length,
        attention: goats.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical' || a.health_status === 'Monitor').length,
        pregnant: goats.filter((a) => a.breeding_status === 'Pregnant').length,
      },
      sheep: {
        total: sheep.length,
        male: sheep.filter((a) => a.sex === 'Male').length,
        female: sheep.filter((a) => a.sex === 'Female').length,
        healthy: sheep.filter((a) => (a.health_status || 'Healthy') === 'Healthy').length,
        attention: sheep.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical' || a.health_status === 'Monitor').length,
        pregnant: sheep.filter((a) => a.breeding_status === 'Pregnant').length,
      },
    };
  }, [activeAnimals]);

  // Current Calendar Context
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // ── 1. Herd Overview & Demographics ─────────────────────────────────────────
  const herdStats = useMemo(() => {
    const total = displayedAnimals.length;
    const goats = activeAnimals.filter((a) => (a.species || '').toLowerCase() === 'goat');
    const sheep = activeAnimals.filter((a) => (a.species || '').toLowerCase() === 'sheep');

    const females = displayedAnimals.filter((a) => a.sex === 'Female');
    const males = displayedAnimals.filter((a) => a.sex === 'Male');
    const pregnant = displayedAnimals.filter((a) => a.breeding_status === 'Pregnant');

    // Young animals (< 6 months / 180 days)
    const young = displayedAnimals.filter((a) => {
      if (!a.date_of_birth) return false;
      const dob = new Date(a.date_of_birth);
      const diffDays = (now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 180;
    });

    const newThisMonth = displayedAnimals.filter((a) => {
      if (!a.created_at) return false;
      const d = new Date(a.created_at);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;

    // Real Breed Distribution
    const goatBreedsMap: Record<string, number> = {};
    goats.forEach((g) => {
      const b = (g.breed || '').trim() || 'Native / Halo';
      goatBreedsMap[b] = (goatBreedsMap[b] || 0) + 1;
    });
    const goatBreeds = Object.entries(goatBreedsMap).sort((a, b) => b[1] - a[1]);

    const sheepBreedsMap: Record<string, number> = {};
    sheep.forEach((s) => {
      const b = (s.breed || '').trim() || 'Native / Halo';
      sheepBreedsMap[b] = (sheepBreedsMap[b] || 0) + 1;
    });
    const sheepBreeds = Object.entries(sheepBreedsMap).sort((a, b) => b[1] - a[1]);

    const avgWeight =
      total > 0
        ? +(displayedAnimals.reduce((s, a) => s + (Number(a.weight_kg) || 0), 0) / total).toFixed(1)
        : 0;

    const adultCount = Math.max(0, total - young.length);

    return {
      total,
      goatsCount: goats.length,
      sheepCount: sheep.length,
      femaleCount: females.length,
      maleCount: males.length,
      pregnantCount: pregnant.length,
      youngCount: young.length,
      adultCount,
      newThisMonth,
      goatBreeds,
      sheepBreeds,
      avgWeight,
    };
  }, [displayedAnimals, activeAnimals, currentYear, currentMonth]);

  // ── 2. Health Screening & Early Warning ─────────────────────────────────────
  const healthScreening = useMemo(() => {
    const highRisk: Array<{
      animal: typeof activeAnimals[0];
      record?: typeof healthRecords[0];
      concernText: string;
      actionText: string;
    }> = [];

    const moderateRisk: Array<{
      animal: typeof activeAnimals[0];
      record?: typeof healthRecords[0];
      concernText: string;
      actionText: string;
    }> = [];

    let healthyCount = 0;

    displayedAnimals.forEach((a) => {
      const records = healthRecords
        .filter((r) => r.animal_id === a.id)
        .sort((x, y) => new Date(y.record_date).getTime() - new Date(x.record_date).getTime());
      const latest = records[0];

      const score = Math.max(a.health_risk_score ?? 0, latest?.risk_score ?? 0);
      const status = a.health_status;

      const isHigh = status === 'Critical' || (status === 'At Risk' && score >= 50) || latest?.risk_level === 'High' || score >= 50;
      const isModerate = !isHigh && (status === 'Monitor' || status === 'At Risk' || latest?.risk_level === 'Moderate' || score >= 25);

      // Primary concern text
      const rawConcern = latest?.reasons?.[0] || (isHigh ? 'Nangangailangan ng pagsusuri (Needs Attention)' : isModerate ? 'Nangangailangan ng pagmamanman (Monitor)' : '');
      const formatted = formatFarmerHealthConcern(rawConcern);

      if (isHigh) {
        highRisk.push({ animal: a, record: latest, concernText: formatted.farmerText, actionText: formatted.actionText });
      } else if (isModerate) {
        moderateRisk.push({ animal: a, record: latest, concernText: formatted.farmerText, actionText: formatted.actionText });
      } else {
        healthyCount++;
      }
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const screenedTodayCount = (cameraScreenings || []).filter((s) => s.created_at && s.created_at.startsWith(todayStr)).length;

    return { highRisk, moderateRisk, healthyCount, screenedTodayCount };
  }, [displayedAnimals, healthRecords, cameraScreenings]);

  // ── 3. Breeding & Gestation ────────────────────────────────────────────────
  const breedingStats = useMemo(() => {
    const pregnant = displayedAnimals.filter((a) => a.breeding_status === 'Pregnant');

    // Females ready to breed (female, >=8 mos or standard weight, not pregnant)
    const readyToBreed = displayedAnimals.filter((a) => {
      if (a.sex !== 'Female' || a.breeding_status === 'Pregnant') return false;
      const dob = a.date_of_birth ? new Date(a.date_of_birth) : null;
      const ageMonths = dob ? (now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 30.4) : 12;
      const wt = Number(a.weight_kg) || 0;
      return ageMonths >= 8 && (wt === 0 || wt >= 25);
    });

    // Imminent kidding within next 30 days
    const nearKidding = pregnant
      .filter((a) => {
        if (!a.expected_kidding_date) return false;
        const days = daysUntil(a.expected_kidding_date);
        return days >= 0 && days <= 30;
      })
      .sort((x, y) => daysUntil(x.expected_kidding_date!) - daysUntil(y.expected_kidding_date!));

    // Newly kidded in the last 60 days
    const displayedAnimalIds = new Set(displayedAnimals.map((a) => a.id));
    const recentKidding = breedingRecords.filter((b) => {
      if (b.status !== 'Kidded' || !b.actual_kidding_date) return false;
      if (speciesFilter !== 'All' && !displayedAnimalIds.has(b.animal_id)) return false;
      const kidDate = new Date(b.actual_kidding_date);
      const diffDays = (now.getTime() - kidDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 60;
    });

    const activeMatingCount = breedingRecords.filter((b) => {
      if (b.status !== 'Planned' && b.status !== 'Pregnant') return false;
      if (speciesFilter !== 'All' && !displayedAnimalIds.has(b.animal_id)) return false;
      return true;
    }).length;

    return {
      pregnantCount: pregnant.length,
      readyToBreedCount: readyToBreed.length,
      nearKidding,
      recentKiddingCount: recentKidding.length,
      activeMatingCount,
    };
  }, [displayedAnimals, breedingRecords, speciesFilter]);

  // ── 4. Vaccination Tracking ────────────────────────────────────────────────
  const vaccineStats = useMemo(() => {
    const dueSoon = displayedAnimals.filter((a) => a.vaccination_status === 'Due Soon');
    const overdue = displayedAnimals.filter((a) => a.vaccination_status === 'Overdue');
    const displayedAnimalIds = new Set(displayedAnimals.map((a) => a.id));

    const givenThisMonth = vaccinations.filter((v) => {
      if (!v.date_given) return false;
      if (speciesFilter !== 'All' && !displayedAnimalIds.has(v.animal_id)) return false;
      const d = new Date(v.date_given);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;

    // Upcoming urgent schedule items
    const upcomingSchedule = vaccinations
      .filter((v) => {
        if (!v.next_due_date) return false;
        if (speciesFilter !== 'All' && !displayedAnimalIds.has(v.animal_id)) return false;
        const days = daysUntil(v.next_due_date);
        return days >= 0 && days <= 30;
      })
      .sort((a, b) => daysUntil(a.next_due_date!) - daysUntil(b.next_due_date!))
      .slice(0, 4);

    return { dueSoon, overdue, givenThisMonth, upcomingSchedule };
  }, [displayedAnimals, vaccinations, speciesFilter, currentYear, currentMonth]);

  // ── 5. Inventory & Finances ────────────────────────────────────────────────
  const inventoryStats = useMemo(() => {
    const totalItems = inventory.length;
    let lowStockCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;
    let currentInventoryValue = 0;

    inventory.forEach((item) => {
      const st = inventoryStatus(item, settings?.expiry_warning_days ?? 15);
      if (st.status === 'Low Stock' || (item.minimum_stock && item.quantity <= item.minimum_stock)) {
        lowStockCount++;
      }
      if (st.status === 'Expiring Soon') expiringCount++;
      if (st.status === 'Expired') expiredCount++;
      currentInventoryValue += (item.quantity || 0) * (item.cost || 0);
    });

    // Real financials from inventory_transactions
    let spentThisMonth = 0;
    let consumedValueMonth = 0;

    farmData.inventoryTransactions.forEach((tx) => {
      if (!tx.created_at) return;
      const txDate = new Date(tx.created_at);
      if (txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth) {
        const cost = tx.cost_per_unit ?? 0;
        if (tx.type === 'STOCK_IN' || tx.type === 'RETURN') {
          spentThisMonth += (tx.quantity || 0) * cost;
        } else if (tx.type === 'CONSUMPTION') {
          consumedValueMonth += (tx.quantity || 0) * cost;
        }
      }
    });

    return {
      totalItems,
      lowStockCount,
      expiringCount,
      expiredCount,
      spentThisMonth,
      consumedValueMonth,
      currentInventoryValue,
    };
  }, [inventory, farmData.inventoryTransactions, settings, currentYear, currentMonth]);

  // ── Smart Recommendations & Ranked Priorities ─────────────────────────────
  const { recommendations, priorities } = useMemo(
    () => generateRecommendations(animals, healthRecords, weightRecords, vaccinations, inventory, breedingRecords, settings ?? undefined),
    [animals, healthRecords, weightRecords, vaccinations, inventory, breedingRecords, settings]
  );

  // Health Trend Chart Data (Last 30 Days)
  const healthTrendData = useMemo(() => {
    const days: string[] = [];
    const counts: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      days.push(label);
      const dayStr = d.toISOString().split('T')[0];
      const count = healthRecords.filter((r) => r.record_date === dayStr).length;
      counts.push(count);
    }
    return { labels: days, counts };
  }, [healthRecords]);

  // Taglish Greeting
  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return 'Magandang umaga';
    if (h < 18) return 'Magandang hapon';
    return 'Magandang gabi';
  }, []);

  if (farmData.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <LoadingSpinner size="lg" text="Kinakarga ang buod ng iyong bukid..." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingBottom: 32 }}>
      {/* ── HEADER: Salutation & Subtitle ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 800,
              color: 'var(--color-text-primary, #0F172A)',
              letterSpacing: '-0.02em',
            }}
          >
            {FARM_LABELS.dashboardQuestion}
          </h1>
          <Badge variant="primary" size="sm">
            {FARM_LABELS.dashboardTitle}
          </Badge>
        </div>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary, #475569)' }}>
          {greeting}, Farmer! Narito ang pangkalahatang kalagayan at mga gawain sa iyong bukid ngayong araw.
        </p>
      </div>

      {/* ── QUICK ACTIONS ROW ──────────────────────────────────────────────── */}
      <QuickActions
        actions={[
          { label: 'Magdagdag ng Hayop', to: '/animals', icon: <Plus size={14} className="qa-plus-icon" /> },
          { label: 'Suriin ang Kalusugan', to: '/health', icon: <Stethoscope size={14} className="qa-plus-icon" /> },
          { label: 'Magtala ng Timbang', to: '/weights', icon: <Scale size={14} className="qa-plus-icon" /> },
          { label: 'Pagpaparami', to: '/breeding', icon: <Baby size={14} className="qa-plus-icon" /> },
          { label: 'Magtala ng Bakuna', to: '/vaccinations', icon: <Syringe size={14} className="qa-plus-icon" /> },
          { label: 'Kagamitan at Supplies', to: '/inventory', icon: <Package size={14} className="qa-plus-icon" /> },
        ]}
      />

      {/* ── SPECIES QUICK FILTER TOOLBAR ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 18px',
          borderRadius: 16,
          background: 'var(--color-surface, #FFFFFF)',
          border: '1px solid var(--color-border, rgba(226, 232, 240, 0.8))',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={18} color="var(--color-primary, #FF6A2A)" />
          <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
            Salain Ayon sa Hayop (Filter by Species):
          </span>
        </div>
        <div style={{ display: 'inline-flex', background: 'rgba(0, 0, 0, 0.04)', borderRadius: 12, padding: 3, gap: 4 }}>
          <button
            type="button"
            onClick={() => setSpeciesFilter('All')}
            style={{
              padding: '6px 16px',
              borderRadius: 9,
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: speciesFilter === 'All' ? 'var(--color-primary, #FF6A2A)' : 'transparent',
              color: speciesFilter === 'All' ? '#FFFFFF' : 'var(--color-text-secondary, #475569)',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Layers size={14} /> Lahat (All) ({activeAnimals.length})
          </button>
          <button
            type="button"
            onClick={() => setSpeciesFilter('Goat')}
            style={{
              padding: '6px 16px',
              borderRadius: 9,
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: speciesFilter === 'Goat' ? 'var(--color-primary, #FF6A2A)' : 'transparent',
              color: speciesFilter === 'Goat' ? '#FFFFFF' : 'var(--color-text-secondary, #475569)',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Layers size={14} /> Kambing ({speciesBreakdown.goat.total})
          </button>
          <button
            type="button"
            onClick={() => setSpeciesFilter('Sheep')}
            style={{
              padding: '6px 16px',
              borderRadius: 9,
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: speciesFilter === 'Sheep' ? 'var(--color-primary, #FF6A2A)' : 'transparent',
              color: speciesFilter === 'Sheep' ? '#FFFFFF' : 'var(--color-text-secondary, #475569)',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Layers size={14} /> Tupa ({speciesBreakdown.sheep.total})
          </button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: MGA HAYOP SA BUKID (Herd Breakdown)                      */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={20} color="var(--color-primary, #FF6A2A)" />
              <span>{FARM_LABELS.animalsSection}</span>
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #64748B)' }}>
              Bilang at uri ng kambing at tupa na kasalukuyang nasa bukid
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/animals')} style={{ gap: 6 }}>
            <span>Tingnan ang Lahat ng Hayop</span>
            <ChevronRight size={15} />
          </Button>
        </div>

        {/* Herd Summary: Goats | Sheep | Total (Strictly 3 Columns) */}
        <div className="dashboard-stats-3col">
          {/* Goats */}
          <div
            onClick={() => navigate('/animals?species=Goat')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: 'var(--color-primary, #FF6A2A)' }}>
                {FARM_LABELS.cardGoats}
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(255, 106, 42, 0.12)', color: 'var(--color-primary, #FF6A2A)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: 'var(--color-text-primary, #0F172A)' }}>
                {herdStats.goatsCount}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted, #64748B)' }}>
                {herdStats.total > 0 ? `${Math.round((herdStats.goatsCount / herdStats.total) * 100)}% ng bukid` : '0%'}
              </div>
            </div>
          </div>

          {/* Sheep */}
          <div
            onClick={() => navigate('/animals?species=Sheep')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#3B82F6' }}>
                {FARM_LABELS.cardSheep}
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: 'var(--color-text-primary, #0F172A)' }}>
                {herdStats.sheepCount}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted, #64748B)' }}>
                {herdStats.total > 0 ? `${Math.round((herdStats.sheepCount / herdStats.total) * 100)}% ng bukid` : '0%'}
              </div>
            </div>
          </div>

          {/* Total Active Herd */}
          <div
            onClick={() => navigate('/animals')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(67, 160, 71, 0.12), rgba(67, 160, 71, 0.03))',
              border: '1px solid rgba(67, 160, 71, 0.3)',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#2E7D32' }}>
                {FARM_LABELS.cardTotalAnimals}
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(67, 160, 71, 0.15)', color: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PawPrint size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#2E7D32' }}>
                {herdStats.total}
              </div>
              <div className="alpas-stat-footer" style={{ color: herdStats.newThisMonth > 0 ? '#10B981' : 'var(--color-text-muted, #64748B)' }}>
                {formatMonthlyAnimalGrowth(herdStats.newThisMonth)}
              </div>
            </div>
          </div>
        </div>

        {/* Demographics Summary: Male | Female | Young (Strictly 3 Columns) */}
        <div className="dashboard-stats-3col">
          {/* Male */}
          <div
            onClick={() => navigate('/animals?gender=Male')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#3B82F6' }}>
                Lalaki (Male)
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PawPrint size={15} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#3B82F6' }}>
                {herdStats.maleCount}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Barako / Toro
              </div>
            </div>
          </div>

          {/* Female */}
          <div
            onClick={() => navigate('/animals?gender=Female')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#EC4899' }}>
                Babae (Female)
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(236, 72, 153, 0.12)', color: '#EC4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PawPrint size={15} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#EC4899' }}>
                {herdStats.femaleCount}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Inahin ({herdStats.pregnantCount} buntis)
              </div>
            </div>
          </div>

          {/* Young */}
          <div
            onClick={() => navigate('/animals')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#10B981' }}>
                Bata (Young)
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Baby size={15} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#10B981' }}>
                {herdStats.youngCount}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Bisiro / Kids / Lambs
              </div>
            </div>
          </div>
        </div>

        {/* Dedicated Species Breakdown: Goats vs Sheep Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 4 }}>
          {/* Goat Detailed Breakdown */}
          <div
            onClick={() => setSpeciesFilter(speciesFilter === 'Goat' ? 'All' : 'Goat')}
            style={{
              padding: '16px 18px',
              borderRadius: 18,
              background: 'var(--color-surface, #FFFFFF)',
              border: speciesFilter === 'Goat' ? '2px solid var(--color-primary, #FF6A2A)' : '1px solid var(--color-border, rgba(226, 232, 240, 0.7))',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Layers size={17} color="var(--color-primary, #FF6A2A)" />
                Kabuuan ng mga Kambing (Goats)
              </span>
              <Badge variant="primary" size="sm">{speciesBreakdown.goat.total} Ulo</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: '12.5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, color: '#3B82F6' }}>{speciesBreakdown.goat.male}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>Lalaki (Male)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, color: '#EC4899' }}>{speciesBreakdown.goat.female}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>Babae (Female)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, color: '#10B981' }}>{speciesBreakdown.goat.healthy}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>Malusog</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, color: speciesBreakdown.goat.attention > 0 ? '#EF4444' : '#64748B' }}>{speciesBreakdown.goat.attention}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>Kailangan Bantayan</span>
              </div>
            </div>
          </div>

          {/* Sheep Detailed Breakdown */}
          <div
            onClick={() => setSpeciesFilter(speciesFilter === 'Sheep' ? 'All' : 'Sheep')}
            style={{
              padding: '16px 18px',
              borderRadius: 18,
              background: 'var(--color-surface, #FFFFFF)',
              border: speciesFilter === 'Sheep' ? '2px solid #3B82F6' : '1px solid var(--color-border, rgba(226, 232, 240, 0.7))',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Layers size={17} color="#3B82F6" />
                Kabuuan ng mga Tupa (Sheep)
              </span>
              <Badge variant="info" size="sm">{speciesBreakdown.sheep.total} Ulo</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: '12.5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, color: '#3B82F6' }}>{speciesBreakdown.sheep.male}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>Lalaki (Male)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, color: '#EC4899' }}>{speciesBreakdown.sheep.female}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>Babae (Female)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, color: '#10B981' }}>{speciesBreakdown.sheep.healthy}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>Malusog</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, color: speciesBreakdown.sheep.attention > 0 ? '#EF4444' : '#64748B' }}>{speciesBreakdown.sheep.attention}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>Kailangan Bantayan</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: KALAGAYAN NG MGA HAYOP (Health Screening & Early Warning)*/}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Stethoscope size={20} color="var(--color-primary, #FF6A2A)" />
                <span>{FARM_LABELS.healthSection}</span>
              </h2>
              <Badge variant="info" size="sm">
                Early Warning System
              </Badge>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--color-text-secondary, #64748B)' }}>
              {FARM_LABELS.healthDisclaimer}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/health')} style={{ gap: 6 }}>
            <span>Pumunta sa Kalusugan</span>
            <ChevronRight size={15} />
          </Button>
        </div>

        {/* 3 AI Health Monitoring Status Cards (Strictly 3 Columns) */}
        <div className="dashboard-stats-3col">
          {/* Healthy */}
          <div
            onClick={() => navigate('/health?filter=Healthy')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: HEALTH_TIERS.Low.bg,
              border: `1px solid ${HEALTH_TIERS.Low.border}`,
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: HEALTH_TIERS.Low.color }}>
                Healthy
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(22, 163, 74, 0.15)', color: HEALTH_TIERS.Low.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HeartPulse size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: HEALTH_TIERS.Low.color }}>
                {healthScreening.healthyCount}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-secondary)' }}>
                {herdStats.total > 0
                  ? `${Math.round((healthScreening.healthyCount / herdStats.total) * 100)}% ng bukid`
                  : 'Malusog'}
              </div>
            </div>
          </div>

          {/* Moderate Risk / Monitoring Tier */}
          <div
            onClick={() => navigate('/health?filter=Monitor')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: HEALTH_TIERS.Moderate.bg,
              border: `1px solid ${HEALTH_TIERS.Moderate.border}`,
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: HEALTH_TIERS.Moderate.color }}>
                {FARM_LABELS.cardMonitoring}
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: HEALTH_TIERS.Moderate.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: HEALTH_TIERS.Moderate.color }}>
                {healthScreening.moderateRisk.length}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-secondary)' }}>
                Obserbahan sa bukid
              </div>
            </div>
          </div>

          {/* High Risk / Needs Attention Tier */}
          <div
            onClick={() => navigate('/health?filter=Critical')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: HEALTH_TIERS.High.bg,
              border: `1px solid ${HEALTH_TIERS.High.border}`,
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: HEALTH_TIERS.High.color }}>
                {FARM_LABELS.cardNeedsAttention}
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: HEALTH_TIERS.High.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: HEALTH_TIERS.High.color }}>
                {healthScreening.highRisk.length}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-secondary)' }}>
                Atensyon ng Vet
              </div>
            </div>
          </div>
        </div>

        {/* Actionable Sick Animals Attention List */}
        {(healthScreening.highRisk.length > 0 || healthScreening.moderateRisk.length > 0) && (
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 16,
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} color="#F59E0B" />
                <span>Mga Hayop na Nangangailangan ng Pagsusuri Ngayong Araw:</span>
              </span>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                {healthScreening.highRisk.length + healthScreening.moderateRisk.length} alaga
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
              {[...healthScreening.highRisk, ...healthScreening.moderateRisk].slice(0, 4).map((item) => (
                <div
                  key={item.animal.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Layers size={16} color="var(--color-primary, #FF6A2A)" />
                        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                          {item.animal.name} ({item.animal.tag_id})
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        {item.animal.species} • {item.animal.breed ?? 'Native'} • {item.animal.sex}
                      </div>
                    </div>
                    <Badge variant={item.animal.health_status === 'Critical' ? 'danger' : 'warning'} size="sm">
                      {item.animal.health_status}
                    </Badge>
                  </div>

                  {/* Observed Sign / Recommendation */}
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 600, color: '#F59E0B' }}>{item.concernText}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 2 }}>
                      Payo: {item.actionText}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {item.record ? `Sinuri: ${formatDate(item.record.record_date)}` : 'Wala pang rekord'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => navigate(`/animals/${item.animal.id}`)}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                      >
                        Profile
                      </button>
                      <button
                        onClick={() => navigate('/health')}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                      >
                        Suriin Muli
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: PAGPAPARAMI (Breeding & Gestation Tracking)               */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Baby size={20} color="#F59E0B" />
              <span>{FARM_LABELS.breedingSection}</span>
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #64748B)' }}>
              Pagbubuntis, pagpapareha, at inaasahang panganganak (150 araw na gestation)
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/breeding')} style={{ gap: 6 }}>
            <span>Pumunta sa Pagpaparami</span>
            <ChevronRight size={15} />
          </Button>
        </div>

        {/* Breeding Stats Cards Grid: Strictly 3 Columns on Mobile */}
        <div className="mobile-stats-grid-3">
          {/* Pregnant */}
          <div
            onClick={() => navigate('/breeding')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#F59E0B' }}>
                Mga Buntis
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Baby size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#F59E0B' }}>
                {breedingStats.pregnantCount} <span style={{ fontSize: '11px', fontWeight: 600 }}>ulo</span>
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                {breedingStats.nearKidding.length > 0
                  ? `${breedingStats.nearKidding.length} malapit na`
                  : 'Inahing buntis'}
              </div>
            </div>
          </div>

          {/* Ready to Breed */}
          <div
            onClick={() => navigate('/breeding')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#EC4899' }}>
                Handa sa Pagpapalahi
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(236, 72, 153, 0.12)', color: '#EC4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PawPrint size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#EC4899' }}>
                {breedingStats.readyToBreedCount} <span style={{ fontSize: '11px', fontWeight: 600 }}>babae</span>
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Edad 8+ buwan
              </div>
            </div>
          </div>

          {/* Active Breeding Records */}
          <div
            onClick={() => navigate('/breeding')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#3B82F6' }}>
                May Rekord ng Pagtatalik
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#3B82F6' }}>
                {breedingStats.activeMatingCount} <span style={{ fontSize: '11px', fontWeight: 600 }}>rekord</span>
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Nakatakda
              </div>
            </div>
          </div>
        </div>

        {/* Dedicated Full-Width Card: Bagong Panganak */}
        <div
          onClick={() => navigate('/breeding')}
          style={{
            padding: '12px 16px',
            borderRadius: 14,
            background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
            border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10B981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Bagong Panganak
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Nanganak nitong nakaraang 60 araw
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#10B981', lineHeight: 1 }}>
              {breedingStats.recentKiddingCount}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#10B981' }}>ina</span>
          </div>
        </div>

        {/* Expected Kidding Spotlight */}
        {breedingStats.nearKidding.length > 0 && (
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05))',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Clock size={22} color="#F59E0B" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {breedingStats.nearKidding.length} Buntis ang Malapit Nang Manganak (Kidding Due Soon)
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Susunod: <strong>{breedingStats.nearKidding[0].name} ({breedingStats.nearKidding[0].tag_id})</strong> — Inaasahan sa {formatDate(breedingStats.nearKidding[0].expected_kidding_date!)} ({daysUntil(breedingStats.nearKidding[0].expected_kidding_date!)} araw na lang)
                </div>
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={() => navigate('/breeding')}>
              Ihanda ang Kidding Pen
            </Button>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: BAKUNA AT OPERASYON (Operations & Action Alerts)         */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Syringe size={20} color="var(--color-primary, #FF6A2A)" />
              <span>{FARM_LABELS.vaccinationSection}</span>
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #64748B)' }}>
              Proteksyon laban sa sakit, bakuna, at alerto sa imbentaryo
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/vaccinations')} style={{ gap: 6 }}>
            <span>Tingnan ang Bakuna</span>
            <ChevronRight size={15} />
          </Button>
        </div>

        {/* 3 Operations Cards: Vaccines Due | Low Stock | Expiring (Strictly 3 Columns) */}
        <div className="dashboard-stats-3col">
          {/* Vaccines Due */}
          <div
            onClick={() => navigate('/vaccinations?filter=Due Soon')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#F59E0B' }}>
                {FARM_LABELS.cardVaccineDueSoon}
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#F59E0B' }}>
                {vaccineStats.dueSoon.length + vaccineStats.overdue.length}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                {vaccineStats.overdue.length > 0 ? `${vaccineStats.overdue.length} overdue` : 'Nakatakda'}
              </div>
            </div>
          </div>

          {/* Low Stock */}
          <div
            onClick={() => navigate('/inventory')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#EF4444' }}>
                {FARM_LABELS.cardLowStock}
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#EF4444' }}>
                {inventoryStats.lowStockCount}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Mag-restock
              </div>
            </div>
          </div>

          {/* Expiring Soon */}
          <div
            onClick={() => navigate('/inventory')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#3B82F6' }}>
                {FARM_LABELS.cardExpiringSoon}
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#3B82F6' }}>
                {inventoryStats.expiringCount}
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Sa loob ng 60 araw
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: MGA KAGAMITAN AT SUPPLIES (Inventory & Financial Impact) */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={20} color="var(--color-primary, #FF6A2A)" />
              <span>{FARM_LABELS.inventorySection}</span>
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #64748B)' }}>
              Bulto ng feeds, gamot, bakuna, at aktwal na gastos sa bukid
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/inventory')} style={{ gap: 6 }}>
            <span>Pamahalaan ang Imbentaryo</span>
            <ChevronRight size={15} />
          </Button>
        </div>

        {/* Stock Status Cards (Strictly 3 Columns on Mobile) */}
        <div className="dashboard-stats-3col">
          {/* Total Items */}
          <div
            onClick={() => navigate('/inventory')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: '#3B82F6' }}>
                Kabuuang Gamit
              </span>
              <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: '#3B82F6' }}>
                {inventoryStats.totalItems} <span style={{ fontSize: '11px', fontWeight: 600 }}>uri</span>
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Aktibo sa bodega
              </div>
            </div>
          </div>

          {/* Low Stock */}
          <div
            onClick={() => navigate('/inventory')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: inventoryStats.lowStockCount > 0 ? 'rgba(245, 158, 11, 0.12)' : 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: inventoryStats.lowStockCount > 0 ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: inventoryStats.lowStockCount > 0 ? '#F59E0B' : 'var(--color-text-primary)' }}>
                {FARM_LABELS.cardLowStock}
              </span>
              <div className="stat-card-icon" style={{ background: inventoryStats.lowStockCount > 0 ? 'rgba(245, 158, 11, 0.20)' : 'rgba(100, 116, 139, 0.12)', color: inventoryStats.lowStockCount > 0 ? '#F59E0B' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: inventoryStats.lowStockCount > 0 ? '#F59E0B' : 'var(--color-text-primary)' }}>
                {inventoryStats.lowStockCount} <span style={{ fontSize: '11px', fontWeight: 600 }}>gamit</span>
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Kailangang i-restock
              </div>
            </div>
          </div>

          {/* Expiring Soon */}
          <div
            onClick={() => navigate('/inventory')}
            className="stat-card"
            style={{
              cursor: 'pointer',
              background: inventoryStats.expiringCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-surface, rgba(255, 255, 255, 0.05))',
              border: inventoryStats.expiringCount > 0 ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            }}
          >
            <div className="alpas-stat-header">
              <span className="stat-card-label" style={{ fontWeight: 700, color: inventoryStats.expiringCount > 0 ? '#EF4444' : 'var(--color-text-primary)' }}>
                {FARM_LABELS.cardExpiringSoon}
              </span>
              <div className="stat-card-icon" style={{ background: inventoryStats.expiringCount > 0 ? 'rgba(239, 68, 68, 0.20)' : 'rgba(100, 116, 139, 0.12)', color: inventoryStats.expiringCount > 0 ? '#EF4444' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={16} />
              </div>
            </div>
            <div>
              <div className="stat-card-value" style={{ color: inventoryStats.expiringCount > 0 ? '#EF4444' : 'var(--color-text-primary)' }}>
                {inventoryStats.expiringCount} <span style={{ fontSize: '11px', fontWeight: 600 }}>gamit</span>
              </div>
              <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
                Loob ng 15 araw
              </div>
            </div>
          </div>
        </div>

        {/* Dedicated Full-Width Financial Summary Card */}
        <div
          onClick={() => navigate('/inventory')}
          style={{
            padding: '12px 16px',
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04))',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.20)',
                color: '#10B981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <DollarSign size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#10B981' }}>
                Halaga ng Natitirang Stock
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Batay sa aktwal na bulto at presyo
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981', lineHeight: 1 }}>
              ₱{inventoryStats.currentInventoryValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Real Monthly Financial Overview Banner */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 16,
            background: 'var(--color-surface, rgba(255, 255, 255, 0.05))',
            border: '1px solid var(--color-border, rgba(226, 232, 240, 0.2))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block' }}>
                Bilihin Ngayong Buwan (Purchases):
              </span>
              <span style={{ fontSize: '17px', fontWeight: 800, color: '#3B82F6' }}>
                ₱{inventoryStats.spentThisMonth.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ width: 1, height: 32, background: 'var(--color-border, rgba(226, 232, 240, 0.2))' }} />

            <div>
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block' }}>
                Nagamit sa Bukid Ngayong Buwan (Usage/Feeds/Vaccines):
              </span>
              <span style={{ fontSize: '17px', fontWeight: 800, color: '#F59E0B' }}>
                ₱{inventoryStats.consumedValueMonth.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate('/inventory')}
            className="btn btn-ghost btn-sm"
            style={{ gap: 6, fontSize: '12px' }}
          >
            <span>Tingnan ang Log ng Transaksyon</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: MGA ALERTO AT GAWAIN SA BUKID (Alerts & Priorities)      */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div className="dashboard-charts-grid">
        {/* Farm Recommendations */}
        <Card variant="default" padding="lg">
          <CardHeader
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lightbulb size={18} color="var(--color-primary, #FF6A2A)" />
                <span>Mga Mungkahi sa Bukid (Recommendations)</span>
              </div>
            }
            subtitle="Kalkulasyon mula sa rekord ng hayop at imbentaryo"
          />
          <CardContent>
            {recommendations.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={32} />}
                title="Maayos ang lahat"
                description="Walang agarang babala o kailangang ayusin sa bukid ngayon."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recommendations.slice(0, 4).map((rec, i) => (
                  <div
                    key={i}
                    onClick={() => rec.link && navigate(rec.link)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md, 14px)',
                      background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
                      border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
                      cursor: rec.link ? 'pointer' : 'default',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background:
                          rec.severity_color === 'red'
                            ? 'var(--color-danger, #EF4444)'
                            : rec.severity_color === 'orange'
                            ? 'var(--color-warning, #F59E0B)'
                            : 'var(--color-primary, #FF6A2A)',
                        marginTop: 6,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                        {rec.title}
                      </div>
                      {rec.description && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)', marginTop: 2, lineHeight: 1.4 }}>
                          {rec.description}
                        </div>
                      )}
                    </div>
                    {rec.link && <ChevronRight size={16} color="var(--color-text-muted, #94A3B8)" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Priorities */}
        <Card variant="default" padding="lg">
          <CardHeader
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={18} color="var(--color-primary, #FF6A2A)" />
                <span>Pangunahing Gawain Ngayong Araw</span>
              </div>
            }
            subtitle="Mga gawain ayon sa prayoridad at takdang oras"
          />
          <CardContent>
            {priorities.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={32} />}
                title="Tapos ang lahat ng gawain"
                description="Walang nakabinbing paalala o overdue na operasyon sa bukid."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {priorities.slice(0, 4).map((p, i) => (
                  <div
                    key={p.id}
                    onClick={() => p.link && navigate(p.link)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md, 14px)',
                      background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
                      border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
                      cursor: p.link ? 'pointer' : 'default',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 'var(--radius-xs, 6px)',
                        background: 'rgba(255, 106, 42, 0.12)',
                        color: 'var(--color-primary, #FF6A2A)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)', marginTop: 2, lineHeight: 1.4 }}>
                        {p.description}
                      </div>
                    </div>
                    {p.link && <ChevronRight size={16} color="var(--color-text-muted, #94A3B8)" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Visual Analytics & Health Activity Chart (Collapsible / Trend) ── */}
      <Card variant="default" padding="lg">
        <CardHeader
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} color="var(--color-primary, #FF6A2A)" />
              <span>Talaan ng Pagsusuri sa Kalusugan (Health Check Activity)</span>
            </div>
          }
          subtitle="Bilang ng mga pagsusuring naisagawa nitong nakaraang 30 araw"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/health')}>
              Tingnan ang Talaan
            </Button>
          }
        />
        <CardContent>
          {healthTrendData.counts.every((c) => c === 0) ? (
            <EmptyState
              icon={<HeartPulse size={36} />}
              title="Wala pang naitalang pagsusuri"
              description="Magsagawa ng regular na pagsusuri sa iyong mga kambing at tupa upang makita ang takbo ng kalusugan."
              actionLabel="Magtala ng Pagsusuri"
              onAction={() => navigate('/health')}
            />
          ) : (
            <div style={{ height: 240 }}>
              <Line
                data={{
                  labels: healthTrendData.labels,
                  datasets: [
                    {
                      label: 'Pagsusuri',
                      data: healthTrendData.counts,
                      borderColor: '#FF6A2A',
                      backgroundColor: 'rgba(255, 106, 42, 0.12)',
                      fill: true,
                      tension: 0.35,
                      pointRadius: 3,
                      pointBackgroundColor: '#FF6A2A',
                      pointBorderColor: '#FFFFFF',
                      pointBorderWidth: 2,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { precision: 0 },
                      grid: { color: 'rgba(148, 163, 184, 0.12)' },
                    },
                    x: { grid: { display: false } },
                  },
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
