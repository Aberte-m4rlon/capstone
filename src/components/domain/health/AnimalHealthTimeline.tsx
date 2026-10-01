import React, { useState, useMemo } from 'react';
import {
  HeartPulse,
  Stethoscope,
  Pill,
  Syringe,
  Bug,
  Sparkles,
  Camera,
  Calendar,
  Filter,
  Printer,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useFarmData } from '../../../lib/useFarmData';
import { Button } from '../../ui/Button';
import type { Animal, HealthAssessment, HealthCase, TreatmentRecord, DewormingRecord } from '../../../types';

interface AnimalHealthTimelineProps {
  animal: Animal;
  onOpenAssessmentModal?: () => void;
  onOpenCaseModal?: () => void;
  onOpenTreatmentModal?: () => void;
}

type TimelineFilter = 'all' | 'assessments' | 'cases' | 'treatments' | 'vaccines_deworming' | 'ai';

interface TimelineEvent {
  id: string;
  type: 'assessment' | 'case' | 'treatment' | 'vaccine' | 'deworming' | 'screening';
  date: string;
  title: string;
  subtitle?: string;
  badge?: { label: string; color: string; bg: string };
  details: Record<string, string | number | boolean | null | undefined>;
  notes?: string | null;
  rawObj: any;
}

export function AnimalHealthTimeline({
  animal,
  onOpenAssessmentModal,
  onOpenCaseModal,
  onOpenTreatmentModal,
}: AnimalHealthTimelineProps) {
  const {
    healthAssessments,
    healthCases,
    treatmentRecords,
    vaccinations,
    dewormingRecords,
  } = useFarmData();

  const [activeFilter, setActiveFilter] = useState<TimelineFilter>('all');

  // Aggregate and sort all historical records for this animal chronologically
  const timelineEvents = useMemo(() => {
    const events: TimelineEvent[] = [];

    // 1. Health Assessments
    healthAssessments
      .filter((ha: HealthAssessment) => ha.animal_id === animal.id)
      .forEach((ha: HealthAssessment) => {
        const isHigh = ha.ai_risk_category === 'High Risk';
        const isMonitor = ha.ai_risk_category === 'Needs Monitoring';
        events.push({
          id: `ha-${ha.id}`,
          type: 'assessment',
          date: ha.assessment_date,
          title: `Health Assessment (${ha.ai_risk_category})`,
          subtitle: `Sinuri ni: ${ha.recorded_by_name || 'Farm Manager'}`,
          badge: {
            label: `${ha.ai_risk_category} (${ha.ai_risk_score}%)`,
            color: isHigh ? '#dc2626' : isMonitor ? '#b45309' : '#16a34a',
            bg: isHigh ? '#fee2e2' : isMonitor ? '#fef3c7' : '#dcfce7',
          },
          details: {
            'Temperatura': ha.temperature ? `${ha.temperature}°C` : null,
            'Tibok ng Puso': ha.heart_rate ? `${ha.heart_rate} BPM` : null,
            'Paghinga': ha.respiratory_rate ? `${ha.respiratory_rate} BPM` : null,
            'Gana sa Pagkain': ha.appetite,
            'Aktibidad': ha.activity_level,
            'BCS': ha.body_condition_score ? `${ha.body_condition_score}/5.0` : null,
            'Mata/FAMACHA': ha.eye_condition,
            'AI Screening': ha.ai_model_version,
          },
          notes: ha.observation_notes || ha.ai_explanation,
          rawObj: ha,
        });
      });

    // 2. Health Cases
    healthCases
      .filter((hc: HealthCase) => hc.animal_id === animal.id)
      .forEach((hc: HealthCase) => {
        const isCritical = hc.severity === 'Critical' || hc.severity === 'Severe';
        events.push({
          id: `hc-${hc.id}`,
          type: 'case',
          date: hc.date_reported,
          title: `Kaso #${hc.case_number}: ${hc.suspected_condition}`,
          subtitle: hc.confirmed_diagnosis ? `Kumpirmado: ${hc.confirmed_diagnosis}` : 'Pinaghihinalaan pa lamang',
          badge: {
            label: `${hc.case_status} · ${hc.severity}`,
            color: isCritical ? '#dc2626' : '#2563eb',
            bg: isCritical ? '#fee2e2' : '#dbeafe',
          },
          details: {
            'Attending Vet': hc.attending_veterinarian || 'Wala pang nakatala',
            'Follow-up Date': hc.follow_up_date || 'Walang nakatakda',
            'Petsa': hc.date_reported,
          },
          notes: hc.clinical_notes,
          rawObj: hc,
        });
      });

    // 3. Treatment Records
    treatmentRecords
      .filter((tr: TreatmentRecord) => tr.animal_id === animal.id)
      .forEach((tr: TreatmentRecord) => {
        events.push({
          id: `tr-${tr.id}`,
          type: 'treatment',
          date: tr.start_date,
          title: `Gamutan: ${tr.medicine_name}`,
          subtitle: `${tr.dosage} ${tr.unit} (${tr.route}) · ${tr.frequency}`,
          badge: {
            label: tr.status,
            color: tr.status === 'Completed' ? '#16a34a' : '#7c3aed',
            bg: tr.status === 'Completed' ? '#dcfce7' : '#ede9fe',
          },
          details: {
            'Nagsagawa': tr.administering_person || 'Hindi nakatala',
            'Beterinaryo': tr.prescribing_veterinarian || 'Hindi nakatala',
            'Withdrawal Period': tr.withdrawal_period_days ? `${tr.withdrawal_period_days} araw (Hanggang ${tr.withdrawal_end_date})` : 'Wala',
            'Hanggang': tr.end_date || 'Kasalukuyan',
          },
          notes: tr.treatment_notes,
          rawObj: tr,
        });
      });

    // 4. Vaccinations
    vaccinations
      .filter((v: any) => v.animal_id === animal.id)
      .forEach((v: any) => {
        events.push({
          id: `v-${v.id}`,
          type: 'vaccine',
          date: v.date_given,
          title: `Bakuna: ${v.vaccine_name}`,
          subtitle: v.veterinarian ? `Ibinigay ni: ${v.veterinarian}` : undefined,
          badge: {
            label: 'Naturukan',
            color: '#2563eb',
            bg: '#dbeafe',
          },
          details: {
            'Susunod na Bakuna': v.next_due_date || 'Hindi nakatakda',
          },
          notes: v.notes,
          rawObj: v,
        });
      });

    // 5. Dewormings
    dewormingRecords
      .filter((dr: DewormingRecord) => dr.animal_id === animal.id)
      .forEach((dr: DewormingRecord) => {
        events.push({
          id: `dr-${dr.id}`,
          type: 'deworming',
          date: dr.date_administered,
          title: `Pagpupurga: ${dr.product_name}`,
          subtitle: dr.provider ? `Ibinigay ni: ${dr.provider}` : undefined,
          badge: {
            label: dr.status,
            color: '#d97706',
            bg: '#fef3c7',
          },
          details: {
            'Dosis': dr.dosage || 'Standard',
            'Batch/Lot': dr.batch_number || 'N/A',
            'Susunod na Purga': dr.next_due_date || 'Hindi nakatakda',
          },
          notes: dr.notes,
          rawObj: dr,
        });
      });

    // Sort descending by event date
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
    animal.id,
    healthAssessments,
    healthCases,
    treatmentRecords,
    vaccinations,
    dewormingRecords,
  ]);

  const filteredEvents = useMemo(() => {
    return timelineEvents.filter((event) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'assessments') return event.type === 'assessment';
      if (activeFilter === 'cases') return event.type === 'case';
      if (activeFilter === 'treatments') return event.type === 'treatment';
      if (activeFilter === 'vaccines_deworming') return event.type === 'vaccine' || event.type === 'deworming';
      if (activeFilter === 'ai') return event.type === 'assessment' || event.type === 'screening';
      return true;
    });
  }, [timelineEvents, activeFilter]);

  const printHealthHistory = () => {
    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Health History — ${animal.name} (${animal.tag_id})</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #111827; }
        h1 { font-size: 22px; color: #238B45; margin-bottom: 4px; }
        .meta { font-size: 13px; color: #4b5563; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
        th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; }
        th { background: #f9fafb; font-weight: 700; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
      </style>
    </head><body>
      <h1>AlpasFarm — Kasaysayan sa Kalusugan (Health History)</h1>
      <div class="meta">
        <strong>${animal.name}</strong> (${animal.tag_id}) · ${animal.species === 'Goat' ? 'Kambing' : 'Tupa'} · Katayuan: ${animal.health_status || 'Healthy'}
      </div>
      <table>
        <thead>
          <tr>
            <th>Petsa</th>
            <th>Uri ng Kaganapan</th>
            <th>Detalye / Gamot</th>
            <th>Katayuan / Risk</th>
            <th>Mga Tala</th>
          </tr>
        </thead>
        <tbody>
          ${filteredEvents
            .map(
              (e) => `<tr>
            <td>${new Date(e.date).toLocaleDateString('fil-PH')}</td>
            <td><strong>${e.title}</strong><br><small style="color:#6b7280">${e.subtitle || ''}</small></td>
            <td>${Object.entries(e.details)
              .filter(([_, v]) => v)
              .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
              .join(' · ')}</td>
            <td><span class="badge" style="background:${e.badge?.bg};color:${e.badge?.color}">${e.badge?.label || ''}</span></td>
            <td>${e.notes || '—'}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </body></html>`);

    win.document.close();
    setTimeout(() => win.print(), 350);
  };

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'assessment':
        return <HeartPulse size={18} color="#238B45" />;
      case 'case':
        return <Stethoscope size={18} color="#dc2626" />;
      case 'treatment':
        return <Pill size={18} color="#7c3aed" />;
      case 'vaccine':
        return <Syringe size={18} color="#2563eb" />;
      case 'deworming':
        return <Bug size={18} color="#d97706" />;
      default:
        return <Sparkles size={18} color="#238B45" />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Action Bar & Quick Action Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(
            [
              { key: 'all', label: `Lahat (${timelineEvents.length})` },
              { key: 'assessments', label: 'Daily Assessments' },
              { key: 'cases', label: 'Cases & Diagnoses' },
              { key: 'treatments', label: 'Mga Gamot' },
              { key: 'vaccines_deworming', label: 'Bakuna at Purga' },
              { key: 'ai', label: 'AI Screening' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: 12,
                fontWeight: 600,
                border: activeFilter === tab.key ? '1px solid #238B45' : '1px solid var(--border, #e5e7eb)',
                backgroundColor: activeFilter === tab.key ? 'rgba(35, 139, 69, 0.12)' : 'var(--surface, #ffffff)',
                color: activeFilter === tab.key ? '#238B45' : 'var(--text-secondary, #4b5563)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="button"
            variant="ghost"
            onClick={printHealthHistory}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <Printer size={15} /> I-print ang Rekord
          </Button>
          {onOpenAssessmentModal && (
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
                fontSize: 13,
              }}
            >
              <HeartPulse size={15} /> Magtala ng Assessment
            </Button>
          )}
        </div>
      </div>

      {/* Timeline Stream */}
      {filteredEvents.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            backgroundColor: 'var(--surface-muted, #f9fafb)',
            borderRadius: '12px',
            border: '1px dashed var(--border, #e5e7eb)',
          }}
        >
          <CheckCircle2 size={36} color="#238B45" style={{ margin: '0 auto 10px' }} />
          <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: 'var(--text, #111827)' }}>
            Walang Naitalang Kaganapan sa Kalusugan
          </h4>
          <p style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
            Simulang magtala ng araw-araw na pagsusuri upang masubaybayan ang kalagayan ng alaga.
          </p>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          {/* Vertical timeline line */}
          <div
            style={{
              position: 'absolute',
              left: 7,
              top: 14,
              bottom: 14,
              width: 2,
              backgroundColor: 'var(--border, #e5e7eb)',
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  position: 'relative',
                  backgroundColor: 'var(--surface, #ffffff)',
                  borderRadius: '12px',
                  border: '1px solid var(--border, #e5e7eb)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  padding: '16px',
                }}
              >
                {/* Timeline node icon */}
                <div
                  style={{
                    position: 'absolute',
                    left: -31,
                    top: 16,
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    backgroundColor: 'var(--surface, #ffffff)',
                    border: '2px solid var(--border, #d1d5db)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  {getEventIcon(event.type)}
                </div>

                {/* Event Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text, #111827)' }}>
                        {event.title}
                      </h4>
                      {event.badge && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 999,
                            backgroundColor: event.badge.bg,
                            color: event.badge.color,
                          }}
                        >
                          {event.badge.label}
                        </span>
                      )}
                    </div>
                    {event.subtitle && (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', margin: '2px 0 0 0' }}>
                        {event.subtitle}
                      </p>
                    )}
                  </div>

                  <span style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} /> {new Date(event.date).toLocaleDateString('fil-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                {/* Event Details Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 8,
                    padding: '10px 12px',
                    backgroundColor: 'var(--surface-muted, #f9fafb)',
                    borderRadius: '8px',
                    fontSize: 12,
                    marginBottom: event.notes ? 8 : 0,
                  }}
                >
                  {Object.entries(event.details)
                    .filter(([_, val]) => val !== null && val !== undefined)
                    .map(([key, val]) => (
                      <div key={key}>
                        <span style={{ color: 'var(--text-secondary, #6b7280)', display: 'block', fontSize: 11 }}>{key}</span>
                        <strong style={{ color: 'var(--text, #1f2937)' }}>{String(val)}</strong>
                      </div>
                    ))}
                </div>

                {/* Notes if available */}
                {event.notes && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary, #4b5563)', margin: 0, fontStyle: 'italic', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 6 }}>
                    "{event.notes}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
