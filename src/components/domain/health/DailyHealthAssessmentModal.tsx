import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  HeartPulse,
  Activity,
  Thermometer,
  Wind,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  Camera,
  Upload,
  User,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { useFarmData } from '../../../lib/useFarmData';
import { useAuth } from '../../../lib/auth';
import { useToast } from '../../ui/Toast';
import { Button } from '../../ui/Button';
import {
  validateVitals,
  evaluateAIHealthRisk,
  addHealthAssessment,
  SPECIES_PHYSIOLOGY,
  type AIHealthRiskResult,
} from '../../../lib/healthService';
import type { Animal, Species } from '../../../types';

interface DailyHealthAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedAnimalId?: string;
  onAssessmentSaved?: () => void;
}

export function DailyHealthAssessmentModal({
  isOpen,
  onClose,
  preselectedAnimalId,
  onAssessmentSaved,
}: DailyHealthAssessmentModalProps) {
  const { animals, refresh } = useFarmData();
  const { user, profile } = useAuth();
  const toast = useToast();

  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(preselectedAnimalId || '');
  const [temperature, setTemperature] = useState<string>('');
  const [heartRate, setHeartRate] = useState<string>('');
  const [respiratoryRate, setRespiratoryRate] = useState<string>('');
  const [appetite, setAppetite] = useState<'Normal' | 'Reduced' | 'None'>('Normal');
  const [activityLevel, setActivityLevel] = useState<'Normal' | 'Low' | 'Lethargic'>('Normal');
  const [bcs, setBcs] = useState<number>(3.0);
  const [cough, setCough] = useState<boolean>(false);
  const [diarrhea, setDiarrhea] = useState<boolean>(false);
  const [nasalDischarge, setNasalDischarge] = useState<boolean>(false);
  const [eyeCondition, setEyeCondition] = useState<'Normal' | 'Discharge' | 'Cloudy' | 'Pale'>('Normal');
  const [lameness, setLameness] = useState<boolean>(false);
  const [bloat, setBloat] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [recordedBy, setRecordedBy] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Live AI Risk Assessment State
  const [aiPreview, setAiPreview] = useState<AIHealthRiskResult | null>(null);
  const [isEvaluatingAi, setIsEvaluatingAi] = useState<boolean>(false);

  useEffect(() => {
    if (preselectedAnimalId) {
      setSelectedAnimalId(preselectedAnimalId);
    } else if (animals.length > 0 && !selectedAnimalId) {
      setSelectedAnimalId(animals[0].id);
    }
  }, [preselectedAnimalId, animals, selectedAnimalId]);

  useEffect(() => {
    if (profile?.full_name) {
      setRecordedBy(profile.full_name);
    }
  }, [profile]);

  const currentAnimal: Animal | undefined = useMemo(() => {
    return animals.find((a: Animal) => a.id === selectedAnimalId);
  }, [animals, selectedAnimalId]);

  const species: Species = (currentAnimal?.species as Species) || 'Goat';
  const range = SPECIES_PHYSIOLOGY[species] || SPECIES_PHYSIOLOGY.Goat;

  // Validation
  const vitalsValidation = useMemo(() => {
    return validateVitals(species, {
      temperature: temperature ? parseFloat(temperature) : null,
      heart_rate: heartRate ? parseInt(heartRate, 10) : null,
      respiratory_rate: respiratoryRate ? parseInt(respiratoryRate, 10) : null,
      body_condition_score: bcs,
    });
  }, [species, temperature, heartRate, respiratoryRate, bcs]);

  // Live preliminary AI risk screening
  useEffect(() => {
    let isCancelled = false;
    const runEvaluation = async () => {
      setIsEvaluatingAi(true);
      const tempNum = temperature ? parseFloat(temperature) : null;
      const hrNum = heartRate ? parseInt(heartRate, 10) : null;
      const rrNum = respiratoryRate ? parseInt(respiratoryRate, 10) : null;

      const result = await evaluateAIHealthRisk({
        species,
        temperature_c: tempNum,
        heart_rate_bpm: hrNum,
        respiratory_rate_bpm: rrNum,
        appetite: appetite.toLowerCase() as any,
        activity_level: activityLevel.toLowerCase() as any,
        cough,
        nasal_discharge: nasalDischarge,
        diarrhea,
        lameness,
        eye_condition: eyeCondition,
      });

      if (!isCancelled) {
        setAiPreview(result);
        setIsEvaluatingAi(false);
      }
    };

    const timer = setTimeout(runEvaluation, 350);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [
    species,
    temperature,
    heartRate,
    respiratoryRate,
    appetite,
    activityLevel,
    cough,
    nasalDischarge,
    diarrhea,
    lameness,
    eyeCondition,
  ]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAnimal || !user) {
      toast('Pumili ng alagang hayop muna.', 'error');
      return;
    }

    const tempNum = temperature ? parseFloat(temperature) : null;
    const hrNum = heartRate ? parseInt(heartRate, 10) : null;
    const rrNum = respiratoryRate ? parseInt(respiratoryRate, 10) : null;

    if (tempNum !== null && (tempNum < 34 || tempNum > 44)) {
      toast('Maglagay ng makatotohanang temperatura (34°C - 44°C).', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const activeSymptoms: string[] = [];
      if (cough) activeSymptoms.push('cough');
      if (diarrhea) activeSymptoms.push('diarrhea');
      if (nasalDischarge) activeSymptoms.push('nasal_discharge');
      if (lameness) activeSymptoms.push('lameness');
      if (bloat) activeSymptoms.push('bloat');
      if (eyeCondition === 'Pale') activeSymptoms.push('pale_mucus_membrane');
      if (eyeCondition === 'Discharge') activeSymptoms.push('eye_discharge');
      if (eyeCondition === 'Cloudy') activeSymptoms.push('cloudy_eye');

      const { alertCreated } = await addHealthAssessment({
        userId: user.id,
        animalId: currentAnimal.id,
        species,
        temperature: tempNum,
        heartRate: hrNum,
        respiratoryRate: rrNum,
        appetite,
        activityLevel,
        bodyConditionScore: bcs,
        cough,
        diarrhea,
        nasalDischarge,
        eyeCondition,
        symptoms: activeSymptoms,
        observationNotes: notes,
        photoUrl: photoUrl || null,
        recordedByName: recordedBy || 'Farm Manager',
      });

      toast('Matagumpay na naitala ang pagsusuri sa kalusugan!', 'success');
      if (alertCreated) {
        toast(`⚠️ ${alertCreated.message}`, 'warning');
      }

      await refresh();
      if (onAssessmentSaved) onAssessmentSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving health assessment:', err);
      toast(err.message || 'Hindi maitala ang pagsusuri.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--surface, #ffffff)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '740px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border, #e5e7eb)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border, #e5e7eb)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(35,139,69,0.06), rgba(23,107,53,0.02))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '10px',
                backgroundColor: 'rgba(35, 139, 69, 0.12)',
                color: '#238B45',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HeartPulse size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text, #111827)' }}>
                Araw-araw na Pagsusuri sa Kalusugan
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
                Daily Health Assessment & AI Health Risk Screening
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-secondary, #9ca3af)',
              padding: 6,
              borderRadius: '8px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Animal Selection Card */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'var(--surface-muted, #f9fafb)',
              borderRadius: '12px',
              border: '1px solid var(--border, #e5e7eb)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #374151)' }}>
              Piliin ang Alaga (Kambing o Tupa) *
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedAnimalId}
                onChange={(e) => setSelectedAnimalId(e.target.value)}
                required
                style={{
                  flex: 1,
                  minWidth: 240,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  backgroundColor: 'var(--surface, #ffffff)',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {animals.map((a: Animal) => (
                  <option key={a.id} value={a.id}>
                    {a.tag_id} — {a.name} ({a.species === 'Goat' ? 'Kambing' : 'Tupa'})
                  </option>
                ))}
              </select>
              {currentAnimal && (
                <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary, #4b5563)' }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, backgroundColor: '#e5e7eb', fontWeight: 600 }}>
                    {species === 'Goat' ? 'Kambing (Capra hircus)' : 'Tupa (Ovis aries)'}
                  </span>
                  <span style={{ padding: '4px 10px', borderRadius: 999, backgroundColor: '#e5e7eb' }}>
                    {currentAnimal.breed || 'Lahi hindi nakatala'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Urgent Warning Banner if critical red flags detected */}
          {vitalsValidation.isUrgent && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <ShieldAlert size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: '#b91c1c', fontSize: 14 }}>
                  Kritikal na Babala: Nangangailangan ng Agarang Atensyon ng Beterinaryo
                </strong>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 18, color: '#991b1b', fontSize: 13 }}>
                  {vitalsValidation.urgentReasons.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Section 1: Vital Signs with Species-Specific Boundaries */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text, #111827)' }}>
              <Thermometer size={16} color="#238B45" /> Mga Vital Signs & Normal na Sukat para sa {species === 'Goat' ? 'Kambing' : 'Tupa'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              {/* Temperature */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                  Temperatura (°C)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.1"
                    placeholder={`e.g. 39.0 (${range.tempMin}-${range.tempMax}°C)`}
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border, #d1d5db)',
                      fontSize: 14,
                    }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: 10, fontSize: 12, color: '#9ca3af' }}>°C</span>
                </div>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Normal: {range.tempMin} – {range.tempMax} °C</span>
              </div>

              {/* Heart Rate */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                  Tibok ng Puso (BPM)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    placeholder={`e.g. 75 (${range.heartRateMin}-${range.heartRateMax} BPM)`}
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border, #d1d5db)',
                      fontSize: 14,
                    }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: 10, fontSize: 12, color: '#9ca3af' }}>BPM</span>
                </div>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Normal: {range.heartRateMin} – {range.heartRateMax} BPM</span>
              </div>

              {/* Respiration */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                  Paghinga / Respiration (BPM)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    placeholder={`e.g. 20 (${range.respirationMin}-${range.respirationMax} BPM)`}
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border, #d1d5db)',
                      fontSize: 14,
                    }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: 10, fontSize: 12, color: '#9ca3af' }}>BPM</span>
                </div>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Normal: {range.respirationMin} – {range.respirationMax} BPM</span>
              </div>
            </div>
          </div>

          {/* Section 2: General Condition & BCS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {/* Appetite */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Gana sa Pagkain (Appetite) *
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['Normal', 'Reduced', 'None'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAppetite(opt)}
                    style={{
                      flex: 1,
                      padding: '8px 6px',
                      borderRadius: '8px',
                      border: appetite === opt ? '2px solid #238B45' : '1px solid #d1d5db',
                      backgroundColor: appetite === opt ? 'rgba(35, 139, 69, 0.1)' : 'transparent',
                      color: appetite === opt ? '#238B45' : 'inherit',
                      fontWeight: appetite === opt ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {opt === 'Normal' ? 'Normal' : opt === 'Reduced' ? 'Bawas' : 'Wala'}
                  </button>
                ))}
              </div>
            </div>

            {/* Activity Level */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Aktibidad / Galaw (Activity Level) *
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['Normal', 'Low', 'Lethargic'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setActivityLevel(opt)}
                    style={{
                      flex: 1,
                      padding: '8px 6px',
                      borderRadius: '8px',
                      border: activityLevel === opt ? '2px solid #238B45' : '1px solid #d1d5db',
                      backgroundColor: activityLevel === opt ? 'rgba(35, 139, 69, 0.1)' : 'transparent',
                      color: activityLevel === opt ? '#238B45' : 'inherit',
                      fontWeight: activityLevel === opt ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {opt === 'Normal' ? 'Aktibo' : opt === 'Low' ? 'Mababa' : 'Matamlay'}
                  </button>
                ))}
              </div>
            </div>

            {/* Eye / Mucus Membrane Condition */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Mata at Lamad (FAMACHA / Mucus) *
              </label>
              <select
                value={eyeCondition}
                onChange={(e) => setEyeCondition(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <option value="Normal">Normal / Pinkish (Malusog)</option>
                <option value="Pale">Maputla / Pale (Posibleng Anemia/Parasitiko)</option>
                <option value="Discharge">May Muta / May Tumutulo (Discharge)</option>
                <option value="Cloudy">Malabo / Cloudy (Posibleng Pinkeye)</option>
              </select>
            </div>
          </div>

          {/* Body Condition Score (BCS 1.0 - 5.0) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)' }}>
                Body Condition Score (BCS): <strong>{bcs.toFixed(1)} / 5.0</strong>
              </label>
              <span style={{ fontSize: 12, color: bcs < 2.5 ? '#b45309' : bcs > 4 ? '#b45309' : '#15803d', fontWeight: 600 }}>
                {bcs <= 1.5 ? 'Labis na Payat' : bcs <= 2.5 ? 'Katamtamang Payat' : bcs <= 3.5 ? 'Ideal / Malusog' : bcs <= 4.5 ? 'Mataba' : 'Labis na Mataba'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {[1.0, 2.0, 3.0, 4.0, 5.0].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setBcs(score)}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: bcs === score ? '2px solid #238B45' : '1px solid #d1d5db',
                    backgroundColor: bcs === score ? 'rgba(35, 139, 69, 0.12)' : 'transparent',
                    color: bcs === score ? '#238B45' : 'inherit',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {score.toFixed(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Symptoms Checklist */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #111827)', display: 'block', marginBottom: 8 }}>
              Mga Obserbasyong Sintomas (I-tsek kung naroroon)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', backgroundColor: cough ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-muted, #f9fafb)' }}>
                <input type="checkbox" checked={cough} onChange={(e) => setCough(e.target.checked)} />
                <span>Ubo (Coughing)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', backgroundColor: diarrhea ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-muted, #f9fafb)' }}>
                <input type="checkbox" checked={diarrhea} onChange={(e) => setDiarrhea(e.target.checked)} />
                <span>Pagtatae (Diarrhea)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', backgroundColor: nasalDischarge ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-muted, #f9fafb)' }}>
                <input type="checkbox" checked={nasalDischarge} onChange={(e) => setNasalDischarge(e.target.checked)} />
                <span>Sipon / Plema</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', backgroundColor: lameness ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-muted, #f9fafb)' }}>
                <input type="checkbox" checked={lameness} onChange={(e) => setLameness(e.target.checked)} />
                <span>Pilay / Paika-ika</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', backgroundColor: bloat ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-muted, #f9fafb)' }}>
                <input type="checkbox" checked={bloat} onChange={(e) => setBloat(e.target.checked)} />
                <span>Kabag / Bloat</span>
              </label>
            </div>
          </div>

          {/* Section 4: AI Health Risk Assessment Real-time Preview */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid rgba(35, 139, 69, 0.3)',
              backgroundColor: 'rgba(35, 139, 69, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#238B45" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#176B35' }}>
                  AI Health Risk Screening (Real Model Output)
                </span>
              </div>
              {isEvaluatingAi ? (
                <span style={{ fontSize: 12, color: '#6b7280' }}>Sinusuri…</span>
              ) : (
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor:
                      aiPreview?.category === 'High Risk'
                        ? '#fee2e2'
                        : aiPreview?.category === 'Needs Monitoring'
                        ? '#fef3c7'
                        : '#dcfce7',
                    color:
                      aiPreview?.category === 'High Risk'
                        ? '#b91c1c'
                        : aiPreview?.category === 'Needs Monitoring'
                        ? '#b45309'
                        : '#15803d',
                  }}
                >
                  {aiPreview?.category || 'Normal'} ({aiPreview?.score ?? 0}%)
                </span>
              )}
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-secondary, #4b5563)', margin: 0, lineHeight: 1.5 }}>
              {aiPreview?.explanation || 'Sinusuri ang mga naitalang palatandaan at vitals...'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9ca3af', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 8 }}>
              <span>Model: {aiPreview?.modelVersion}</span>
              <span>Confidence: {Math.round((aiPreview?.confidence ?? 0.8) * 100)}%</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
              <Info size={13} />
              <span>Paunang pagsusuri ng AI lamang. Hindi ito opisyal na medical diagnosis ng lisensyadong beterinaryo.</span>
            </div>
          </div>

          {/* Section 5: Notes & Recorder Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Mga Karagdagang Tala (Observation Notes)
              </label>
              <textarea
                rows={3}
                placeholder="Hal. Mahinang kumain sa umaga, umiihi nang madalas, atbp."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                  resize: 'vertical',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Nagsuri / Recorded By
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Pangalan ng tagapamahala o tagasuri"
                  value={recordedBy}
                  onChange={(e) => setRecordedBy(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '9px 12px 9px 34px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #d1d5db)',
                    fontSize: 13,
                  }}
                />
                <User size={15} color="#9ca3af" style={{ position: 'absolute', left: 10, top: 11 }} />
              </div>
              <span style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Clock size={12} /> Naitatala bilang bagong historical record sa database
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border, #e5e7eb)',
            }}
          >
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Kanselahin
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !currentAnimal}
              style={{
                backgroundColor: '#238B45',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {isSubmitting ? 'Itinatala…' : 'I-save ang Health Assessment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
