import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HeartPulse,
  Activity,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Download,
  Printer,
  Plus,
  Stethoscope,
  Pill,
  Syringe,
  Bug,
  Bell,
  Sparkles,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import { useFarmData } from '../../../lib/useFarmData';
import { useAuth } from '../../../lib/auth';
import { useToast } from '../../ui/Toast';
import { Button } from '../../ui/Button';
import { HealthAlertCenter } from './HealthAlertCenter';
import type { Animal, HealthAssessment, HealthCase, TreatmentRecord, DewormingRecord } from '../../../types';

interface AnimalHealthDashboardProps {
  onOpenAssessmentModal: () => void;
  onOpenCaseModal: () => void;
  onOpenTreatmentModal: () => void;
  onOpenDewormingModal: () => void;
  onSelectAnimal?: (animalId: string) => void;
}

export function AnimalHealthDashboard({
  onOpenAssessmentModal,
  onOpenCaseModal,
  onOpenTreatmentModal,
  onOpenDewormingModal,
  onSelectAnimal,
}: AnimalHealthDashboardProps) {
  const {
    animals,
    healthAssessments,
    healthCases,
    treatmentRecords,
    dewormingRecords,
    healthAlerts,
  } = useFarmData();

  const navigate = useNavigate();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'assessments' | 'cases' | 'treatments' | 'deworming' | 'alerts'>('assessments');
  const [searchQuery, setSearchQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<'All' | 'Goat' | 'Sheep'>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dateRangeFilter, setDateRangeFilter] = useState<'7d' | '30d' | 'all'>('30d');

  // Animal map for fast reference
  const animalMap = useMemo(() => {
    const map = new Map<string, Animal>();
    animals.forEach((a) => map.set(a.id, a));
    return map;
  }, [animals]);

  // Real-time Supabase Computed Statistics
  const stats = useMemo(() => {
    const total = animals.length;
    const goats = animals.filter((a) => a.species === 'Goat').length;
    const sheep = animals.filter((a) => a.species === 'Sheep').length;

    const healthy = animals.filter((a) => !a.health_status || a.health_status === 'Healthy').length;
    const monitor = animals.filter((a) => a.health_status === 'Monitor').length;
    const highRisk = animals.filter(
      (a) => a.health_status === 'Critical' || a.health_status === 'At Risk' || ((a.health_risk_score ?? 0) >= 65)
    ).length;

    const activeTreatments = treatmentRecords.filter((t) => t.status === 'Ongoing' || t.status === 'Scheduled').length;

    // Overdue follow-ups
    const today = new Date().toISOString().split('T')[0];
    const overdueCases = healthCases.filter((c) => c.follow_up_date && c.follow_up_date < today && c.case_status !== 'Closed' && c.case_status !== 'Recovered').length;
    const overdueDeworming = dewormingRecords.filter((d) => d.next_due_date && d.next_due_date < today && d.status !== 'Completed').length;
    const totalOverdue = overdueCases + overdueDeworming;

    const unresolvedAlerts = healthAlerts.filter((a) => !a.is_resolved).length;
    const criticalAlerts = healthAlerts.filter((a) => a.severity === 'critical' && !a.is_resolved).length;

    return {
      total,
      goats,
      sheep,
      healthy,
      healthyPct: total > 0 ? Math.round((healthy / total) * 100) : 100,
      monitor,
      highRisk,
      activeTreatments,
      totalOverdue,
      unresolvedAlerts,
      criticalAlerts,
    };
  }, [animals, healthCases, treatmentRecords, dewormingRecords, healthAlerts]);

  // Date cutoff for date filter
  const cutoffDate = useMemo(() => {
    if (dateRangeFilter === 'all') return null;
    const d = new Date();
    d.setDate(d.getDate() - (dateRangeFilter === '7d' ? 7 : 30));
    return d.toISOString();
  }, [dateRangeFilter]);

  // Filtered Assessments
  const filteredAssessments = useMemo(() => {
    return healthAssessments.filter((ha) => {
      const animal = animalMap.get(ha.animal_id);
      if (speciesFilter !== 'All' && animal?.species !== speciesFilter) return false;
      if (statusFilter !== 'All') {
        if (statusFilter === 'High Risk' && ha.ai_risk_category !== 'High Risk') return false;
        if (statusFilter === 'Needs Monitoring' && ha.ai_risk_category !== 'Needs Monitoring') return false;
        if (statusFilter === 'Normal' && ha.ai_risk_category !== 'Normal') return false;
      }
      if (cutoffDate && ha.assessment_date < cutoffDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTag = animal?.tag_id.toLowerCase().includes(q);
        const matchName = animal?.name.toLowerCase().includes(q);
        const matchNotes = ha.observation_notes?.toLowerCase().includes(q);
        if (!matchTag && !matchName && !matchNotes) return false;
      }
      return true;
    });
  }, [healthAssessments, animalMap, speciesFilter, statusFilter, cutoffDate, searchQuery]);

  // Filtered Cases
  const filteredCases = useMemo(() => {
    return healthCases.filter((c) => {
      const animal = animalMap.get(c.animal_id);
      if (speciesFilter !== 'All' && animal?.species !== speciesFilter) return false;
      if (cutoffDate && c.date_reported < cutoffDate.split('T')[0]) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTag = animal?.tag_id.toLowerCase().includes(q);
        const matchName = animal?.name.toLowerCase().includes(q);
        const matchCondition = c.suspected_condition.toLowerCase().includes(q);
        const matchCaseNum = c.case_number.toLowerCase().includes(q);
        if (!matchTag && !matchName && !matchCondition && !matchCaseNum) return false;
      }
      return true;
    });
  }, [healthCases, animalMap, speciesFilter, cutoffDate, searchQuery]);

  // Filtered Treatments
  const filteredTreatments = useMemo(() => {
    return treatmentRecords.filter((t) => {
      const animal = animalMap.get(t.animal_id);
      if (speciesFilter !== 'All' && animal?.species !== speciesFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTag = animal?.tag_id.toLowerCase().includes(q);
        const matchName = animal?.name.toLowerCase().includes(q);
        const matchMed = t.medicine_name.toLowerCase().includes(q);
        if (!matchTag && !matchName && !matchMed) return false;
      }
      return true;
    });
  }, [treatmentRecords, animalMap, speciesFilter, searchQuery]);

  // Filtered Deworming
  const filteredDeworming = useMemo(() => {
    return dewormingRecords.filter((d) => {
      const animal = animalMap.get(d.animal_id);
      if (speciesFilter !== 'All' && animal?.species !== speciesFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTag = animal?.tag_id.toLowerCase().includes(q);
        const matchName = animal?.name.toLowerCase().includes(q);
        const matchProd = d.product_name.toLowerCase().includes(q);
        if (!matchTag && !matchName && !matchProd) return false;
      }
      return true;
    });
  }, [dewormingRecords, animalMap, speciesFilter, searchQuery]);

  // CSV Export Handler
  const exportToCSV = () => {
    if (filteredAssessments.length === 0) {
      toast('Walang datos na ma-eexport sa napiling filter.', 'info');
      return;
    }

    const headers = [
      'Assessment ID',
      'Petsa',
      'Tag ID',
      'Pangalan ng Alaga',
      'Uri (Species)',
      'Temperatura (C)',
      'Tibok ng Puso (BPM)',
      'Respiration (BPM)',
      'Gana sa Pagkain',
      'Aktibidad',
      'BCS (1-5)',
      'Mata/FAMACHA',
      'AI Risk Category',
      'AI Risk Score (%)',
      'Model Version',
      'Sintomas',
      'Tala ng Obserbasyon',
      'Nagsuri',
    ];

    const rows = filteredAssessments.map((ha) => {
      const animal = animalMap.get(ha.animal_id);
      return [
        ha.id,
        new Date(ha.assessment_date).toLocaleDateString('fil-PH'),
        animal?.tag_id || 'N/A',
        `"${animal?.name || 'N/A'}"`,
        animal?.species || 'Goat',
        ha.temperature ?? '',
        ha.heart_rate ?? '',
        ha.respiratory_rate ?? '',
        ha.appetite,
        ha.activity_level,
        ha.body_condition_score ?? '',
        ha.eye_condition,
        ha.ai_risk_category,
        ha.ai_risk_score,
        `"${ha.ai_model_version}"`,
        `"${(ha.symptoms || []).join(';')}"`,
        `"${(ha.observation_notes || '').replace(/"/g, '""')}"`,
        `"${ha.recorded_by_name || 'Farm Manager'}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AlpasFarm_Health_Assessments_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Na-download ang Health Report CSV!', 'success');
  };

  // Printable Report Handler
  const printHealthSummaryReport = () => {
    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(`<!DOCTYPE html><html><head>
      <title>AlpasFarm Health Summary Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #111827; }
        h1 { font-size: 22px; color: #238B45; margin-bottom: 2px; }
        .sub { font-size: 13px; color: #4b5563; margin-bottom: 24px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
        .stat-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; text-align: center; }
        .stat-val { font-size: 24px; font-weight: 800; color: #111827; }
        .stat-lbl { font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
        th { background: #f9fafb; font-weight: 700; }
      </style>
    </head><body>
      <h1>AlpasFarm — Pangkalahatang Ulat sa Kalusugan ng Kawan</h1>
      <div class="sub">Petsa: ${new Date().toLocaleDateString('fil-PH', { month: 'long', day: 'numeric', year: 'numeric' })} · Kabuuang Alaga: ${stats.total} (${stats.goats} Kambing, ${stats.sheep} Tupa)</div>
      
      <div class="grid">
        <div class="stat-card"><div class="stat-val" style="color:#16a34a">${stats.healthy}</div><div class="stat-lbl">Malusog (${stats.healthyPct}%)</div></div>
        <div class="stat-card"><div class="stat-val" style="color:#b45309">${stats.monitor}</div><div class="stat-lbl">Kailangan ng Pagbabantay</div></div>
        <div class="stat-card"><div class="stat-val" style="color:#dc2626">${stats.highRisk}</div><div class="stat-lbl">High-Risk / Kritikal</div></div>
        <div class="stat-card"><div class="stat-val" style="color:#7c3aed">${stats.activeTreatments}</div><div class="stat-lbl">Kasalukuyang Ginagamot</div></div>
      </div>

      <h3 style="font-size:15px;margin-top:20px;color:#111827">Kamakailang Health Assessments (${filteredAssessments.length} tala)</h3>
      <table>
        <thead>
          <tr>
            <th>Petsa</th>
            <th>Tag ID & Pangalan</th>
            <th>Vitals</th>
            <th>Gana / Galaw</th>
            <th>AI Risk Category</th>
            <th>Mga Obserbasyon</th>
          </tr>
        </thead>
        <tbody>
          ${filteredAssessments
            .slice(0, 30)
            .map((ha) => {
              const a = animalMap.get(ha.animal_id);
              return `<tr>
              <td>${new Date(ha.assessment_date).toLocaleDateString('fil-PH')}</td>
              <td><strong>${a?.tag_id || 'N/A'}</strong> — ${a?.name || ''}</td>
              <td>${ha.temperature ? `${ha.temperature}°C` : '—'} · ${ha.heart_rate ? `${ha.heart_rate} BPM` : '—'}</td>
              <td>${ha.appetite} · ${ha.activity_level}</td>
              <td><strong>${ha.ai_risk_category}</strong> (${ha.ai_risk_score}%)</td>
              <td>${ha.observation_notes || ha.ai_explanation || '—'}</td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </body></html>`);

    win.document.close();
    setTimeout(() => win.print(), 350);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Summary Metric Cards Grid ────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        {/* Total Animals Card */}
        <div
          style={{
            backgroundColor: 'var(--surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid var(--border, #e5e7eb)',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #6b7280)', textTransform: 'uppercase' }}>
              Kabuuang Alaga
            </span>
            <div style={{ width: 32, height: 32, borderRadius: '8px', backgroundColor: 'rgba(35, 139, 69, 0.1)', color: '#238B45', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={18} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text, #111827)' }}>{stats.total}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', marginTop: 2 }}>
              {stats.goats} Kambing · {stats.sheep} Tupa
            </div>
          </div>
        </div>

        {/* Healthy Animals Card */}
        <div
          style={{
            backgroundColor: 'var(--surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid var(--border, #e5e7eb)',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d', textTransform: 'uppercase' }}>
              Malulusog na Alaga
            </span>
            <div style={{ width: 32, height: 32, borderRadius: '8px', backgroundColor: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{stats.healthy}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', marginTop: 2 }}>
              {stats.healthyPct}% ng kawan ay nasa magandang kondisyon
            </div>
          </div>
        </div>

        {/* Animals Needing Monitoring */}
        <div
          style={{
            backgroundColor: 'var(--surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid var(--border, #e5e7eb)',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#b45309', textTransform: 'uppercase' }}>
              Kailangan ng Pagbabantay
            </span>
            <div style={{ width: 32, height: 32, borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#b45309' }}>{stats.monitor}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', marginTop: 2 }}>
              May paunang sintomas o bawas ang sigla
            </div>
          </div>
        </div>

        {/* High Risk / Critical */}
        <div
          style={{
            backgroundColor: stats.highRisk > 0 ? 'rgba(239, 68, 68, 0.04)' : 'var(--surface, #ffffff)',
            borderRadius: '14px',
            border: stats.highRisk > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border, #e5e7eb)',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>
              Mataas ang Panganib (High Risk)
            </span>
            <div style={{ width: 32, height: 32, borderRadius: '8px', backgroundColor: 'rgba(220, 38, 38, 0.12)', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={18} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626' }}>{stats.highRisk}</div>
            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>
              {stats.highRisk > 0 ? 'Kailangan ng mabilisang lunas o isolation' : 'Walang kritikal na alaga'}
            </div>
          </div>
        </div>

        {/* Under Treatment & Overdue */}
        <div
          style={{
            backgroundColor: 'var(--surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid var(--border, #e5e7eb)',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', textTransform: 'uppercase' }}>
              Ginagamot / Overdue
            </span>
            <div style={{ width: 32, height: 32, borderRadius: '8px', backgroundColor: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Pill size={18} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed' }}>{stats.activeTreatments}</div>
            <div style={{ fontSize: 12, color: stats.totalOverdue > 0 ? '#dc2626' : 'var(--text-secondary, #6b7280)', marginTop: 2, fontWeight: stats.totalOverdue > 0 ? 700 : 400 }}>
              {stats.totalOverdue > 0 ? `${stats.totalOverdue} overdue na follow-up/purga!` : 'Lahat ng gamot ay updated'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Bar & Filters ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          backgroundColor: 'var(--surface, #ffffff)',
          borderRadius: '14px',
          border: '1px solid var(--border, #e5e7eb)',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          {/* Main Action Buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="primary"
              onClick={onOpenAssessmentModal}
              style={{
                backgroundColor: '#238B45',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
              }}
            >
              <HeartPulse size={16} /> Araw-araw na Pagsusuri
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={onOpenCaseModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--border, #d1d5db)',
              }}
            >
              <Stethoscope size={16} color="#dc2626" /> Magbukas ng Case
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={onOpenTreatmentModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--border, #d1d5db)',
              }}
            >
              <Pill size={16} color="#7c3aed" /> Itala ang Gamot
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={onOpenDewormingModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--border, #d1d5db)',
              }}
            >
              <Bug size={16} color="#d97706" /> Magtala ng Pagpupurga
            </Button>
          </div>

          {/* Export / Print Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              variant="ghost"
              onClick={exportToCSV}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <Download size={15} /> I-export sa CSV
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={printHealthSummaryReport}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <Printer size={15} /> I-print ang Ulat
            </Button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border, #f3f4f6)', paddingTop: 12 }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: 10, top: 10 }} />
            <input
              type="text"
              placeholder="Maghanap ayon sa Tag ID, Pangalan, o Sintomas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                border: '1px solid var(--border, #d1d5db)',
                fontSize: 13,
              }}
            />
          </div>

          {/* Species Filter */}
          <select
            value={speciesFilter}
            onChange={(e) => setSpeciesFilter(e.target.value as any)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border, #d1d5db)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <option value="All">Lahat ng Hayop</option>
            <option value="Goat">Kambing (Goat)</option>
            <option value="Sheep">Tupa (Sheep)</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border, #d1d5db)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <option value="All">Lahat ng Katayuan</option>
            <option value="Normal">Malusog (Normal)</option>
            <option value="Needs Monitoring">Kailangan ng Monitoring</option>
            <option value="High Risk">Mataas ang Panganib (High Risk)</option>
          </select>

          {/* Date Range */}
          <select
            value={dateRangeFilter}
            onChange={(e) => setDateRangeFilter(e.target.value as any)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border, #d1d5db)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <option value="7d">Huling 7 Araw</option>
            <option value="30d">Huling 30 Araw</option>
            <option value="all">Kabuuan (All Time)</option>
          </select>
        </div>
      </div>

      {/* ── Tabs for Module Views ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border, #e5e7eb)', paddingBottom: 6 }}>
        <button
          onClick={() => setActiveTab('assessments')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            backgroundColor: activeTab === 'assessments' ? 'rgba(35, 139, 69, 0.12)' : 'transparent',
            color: activeTab === 'assessments' ? '#238B45' : 'var(--text-secondary, #6b7280)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <HeartPulse size={16} /> Daily Assessments ({filteredAssessments.length})
        </button>

        <button
          onClick={() => setActiveTab('cases')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            backgroundColor: activeTab === 'cases' ? 'rgba(220, 38, 38, 0.12)' : 'transparent',
            color: activeTab === 'cases' ? '#dc2626' : 'var(--text-secondary, #6b7280)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Stethoscope size={16} /> Health Cases ({filteredCases.length})
        </button>

        <button
          onClick={() => setActiveTab('treatments')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            backgroundColor: activeTab === 'treatments' ? 'rgba(124, 58, 237, 0.12)' : 'transparent',
            color: activeTab === 'treatments' ? '#7c3aed' : 'var(--text-secondary, #6b7280)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Pill size={16} /> Gamutan & Medisina ({filteredTreatments.length})
        </button>

        <button
          onClick={() => setActiveTab('deworming')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            backgroundColor: activeTab === 'deworming' ? 'rgba(217, 119, 6, 0.12)' : 'transparent',
            color: activeTab === 'deworming' ? '#d97706' : 'var(--text-secondary, #6b7280)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Bug size={16} /> Pagpupurga ({filteredDeworming.length})
        </button>

        <button
          onClick={() => setActiveTab('alerts')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            backgroundColor: activeTab === 'alerts' ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
            color: activeTab === 'alerts' ? '#dc2626' : 'var(--text-secondary, #6b7280)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Bell size={16} /> Alert Center {stats.unresolvedAlerts > 0 && `(${stats.unresolvedAlerts})`}
        </button>
      </div>

      {/* ── Tab 1: Daily Health Assessments ─────────────────────────────────── */}
      {activeTab === 'assessments' && (
        <div style={{ backgroundColor: 'var(--surface, #ffffff)', borderRadius: '14px', border: '1px solid var(--border, #e5e7eb)', overflow: 'hidden' }}>
          {filteredAssessments.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
              <HeartPulse size={36} color="#9ca3af" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Walang naitalang health assessment sa napiling filter.</p>
              <Button type="button" variant="primary" onClick={onOpenAssessmentModal} style={{ marginTop: 8, backgroundColor: '#238B45', color: '#fff' }}>
                Magtala ng Bagong Pagsusuri
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-muted, #f9fafb)', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--text-secondary, #4b5563)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Petsa</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Alaga</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Vitals (°C / BPM)</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Gana / Galaw / BCS</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>AI Risk Level</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Obserbasyon</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Aksyon</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssessments.map((ha) => {
                    const animal = animalMap.get(ha.animal_id);
                    const isHigh = ha.ai_risk_category === 'High Risk';
                    const isMonitor = ha.ai_risk_category === 'Needs Monitoring';

                    return (
                      <tr
                        key={ha.id}
                        style={{
                          borderBottom: '1px solid var(--border, #f3f4f6)',
                          backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary, #6b7280)' }}>
                          {new Date(ha.assessment_date).toLocaleDateString('fil-PH', { month: 'short', day: 'numeric' })}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => {
                              if (animal) {
                                if (onSelectAnimal) onSelectAnimal(animal.id);
                                else navigate(`/animals/${animal.id}`);
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontWeight: 700,
                              color: '#238B45',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            {animal?.tag_id || 'N/A'} — {animal?.name || 'Alaga'}
                          </button>
                          <span style={{ display: 'block', fontSize: 11, color: '#6b7280' }}>
                            {animal?.species === 'Goat' ? 'Kambing' : 'Tupa'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div>{ha.temperature ? `${ha.temperature}°C` : '—'}</div>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            {ha.heart_rate ? `${ha.heart_rate} BPM` : '—'} · {ha.respiratory_rate ? `${ha.respiratory_rate} RR` : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div>{ha.appetite} · {ha.activity_level}</div>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>BCS: {ha.body_condition_score ?? 3.0}/5.0</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              backgroundColor: isHigh ? '#fee2e2' : isMonitor ? '#fef3c7' : '#dcfce7',
                              color: isHigh ? '#dc2626' : isMonitor ? '#b45309' : '#16a34a',
                            }}
                          >
                            {ha.ai_risk_category} ({ha.ai_risk_score}%)
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', maxWidth: 240 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text, #374151)' }}>
                            {ha.observation_notes || ha.ai_explanation || 'Walang karagdagang tala'}
                          </div>
                          {ha.urgent_attention_flag && (
                            <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>⚠️ May urgent flag</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              if (animal) {
                                if (onSelectAnimal) onSelectAnimal(animal.id);
                                else navigate(`/animals/${animal.id}`);
                              }
                            }}
                            style={{ fontSize: 12, padding: '4px 8px' }}
                          >
                            Profile <ChevronRight size={14} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Health Cases ─────────────────────────────────────────────── */}
      {activeTab === 'cases' && (
        <div style={{ backgroundColor: 'var(--surface, #ffffff)', borderRadius: '14px', border: '1px solid var(--border, #e5e7eb)', overflow: 'hidden' }}>
          {filteredCases.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
              <Stethoscope size={36} color="#9ca3af" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Walang naitalang health case.</p>
              <Button type="button" variant="primary" onClick={onOpenCaseModal} style={{ marginTop: 8, backgroundColor: '#dc2626', color: '#fff' }}>
                Magbukas ng Bagong Health Case
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-muted, #f9fafb)', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--text-secondary, #4b5563)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Case No.</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Alaga</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Suspected vs Confirmed</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Severity & Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Attending Vet</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Follow-up Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((c) => {
                    const animal = animalMap.get(c.animal_id);
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text, #111827)' }}>
                          {c.case_number}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => {
                              if (animal) {
                                if (onSelectAnimal) onSelectAnimal(animal.id);
                                else navigate(`/animals/${animal.id}`);
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontWeight: 700,
                              color: '#238B45',
                              cursor: 'pointer',
                            }}
                          >
                            {animal?.tag_id} — {animal?.name}
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div><strong>Suspected:</strong> {c.suspected_condition}</div>
                          {c.confirmed_diagnosis && (
                            <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                              Confirmed: {c.confirmed_diagnosis}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: '#fef3c7', color: '#b45309' }}>
                            {c.severity} · {c.case_status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary, #4b5563)' }}>
                          {c.attending_veterinarian || '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary, #6b7280)' }}>
                          {c.follow_up_date || 'Walang nakatakda'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Treatments & Medication ──────────────────────────────────── */}
      {activeTab === 'treatments' && (
        <div style={{ backgroundColor: 'var(--surface, #ffffff)', borderRadius: '14px', border: '1px solid var(--border, #e5e7eb)', overflow: 'hidden' }}>
          {filteredTreatments.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
              <Pill size={36} color="#9ca3af" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Walang naitalang gamutan.</p>
              <Button type="button" variant="primary" onClick={onOpenTreatmentModal} style={{ marginTop: 8, backgroundColor: '#7c3aed', color: '#fff' }}>
                Magtala ng Gamot
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-muted, #f9fafb)', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--text-secondary, #4b5563)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Alaga</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Gamot & Dosis</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Paraan at Dalas</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Petsa & Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Withdrawal Period</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Prescriber / Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTreatments.map((t) => {
                    const animal = animalMap.get(t.animal_id);
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => {
                              if (animal) {
                                if (onSelectAnimal) onSelectAnimal(animal.id);
                                else navigate(`/animals/${animal.id}`);
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontWeight: 700,
                              color: '#238B45',
                              cursor: 'pointer',
                            }}
                          >
                            {animal?.tag_id} — {animal?.name}
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, color: '#111827' }}>{t.medicine_name}</div>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            {t.dosage} {t.unit} {t.active_ingredient && `(${t.active_ingredient})`}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div>{t.route}</div>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>{t.frequency}</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: t.status === 'Completed' ? '#dcfce7' : '#ede9fe', color: t.status === 'Completed' ? '#16a34a' : '#7c3aed' }}>
                            {t.status}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                            {t.start_date} {t.end_date && `hanggang ${t.end_date}`}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {t.withdrawal_period_days && t.withdrawal_period_days > 0 ? (
                            <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>
                              {t.withdrawal_period_days} araw (Safe: {t.withdrawal_end_date})
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>Walang withdrawal</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary, #4b5563)' }}>
                          <div>{t.prescribing_veterinarian || 'N/A'}</div>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>{t.administering_person || ''}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 4: Deworming ─────────────────────────────────────────────────── */}
      {activeTab === 'deworming' && (
        <div style={{ backgroundColor: 'var(--surface, #ffffff)', borderRadius: '14px', border: '1px solid var(--border, #e5e7eb)', overflow: 'hidden' }}>
          {filteredDeworming.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
              <Bug size={36} color="#9ca3af" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Walang naitalang deworming record.</p>
              <Button type="button" variant="primary" onClick={onOpenDewormingModal} style={{ marginTop: 8, backgroundColor: '#d97706', color: '#fff' }}>
                Magtala ng Pagpupurga
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-muted, #f9fafb)', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--text-secondary, #4b5563)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Alaga</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Produkto</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Petsa Administered</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Susunod na Petsa (Next Due)</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Katayuan</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Batch / Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeworming.map((d) => {
                    const animal = animalMap.get(d.animal_id);
                    return (
                      <tr key={d.id} style={{ borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => {
                              if (animal) {
                                if (onSelectAnimal) onSelectAnimal(animal.id);
                                else navigate(`/animals/${animal.id}`);
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontWeight: 700,
                              color: '#238B45',
                              cursor: 'pointer',
                            }}
                          >
                            {animal?.tag_id} — {animal?.name}
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>
                          {d.product_name}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary, #6b7280)' }}>
                          {d.date_administered}
                        </td>
                        <td style={{ padding: '12px 16px', color: d.next_due_date && d.next_due_date < new Date().toISOString().split('T')[0] ? '#dc2626' : 'inherit', fontWeight: 600 }}>
                          {d.next_due_date || 'Hindi nakatakda'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: d.status === 'Completed' ? '#dcfce7' : '#fef3c7', color: d.status === 'Completed' ? '#16a34a' : '#d97706' }}>
                            {d.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary, #4b5563)' }}>
                          <div>{d.provider || 'N/A'}</div>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>Lot: {d.batch_number || 'N/A'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 5: Health Alert Center ──────────────────────────────────────── */}
      {activeTab === 'alerts' && (
        <HealthAlertCenter onSelectAnimal={onSelectAnimal} />
      )}
    </div>
  );
}
