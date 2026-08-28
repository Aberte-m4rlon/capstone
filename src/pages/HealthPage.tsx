/**
 * HealthPage.tsx — AlpasFarm Early Illness Prediction System
 *
 * SIMPLIFIED FARMER WORKFLOW:
 *   1. Select Animal (Goat / Sheep)
 *   2. Automated Database Context (Age, Weight Loss %, Vaccine Gap, Past Health Scores)
 *   3. Optional Observations (Temperature with quick presets, Appetite, Activity, Symptom chips)
 *   4. Integrated Camera ML Scanner (MobileNetV2 + Cloud Run Vision check & non-target rejection)
 *   5. Real-Time Hybrid ML Prediction Output (Risk Level, Confidence %, Detected Indicators, Vet Attention)
 *   6. Insufficient Evidence Guard (Outputs clear rescan notice instead of guessing)
 *   7. Significant Risk Jump Alerting & Trend Tracking
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { FilterToolbar, FilterSelect } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import {
  Plus,
  Trash2,
  Brain,
  AlertTriangle,
  ShieldAlert,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Activity,
  HeartPulse,
  RefreshCw,
  Info,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Stethoscope,
  Clock,
  ExternalLink,
  Search,
} from 'lucide-react';
import { formatDate } from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import {
  predictEarlyIllness,
  EARLY_ILLNESS_MODEL_VERSION,
  type EarlyIllnessPredictionResult,
  type EarlyIllnessRiskLevel,
  type FarmerObservations,
} from '../lib/earlyIllnessEngine';
import { runCameraScreening, fileToCanvas, type ScanResult } from '../lib/cameraML';
import type { HealthRecord, Animal } from '../types';

// Symptom Chip Definition
interface SymptomChip {
  id: string;
  label: string;
  tagalog: string;
}

const AVAILABLE_SYMPTOMS: SymptomChip[] = [
  { id: 'cough', label: 'Cough', tagalog: 'Ubo' },
  { id: 'nasal_discharge', label: 'Nasal Discharge', tagalog: 'Sipon / Tulo ng Ilong' },
  { id: 'diarrhea', label: 'Diarrhea', tagalog: 'Pagtatae' },
  { id: 'lameness', label: 'Limping / Lameness', tagalog: 'Pilay / Sakit sa Paa' },
  { id: 'pale_membrane', label: 'Pale Eyes / Gums', tagalog: 'Maputlang Mata (Anemia)' },
  { id: 'bloat', label: 'Bloated Belly', tagalog: 'Kabag sa Tiyan' },
  { id: 'rough_coat', label: 'Rough / Scruffy Coat', tagalog: 'Magaspang na Balhibo' },
  { id: 'droopy_head', label: 'Droopy Head / Isolated', tagalog: 'Nakahandusay / Hiwalay' },
];

export function HealthPage() {
  const farmData = useFarmData();
  const { user } = useAuth();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('');
  const [obsTemp, setObsTemp] = useState<string>('');
  const [obsAppetite, setObsAppetite] = useState<'Normal' | 'Reduced' | 'None' | null>(null);
  const [obsActivity, setObsActivity] = useState<'Normal' | 'Low' | 'Lethargic' | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Camera ML state inside prediction modal
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraScanning, setCameraScanning] = useState(false);
  const [cameraResult, setCameraResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filters & UI state
  const [fRisk, setFRisk] = useState<string>('All');
  const [fAnimal, setFAnimal] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HealthRecord | null>(null);

  const activeAnimals = useMemo(() => farmData.animals.filter((a) => !a.archived), [farmData.animals]);

  const selectedAnimal = useMemo(() => {
    return farmData.animals.find((a) => a.id === selectedAnimalId) ?? null;
  }, [farmData.animals, selectedAnimalId]);

  // Compute live prediction whenever inputs change
  const currentPrediction = useMemo<EarlyIllnessPredictionResult | null>(() => {
    if (!selectedAnimal) return null;

    const obs: FarmerObservations = {
      temperature: obsTemp ? Number(obsTemp) : null,
      appetite: obsAppetite,
      activity_level: obsActivity,
      symptoms: selectedSymptoms,
      notes: notes.trim() || null,
    };

    return predictEarlyIllness({
      animal: selectedAnimal,
      observations: obs,
      pastHealthRecords: farmData.healthRecords,
      weightRecords: farmData.weightRecords,
      vaccinations: farmData.vaccinations,
      cameraResult,
    });
  }, [
    selectedAnimal,
    obsTemp,
    obsAppetite,
    obsActivity,
    selectedSymptoms,
    notes,
    farmData.healthRecords,
    farmData.weightRecords,
    farmData.vaccinations,
    cameraResult,
  ]);

  // Significant Risk Jumps (Animals needing immediate attention)
  const significantAlerts = useMemo(() => {
    const list: { animal: Animal; record: HealthRecord; delta: number }[] = [];
    activeAnimals.forEach((animal) => {
      const records = farmData.healthRecords
        .filter((r) => r.animal_id === animal.id)
        .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
      if (records.length >= 1) {
        const latest = records[0];
        const prev = records[1];
        const delta = prev ? latest.risk_score - prev.risk_score : 0;
        if (latest.risk_score >= 65 || delta >= 20) {
          list.push({ animal, record: latest, delta });
        }
      }
    });
    return list;
  }, [activeAnimals, farmData.healthRecords]);

  // Filtered health records
  const filteredRecords = useMemo(() => {
    return farmData.healthRecords
      .filter((r) => {
        if (fRisk !== 'All' && r.risk_level !== fRisk) return false;
        if (fAnimal !== 'All' && r.animal_id !== fAnimal) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const anName = farmData.animals.find((a) => a.id === r.animal_id)?.name.toLowerCase() ?? '';
          const tag = farmData.animals.find((a) => a.id === r.animal_id)?.tag_id.toLowerCase() ?? '';
          const reasons = (r.reasons ?? '').toLowerCase();
          const conditions = (r.detected_conditions ?? '').toLowerCase();
          if (!anName.includes(q) && !tag.includes(q) && !reasons.includes(q) && !conditions.includes(q)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  }, [farmData.healthRecords, farmData.animals, fRisk, fAnimal, searchQuery]);

  // Metric counts
  const stats = useMemo(() => {
    let highRisk = 0;
    let modRisk = 0;
    let lowRisk = 0;
    activeAnimals.forEach((a) => {
      if (a.health_risk_score >= 65 || a.health_status === 'Critical' || a.health_status === 'At Risk') highRisk++;
      else if (a.health_risk_score >= 35 || a.health_status === 'Monitor') modRisk++;
      else lowRisk++;
    });
    return { total: activeAnimals.length, highRisk, modRisk, lowRisk };
  }, [activeAnimals]);

  // Open Prediction Modal
  const openPredictionModal = (preselectedAnimalId?: string) => {
    const idToSelect = preselectedAnimalId || (activeAnimals.length > 0 ? activeAnimals[0].id : '');
    setSelectedAnimalId(idToSelect);
    setObsTemp('');
    setObsAppetite(null);
    setObsActivity(null);
    setSelectedSymptoms([]);
    setNotes('');
    setCameraActive(false);
    setCameraResult(null);
    setCameraError(null);
    setModalOpen(true);
  };

  // Close Camera Stream helper
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Hindi mabuksan ang camera. Pakitingnan ang browser camera permissions o mag-upload na lang ng larawan.');
      setCameraActive(false);
    }
  };

  const captureAndScanCamera = async () => {
    if (!videoRef.current) return;
    setCameraScanning(true);
    setCameraError(null);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const result = await runCameraScreening(canvas, selectedAnimalId);
      setCameraResult(result);
      if (!result.goatDetected) {
        toast(`Hindi kambing o tupa ang na-detect: ${result.nonTargetClass ?? 'Hindi matukoy'}.`, 'warning');
      } else {
        toast('Tagumpay na nasuri ng Camera ML ang hayop!', 'success');
      }
      stopCameraStream();
    } catch (err: any) {
      setCameraError(err.message || 'Nabigo ang camera screening.');
    } finally {
      setCameraScanning(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraScanning(true);
    setCameraError(null);
    try {
      const canvas = await fileToCanvas(file);
      const result = await runCameraScreening(canvas, selectedAnimalId);
      setCameraResult(result);
      if (!result.goatDetected) {
        toast(`Hindi kambing o tupa ang na-detect: ${result.nonTargetClass ?? 'Hindi matukoy'}.`, 'warning');
      } else {
        toast('Tagumpay na nasuri ng Camera ML ang larawan!', 'success');
      }
    } catch (err: any) {
      setCameraError(err.message || 'Nabigo ang pagsusuri sa larawan.');
    } finally {
      setCameraScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSymptom = (id: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  // Save Prediction to Database
  const handleSavePrediction = async () => {
    if (!selectedAnimal || !currentPrediction) return;

    if (currentPrediction.status === 'INSUFFICIENT_EVIDENCE') {
      toast('Kulang ang impormasyon. Maglagay ng kahit isang observation o mag-scan gamit ang camera bago i-save.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const riskInput = {
        temperature: obsTemp ? Number(obsTemp) : null,
        heart_rate: null,
        respiratory_rate: null,
        rumen_sounds: 'Normal' as const,
        famacha_score: null,
        mucous_membrane: selectedSymptoms.includes('pale_membrane') ? ('Pale' as const) : ('Pink' as const),
        bloat_score: selectedSymptoms.includes('bloat') ? (2 as const) : (0 as const),
        gait: selectedSymptoms.includes('lameness') ? ('Slight Limp' as const) : ('Normal' as const),
        appetite: obsAppetite ?? ('Normal' as const),
        activity_level: obsActivity ?? ('Normal' as const),
        cough: selectedSymptoms.includes('cough'),
        diarrhea: selectedSymptoms.includes('diarrhea'),
        nasal_discharge: selectedSymptoms.includes('nasal_discharge'),
        eye_condition: selectedSymptoms.includes('pale_membrane') ? ('Cloudy' as const) : ('Normal' as const),
        body_condition: selectedSymptoms.includes('rough_coat') ? ('Fair' as const) : ('Good' as const),
      };

      const reasonsList = currentPrediction.detectedIndicators.map((i) => `[${i.category}] ${i.name}`).join('; ');
      const detectedConditionsStr = currentPrediction.possibleConcerns.map((c) => c.condition).join('; ');
      const recommendationStr = currentPrediction.recommendations.join('\n');

      const mappedRiskLevel =
        currentPrediction.riskLevel === 'High Risk'
          ? 'High'
          : currentPrediction.riskLevel === 'Moderate Risk'
          ? 'Moderate'
          : 'Low';

      const healthPayload = {
        animal_id: selectedAnimal.id,
        record_date: todayStr,
        temperature: riskInput.temperature,
        heart_rate: null,
        respiratory_rate: null,
        rumen_sounds: riskInput.rumen_sounds,
        famacha_score: null,
        mucous_membrane: riskInput.mucous_membrane,
        bloat_score: riskInput.bloat_score,
        gait: riskInput.gait,
        appetite: riskInput.appetite,
        activity_level: riskInput.activity_level,
        cough: riskInput.cough,
        diarrhea: riskInput.diarrhea,
        nasal_discharge: riskInput.nasal_discharge,
        eye_condition: riskInput.eye_condition,
        body_condition: riskInput.body_condition,
        risk_score: currentPrediction.riskScore,
        risk_level: mappedRiskLevel,
        reasons: reasonsList || null,
        recommendation: recommendationStr,
        detected_conditions: detectedConditionsStr || null,
        notes: notes.trim()
          ? `${notes.trim()}\n\n[ML Model: ${EARLY_ILLNESS_MODEL_VERSION} | Vet Attention: ${currentPrediction.veterinaryAttention}]`
          : `[ML Model: ${EARLY_ILLNESS_MODEL_VERSION} | Vet Attention: ${currentPrediction.veterinaryAttention}]`,
      };

      const { error: insertError } = await supabase.from('health_records').insert(healthPayload);
      if (insertError) throw insertError;

      // Update animal's main profile status
      let newHealthStatus = 'Healthy';
      if (currentPrediction.riskScore >= 65) newHealthStatus = 'At Risk';
      else if (currentPrediction.riskScore >= 35) newHealthStatus = 'Monitor';

      await supabase
        .from('animals')
        .update({
          health_status: newHealthStatus,
          health_risk_score: currentPrediction.riskScore,
          current_temperature: riskInput.temperature,
        })
        .eq('id', selectedAnimal.id);

      // Trigger automatic alert if significant risk increase or high risk
      if (currentPrediction.isSignificantIncrease || currentPrediction.riskScore >= 65) {
        if (user) {
          const alertTitle = currentPrediction.isSignificantIncrease
            ? `Biglaang Pagtaas ng Risk (${selectedAnimal.name}): +${currentPrediction.riskDelta ?? 0}% risk jump`
            : `${selectedAnimal.name}: Mataas ang Risk ng Sakit (${currentPrediction.riskScore}%)`;

          const alertDesc = currentPrediction.possibleConcerns.length > 0
            ? currentPrediction.possibleConcerns.map((c) => c.condition).join(', ')
            : currentPrediction.detectedIndicators.map((i) => i.name).slice(0, 3).join(', ');

          await createNotification(
            user.id,
            'Health',
            alertTitle,
            alertDesc,
            currentPrediction.riskScore >= 65 ? 'Critical' : 'Warning',
            `/animals/${selectedAnimal.id}`
          );
        }
      }

      toast('Matagumpay na nai-save ang Early Illness Prediction!', 'success');
      setModalOpen(false);
      stopCameraStream();
      farmData.refresh();
    } catch (err: any) {
      toast(err.message || 'Hindi mai-save ang rekord.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!confirmDelete) return;
    try {
      const { error } = await supabase.from('health_records').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Nai-delete ang health record.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Hindi ma-delete ang rekord.', 'error');
    }
  };

  // Clean up camera stream when modal closes
  useEffect(() => {
    if (!modalOpen) {
      stopCameraStream();
    }
  }, [modalOpen]);

  const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Hindi kilala';
  const animalTag = (id: string) => farmData.animals.find((a) => a.id === id)?.tag_id ?? '';
  const animalSpecies = (id: string) => farmData.animals.find((a) => a.id === id)?.species ?? 'Goat';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,122,24,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HeartPulse size={24} color="#FF7A18" />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: 'var(--text)' }}>
                Early Illness Prediction System
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '2px 0 0' }}>
                Matalinong pag-alam ng maagang sakit sa kambing at tupa gamit ang AI, Clinical Observations, at Camera ML
              </p>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ padding: '12px 22px', fontSize: 14, fontWeight: 700, borderRadius: 12, boxShadow: '0 4px 12px rgba(255,122,24,0.3)' }}
          onClick={() => openPredictionModal()}
          disabled={activeAnimals.length === 0}
        >
          <Sparkles size={18} /> Magsagawa ng Early Illness Prediction
        </button>
      </div>

      {/* Top Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Kabuuan ng mga Hayop</span>
            <Activity size={20} color="var(--text-secondary)" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: 'var(--text)' }}>{stats.total}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Aktibong kambing at tupa sa farm</div>
        </div>

        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>High Risk (Kritikal)</span>
            <ShieldAlert size={20} color="#DC2626" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: '#DC2626' }}>{stats.highRisk}</div>
          <div style={{ fontSize: 12, color: '#991B1B', marginTop: 2 }}>Nangangailangan ng beterinaryo o gamot</div>
        </div>

        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 16, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#D97706' }}>Moderate Risk (Bantayan)</span>
            <AlertTriangle size={20} color="#D97706" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: '#D97706' }}>{stats.modRisk}</div>
          <div style={{ fontSize: 12, color: '#92400E', marginTop: 2 }}>May kaunting sintomas o risk factor</div>
        </div>

        <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 16, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>Malusog / Low Risk</span>
            <CheckCircle2 size={20} color="#16A34A" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: '#16A34A' }}>{stats.lowRisk}</div>
          <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>Normal ang mga vital signs at hitsura</div>
        </div>
      </div>

      {/* Significant Risk Jump Alerts (Automatic Early Warnings) */}
      {significantAlerts.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 16, padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <ShieldAlert size={22} color="#DC2626" />
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#991B1B', margin: 0 }}>
              Mga Hayop na Nangangailangan ng Agarang Atensyon ({significantAlerts.length})
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
            {significantAlerts.map(({ animal, record, delta }) => (
              <div
                key={animal.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: 12,
                  padding: '12px 16px',
                  border: '1px solid #FECACA',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#1F2937' }}>{animal.name}</span>
                    <span style={{ fontSize: 11, background: '#F3F4F6', padding: '1px 6px', borderRadius: 4, color: '#4B5563' }}>
                      {animal.tag_id}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 6px', borderRadius: 4 }}>
                      Risk: {record.risk_score}% {delta >= 20 ? `(+${delta}% jump)` : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>
                    {record.detected_conditions || record.reasons || 'Nai-flag na may mataas na peligro ng sakit.'}
                  </div>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ borderColor: '#DC2626', color: '#DC2626', fontWeight: 700, borderRadius: 8, whiteSpace: 'nowrap' }}
                  onClick={() => openPredictionModal(animal.id)}
                >
                  Suriin Muli
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Toolbar & Prediction Logs */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={20} color="#FF7A18" />
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
              Kasaysayan ng mga Pagsusuri at Trend (Health Logs)
            </h2>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--surface-sunken)', padding: '4px 10px', borderRadius: 20 }}>
            {filteredRecords.length} rekord na natagpuan
          </span>
        </div>

        {/* Filter Bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          <div style={{ position: 'relative', minWidth: 240, flex: 1 }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: 12, top: 11 }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: 36, width: '100%' }}
              placeholder="Maghanap ayon sa pangalan, tag ID, o sintomas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="input"
            style={{ width: 'auto', minWidth: 160 }}
            value={fRisk}
            onChange={(e) => setFRisk(e.target.value)}
          >
            <option value="All">Lahat ng Risk Level</option>
            <option value="High">High Risk</option>
            <option value="Moderate">Moderate Risk</option>
            <option value="Low">Low Risk</option>
          </select>

          <select
            className="input"
            style={{ width: 'auto', minWidth: 160 }}
            value={fAnimal}
            onChange={(e) => setFAnimal(e.target.value)}
          >
            <option value="All">Lahat ng Hayop</option>
            {activeAnimals.map((a) => (
              <option key={a.id} value={a.id}>
                [{a.species || 'Goat'}] {a.name} ({a.tag_id})
              </option>
            ))}
          </select>
        </div>

        {/* Records Table / Cards */}
        {filteredRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
            <HeartPulse size={40} color="var(--border)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Walang rekord na tumugma sa filter.</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>
              I-click ang "Magsagawa ng Early Illness Prediction" upang magsimula ng pagsusuri.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredRecords.map((r) => {
              const isExpanded = expandedRecordId === r.id;
              const anName = animalName(r.animal_id);
              const tag = animalTag(r.animal_id);
              const sp = animalSpecies(r.animal_id);
              const score = r.risk_score ?? 0;
              const isHigh = score >= 65 || r.risk_level === 'High';
              const isMod = score >= 35 || r.risk_level === 'Moderate';

              return (
                <div
                  key={r.id}
                  style={{
                    background: 'var(--surface-sunken)',
                    border: `1px solid ${isHigh ? 'rgba(239,68,68,0.3)' : isMod ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                    borderRadius: 14,
                    overflow: 'hidden',
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                    onClick={() => setExpandedRecordId(isExpanded ? null : r.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity size={18} color="var(--primary)" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{anName}</span>
                          <span style={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                            {tag}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            · {formatDate(r.record_date)}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {r.detected_conditions || r.reasons || 'Regular health evaluation'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          padding: '4px 10px',
                          borderRadius: 20,
                          background: isHigh ? 'rgba(239,68,68,0.15)' : isMod ? 'rgba(245,158,11,0.15)' : 'rgba(22,163,74,0.15)',
                          color: isHigh ? '#DC2626' : isMod ? '#D97706' : '#16A34A',
                        }}
                      >
                        {isHigh ? 'High Risk' : isMod ? 'Moderate Risk' : 'Low Risk'} ({score}%)
                      </span>
                      {isExpanded ? <ChevronDown size={18} color="var(--text-secondary)" /> : <ChevronRight size={18} color="var(--text-secondary)" />}
                    </div>
                  </div>

                  {/* Expanded Breakdown */}
                  {isExpanded && (
                    <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                            Mga Sinuring Datos (Clinical & History)
                          </div>
                          <ul style={{ fontSize: 13, color: 'var(--text)', margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                            {r.temperature && <li>Temperatura: <strong>{r.temperature}°C</strong></li>}
                            {r.appetite && <li>Gana sa Pagkain: <strong>{r.appetite}</strong></li>}
                            {r.activity_level && <li>Kilos / Sigla: <strong>{r.activity_level}</strong></li>}
                            {r.cough && <li>Sintomas: <strong>May Ubo</strong></li>}
                            {r.nasal_discharge && <li>Sintomas: <strong>May Sipon/Tulo ng Ilong</strong></li>}
                            {r.diarrhea && <li>Sintomas: <strong>May Pagtatae</strong></li>}
                            {r.gait && r.gait !== 'Normal' && <li>Gait: <strong>{r.gait}</strong></li>}
                          </ul>
                        </div>

                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                            Rekomendasyon ng AI Engine
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                            {r.recommendation || 'Panatilihin ang maayos na pangangalaga at regular na pagsubaybay.'}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#DC2626', fontSize: 12 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(r);
                          }}
                        >
                          <Trash2 size={14} /> I-delete ang Rekord
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── EARLY ILLNESS PREDICTION MODAL ── */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          stopCameraStream();
        }}
        title="Magsagawa ng Early Illness Prediction"
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* STEP 1: Animal Selector */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
              1. Piliin ang Hayop na Susuriin (Select Animal) *
            </label>
            <select
              className="input"
              style={{ width: '100%', fontSize: 15, padding: '10px 14px', fontWeight: 600 }}
              value={selectedAnimalId}
              onChange={(e) => setSelectedAnimalId(e.target.value)}
            >
              {activeAnimals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.species || 'Goat'}: {a.name} ({a.tag_id}) — {a.health_status}
                </option>
              ))}
            </select>
          </div>

          {/* STEP 2: Automated Database Context Card */}
          {currentPrediction && (
            <div
              style={{
                background: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#2563EB' }}>
                <Brain size={15} />
                Awtomatikong Kinuha mula sa Database (Automated Context):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                <div>Edad: <strong>{currentPrediction.contextSummary.ageMonths} buwan</strong></div>
                <div>Timbang: <strong>{selectedAnimal?.weight_kg ? `${selectedAnimal.weight_kg} kg` : 'Walang tala'}</strong> ({currentPrediction.contextSummary.weightTrend})</div>
                <div>Bakuna/Deworm: <strong>{currentPrediction.contextSummary.vaccinationStatus}</strong></div>
                <div>Nakaraang Risk: <strong>{currentPrediction.previousRiskScore !== null ? `${currentPrediction.previousRiskScore}%` : 'Bago'}</strong></div>
              </div>
            </div>
          )}

          {/* STEP 3: Optional Observations (Clean, Fast, Farmer-Friendly) */}
          <div style={{ background: 'var(--surface-sunken)', borderRadius: 14, padding: '16px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>
              2. Mga Opsyonal na Obserbasyon (Farmer Observations - Hindi sapilitan):
            </div>

            {/* Temperature with quick presets */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Temperatura ng Katawan (°C):
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 39.2"
                  className="input"
                  style={{ width: 120, fontWeight: 700 }}
                  value={obsTemp}
                  onChange={(e) => setObsTemp(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ background: obsTemp === '39.0' ? 'rgba(22,163,74,0.2)' : 'var(--surface)', fontSize: 12, borderRadius: 8 }}
                  onClick={() => setObsTemp(obsTemp === '39.0' ? '' : '39.0')}
                >
                  Normal (39.0°C)
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ background: obsTemp === '40.2' ? 'rgba(245,158,11,0.2)' : 'var(--surface)', fontSize: 12, borderRadius: 8 }}
                  onClick={() => setObsTemp(obsTemp === '40.2' ? '' : '40.2')}
                >
                  Warm (40.2°C)
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ background: obsTemp === '41.0' ? 'rgba(239,68,68,0.2)' : 'var(--surface)', fontSize: 12, borderRadius: 8 }}
                  onClick={() => setObsTemp(obsTemp === '41.0' ? '' : '41.0')}
                >
                  Lagnat/Fever (41.0°C)
                </button>
              </div>
            </div>

            {/* Appetite Buttons */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Gana sa Pagkain (Appetite):
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['Normal', 'Reduced', 'None'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="btn btn-sm"
                    style={{
                      borderRadius: 10,
                      background: obsAppetite === mode ? (mode === 'Normal' ? '#16A34A' : mode === 'Reduced' ? '#D97706' : '#DC2626') : 'var(--surface)',
                      color: obsAppetite === mode ? '#FFF' : 'var(--text)',
                      fontWeight: 700,
                      border: '1px solid var(--border)',
                    }}
                    onClick={() => setObsAppetite(obsAppetite === mode ? null : mode)}
                  >
                    {mode === 'Normal' ? 'Normal' : mode === 'Reduced' ? 'Bawas ang Pagkain (Reduced)' : 'Walang Gana (None)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Activity Level Buttons */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Kilos at Sigla (Activity Level):
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['Normal', 'Low', 'Lethargic'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="btn btn-sm"
                    style={{
                      borderRadius: 10,
                      background: obsActivity === mode ? (mode === 'Normal' ? '#16A34A' : mode === 'Low' ? '#D97706' : '#DC2626') : 'var(--surface)',
                      color: obsActivity === mode ? '#FFF' : 'var(--text)',
                      fontWeight: 700,
                      border: '1px solid var(--border)',
                    }}
                    onClick={() => setObsActivity(obsActivity === mode ? null : mode)}
                  >
                    {mode === 'Normal' ? 'Masigla (Normal)' : mode === 'Low' ? 'Mabagal (Sluggish)' : 'Nakahiga/Matamlay (Lethargic)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Visible Symptoms Chips */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Mga Nakikitang Sintomas (Tap to Select Symptoms):
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {AVAILABLE_SYMPTOMS.map((s) => {
                  const active = selectedSymptoms.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      style={{
                        padding: '6px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: active ? 700 : 500,
                        border: `1px solid ${active ? '#FF7A18' : 'var(--border)'}`,
                        background: active ? 'rgba(255,122,24,0.15)' : 'var(--surface)',
                        color: active ? '#C2410C' : 'var(--text)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s',
                      }}
                      onClick={() => toggleSymptom(s.id)}
                    >
                      <Activity size={12} color={active ? '#C2410C' : 'var(--text-secondary)'} />
                      <span>{s.tagalog}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* STEP 4: Integrated Real Camera ML Vision Scanner */}
          <div style={{ background: 'var(--surface-sunken)', borderRadius: 14, padding: '16px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Camera size={16} color="#7C3AED" />
                3. Camera ML Visual Health Scanner (Opsyonal):
              </div>
              {cameraResult && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, color: '#DC2626' }}
                  onClick={() => setCameraResult(null)}
                >
                  Tanggalin ang Scan
                </button>
              )}
            </div>

            {/* Camera View / Controls */}
            {!cameraResult && !cameraActive && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={startCamera}
                >
                  <Camera size={14} /> Buksan ang Live Camera
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} /> Mag-upload ng Larawan
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
              </div>
            )}

            {cameraActive && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: 400, borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                  <video ref={videoRef} playsInline autoPlay muted style={{ width: '100%', display: 'block' }} />
                  {cameraScanning && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 700, gap: 8 }}>
                      <RefreshCw size={20} className="animate-spin" /> Sinusuri ang hayop gamit ang MobileNetV2...
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ borderRadius: 8 }}
                    onClick={captureAndScanCamera}
                    disabled={cameraScanning}
                  >
                    Kuhanan at I-screen Ngayon
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ borderRadius: 8 }}
                    onClick={stopCameraStream}
                  >
                    Kanselahin
                  </button>
                </div>
              </div>
            )}

            {cameraScanning && !cameraActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, color: '#7C3AED', fontSize: 13, fontWeight: 700 }}>
                <RefreshCw size={16} className="animate-spin" /> Sinusuri ang larawan gamit ang Computer Vision...
              </div>
            )}

            {cameraError && (
              <div style={{ color: '#DC2626', fontSize: 12, marginTop: 8, background: '#FEE2E2', padding: '8px 12px', borderRadius: 8 }}>
                {cameraError}
              </div>
            )}

            {cameraResult && (
              <div
                style={{
                  background: cameraResult.goatDetected ? 'rgba(124,58,237,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${cameraResult.goatDetected ? 'rgba(124,58,237,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: cameraResult.goatDetected ? '#6D28D9' : '#DC2626' }}>
                    {cameraResult.goatDetected
                      ? `${cameraResult.species === 'sheep' ? 'Tupa (Sheep)' : 'Kambing (Goat)'} na-detect (${Math.round(cameraResult.goatDetectionConfidence * 100)}%)`
                      : `Hindi kambing o tupa (${cameraResult.nonTargetClass ?? 'Unknown'})`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Visual Screening: {cameraResult.riskLevelLabel} · Confidence: {Math.round(cameraResult.confidence * 100)}%
                  </div>
                </div>
                <Activity size={18} color={cameraResult.goatDetected ? '#6D28D9' : '#DC2626'} />
              </div>
            )}
          </div>

          {/* STEP 5: Instant Real-Time Hybrid Prediction Result */}
          {currentPrediction && (
            <div>
              {currentPrediction.status === 'INSUFFICIENT_EVIDENCE' ? (
                <div
                  style={{
                    background: '#FFFBEB',
                    border: '1px solid #FCD34D',
                    borderRadius: 14,
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <HelpCircle size={24} color="#D97706" style={{ flexShrink: 0 }} />
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#92400E' }}>
                      Insufficient Evidence — Rescan or perform a health check
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#78350F' }}>
                      Kulang ang impormasyon upang masuri ang hayop. Maglagay ng temperatura, obserbasyon, o mag-scan gamit ang camera.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background:
                      currentPrediction.riskLevel === 'High Risk'
                        ? 'rgba(239,68,68,0.06)'
                        : currentPrediction.riskLevel === 'Moderate Risk'
                        ? 'rgba(245,158,11,0.06)'
                        : 'rgba(22,163,74,0.06)',
                    border: `1.5px solid ${
                      currentPrediction.riskLevel === 'High Risk'
                        ? '#EF4444'
                        : currentPrediction.riskLevel === 'Moderate Risk'
                        ? '#F59E0B'
                        : '#16A34A'
                    }`,
                    borderRadius: 14,
                    padding: '18px 20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
                        AI Early Illness Prediction Result
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <span
                          style={{
                            fontSize: 18,
                            fontWeight: 900,
                            color:
                              currentPrediction.riskLevel === 'High Risk'
                                ? '#DC2626'
                                : currentPrediction.riskLevel === 'Moderate Risk'
                                ? '#D97706'
                                : '#16A34A',
                          }}
                        >
                          {currentPrediction.riskLevel === 'High Risk'
                            ? 'High Risk'
                            : currentPrediction.riskLevel === 'Moderate Risk'
                            ? 'Moderate Risk'
                            : 'Low Risk'}{' '}
                          ({currentPrediction.riskScore}%)
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          · {currentPrediction.confidencePercent}% ML Confidence
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '6px 12px',
                        borderRadius: 10,
                        fontSize: 12,
                        fontWeight: 800,
                        background:
                          currentPrediction.veterinaryAttention === 'Recommended — Urgent'
                            ? '#FEE2E2'
                            : currentPrediction.veterinaryAttention === 'Recommended — Routine Consult'
                            ? '#FEF3C7'
                            : '#DCFCE7',
                        color:
                          currentPrediction.veterinaryAttention === 'Recommended — Urgent'
                            ? '#991B1B'
                            : currentPrediction.veterinaryAttention === 'Recommended — Routine Consult'
                            ? '#92400E'
                            : '#166534',
                      }}
                    >
                      {currentPrediction.veterinaryAttention}
                    </div>
                  </div>

                  {/* Possible Health Concerns */}
                  {currentPrediction.possibleConcerns.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                        Posibleng Karamdaman (Possible Health Concerns):
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {currentPrediction.possibleConcerns.map((c, i) => (
                          <div
                            key={i}
                            style={{
                              background: '#FFF',
                              border: `1px solid ${c.severity === 'Critical' ? '#FCA5A5' : '#FDE68A'}`,
                              borderRadius: 8,
                              padding: '8px 12px',
                              fontSize: 12,
                            }}
                          >
                            <span style={{ fontWeight: 800, color: c.severity === 'Critical' ? '#DC2626' : '#D97706' }}>
                              {c.condition}:
                            </span>{' '}
                            <span style={{ color: 'var(--text)' }}>{c.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detected Indicators Badges */}
                  {currentPrediction.detectedIndicators.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                        Mga Nakitang Indikasyon (Detected Indicators):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {currentPrediction.detectedIndicators.map((ind, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background:
                                ind.severity === 'critical'
                                  ? '#FEE2E2'
                                  : ind.severity === 'warning'
                                  ? '#FEF3C7'
                                  : '#F3F4F6',
                              color:
                                ind.severity === 'critical'
                                  ? '#991B1B'
                                  : ind.severity === 'warning'
                                  ? '#92400E'
                                  : '#374151',
                              fontWeight: 600,
                              border: '1px solid rgba(0,0,0,0.06)',
                            }}
                          >
                            [{ind.category}] {ind.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      Inirerekomendang Susunod na Hakbang (Next Action):
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                      {currentPrediction.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 12, fontStyle: 'italic', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 8 }}>
                    Paunawa: {currentPrediction.disclaimer}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setModalOpen(false);
                stopCameraStream();
              }}
            >
              Isara
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '10px 20px', fontWeight: 700, borderRadius: 10 }}
              onClick={handleSavePrediction}
              disabled={saving || !currentPrediction || currentPrediction.status === 'INSUFFICIENT_EVIDENCE'}
            >
              {saving ? 'Isinesave...' : 'I-save ang Prediction sa Health History'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="I-delete ang Health Record"
        message="Sigurado ka bang nais mong burahin ang rekord na ito?"
        confirmLabel="I-delete"
        danger
        onConfirm={handleDeleteRecord}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
