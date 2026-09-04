/**
 * HealthPage.tsx — AlpasFarm Health Monitoring & Early Illness Prediction System
 *
 * FEATURES & WORKFLOW:
 *   1. Dedicated Health Monitoring Dashboard with Live DB counts
 *   2. Prominent Early Illness Prediction Hero Banner
 *   3. 4 Responsive Summary Metric Cards (Total Animals, High Risk, Moderate Risk, Low Risk)
 *   4. Priority Health Alerts ("Animals Requiring Immediate Attention") with vitals and review action
 *   5. Health Risk Trends Chart (7d / 30d / 90d filterable)
 *   6. Quick Actions Grid (AI Health Scanner, Record Health Check, Health History, Health Reports)
 *   7. Complete Health History Logs & Clinical Search
 *   8. Mobile-First Early Illness Prediction Modal with Computer Vision Camera ML
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';

import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import {
  HeartPulse,
  Sparkles,
  PawPrint,
  Activity,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Camera,
  Stethoscope,
  FileBarChart,
  ClipboardList,
  Search,
  Trash2,
  ChevronDown,
  ChevronRight,
  Brain,
  Upload,
  RefreshCw,
  HelpCircle,
  TrendingUp,
  Thermometer,
  Calendar,
  ArrowUpRight,
  ShieldCheck,
  Info,
  Clock,
  AlertOctagon,
} from 'lucide-react';
import { formatDate } from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import {
  predictEarlyIllness,
  EARLY_ILLNESS_MODEL_VERSION,
  type EarlyIllnessPredictionResult,
  type FarmerObservations,
} from '../lib/earlyIllnessEngine';
import { runCameraScreening, fileToCanvas, type ScanResult } from '../lib/cameraML';
import type { HealthRecord, Animal } from '../types';

// Symptom Chip Definition (100% Professional English)
interface SymptomChip {
  id: string;
  label: string;
  description: string;
}

const AVAILABLE_SYMPTOMS: SymptomChip[] = [
  { id: 'cough', label: 'Ubo / Coughing', description: 'Patuloy o madalas na pag-ubo' },
  { id: 'nasal_discharge', label: 'Sipon / Nasal Discharge', description: 'May sipon o tumutulong likido sa ilong' },
  { id: 'diarrhea', label: 'Pagtatae / Diarrhea', description: 'Basang dumi o scours' },
  { id: 'lameness', label: 'Pilay / Limping', description: 'Hirap maglakad o masakit ang paa' },
  { id: 'pale_membrane', label: 'Maputlang Mata / Gums', description: 'Posibleng anemia o parasite load' },
  { id: 'bloat', label: 'Bloated / Kabag', description: 'Lobo o namamagang tiyan' },
  { id: 'rough_coat', label: 'Magaspang na Balahibo', description: 'Matamlay o magaspang na balahibo' },
  { id: 'droopy_head', label: 'Nakalaylay ang Ulo / Nakabukod', description: 'Nahiwalay sa kawan, matamlay' },
];


/**
 * Cleans and formats raw AI/database symptoms and observation reasons into readable farm summaries.
 * Removes raw technical prefixes like [Observation], [Database History], etc. and prevents UI overflow.
 */
export function formatHealthReasons(
  rawText: string | null | undefined,
  maxItems: number = 3,
): { summary: string; items: string[]; totalCount: number } {
  if (!rawText || !rawText.trim()) {
    return {
      summary: 'Normal clinical parameters • No acute distress noted',
      items: ['Normal clinical parameters'],
      totalCount: 1,
    };
  }

  // Split on semicolons, pipes, newlines, or multiple spaces
  const rawParts = rawText
    .split(/[;\n|]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const cleanedItems: string[] = [];
  const seen = new Set<string>();

  for (const part of rawParts) {
    let cleaned = part
      // Remove technical tags like [Observation], [Database History], [Early Warning], etc.
      .replace(/\[(?:Observation|Database History|Early Warning|Camera ML|AI Assessment|Clinical|Vitals|Historical|Risk Factor)\]\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Strip leading / trailing bullets, dashes, colons
    cleaned = cleaned.replace(/^[-•*–—,:]+\s*/, '').replace(/[-•*–—,:]+$/, '').trim();

    if (!cleaned) continue;

    // Capitalize cleanly
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    const lowerKey = cleaned.toLowerCase();
    if (!seen.has(lowerKey)) {
      seen.add(lowerKey);
      cleanedItems.push(cleaned);
    }
  }

  if (cleanedItems.length === 0) {
    return {
      summary: 'Routine health check • Standard vital signs',
      items: ['Routine health check'],
      totalCount: 1,
    };
  }

  const displayed = cleanedItems.slice(0, maxItems);
  const remaining = cleanedItems.length - maxItems;

  let summary = displayed.join(' • ');
  if (remaining > 0) {
    summary += ` • +${remaining} more`;
  }

  return {
    summary,
    items: cleanedItems,
    totalCount: cleanedItems.length,
  };
}

/**
 * Returns metadata for consistent, non-wrapping risk badges & styling (ZERO emojis, Lucide icons only).
 */
export function getRecordRiskMeta(r: HealthRecord) {
  const score = r.risk_score ?? 0;
  const level = (r.risk_level || '').toLowerCase();

  if (score >= 85 || level === 'critical') {
    return {
      key: 'critical',
      label: 'Kritikal na Risk',
      score,
      badgeClass: 'risk-badge-critical',
      cardClass: 'record-card-critical',
      Icon: ShieldAlert,
      color: '#EF4444',
      nextCheck: 'Agad-agad / Sa loob ng 12 oras',
    };
  }
  if (score >= 60 || level === 'high') {
    return {
      key: 'high',
      label: 'Mataas ang Risk',
      score,
      badgeClass: 'risk-badge-high',
      cardClass: 'record-card-high',
      Icon: AlertTriangle,
      color: '#F97316',
      nextCheck: 'Sa loob ng 24 oras',
    };
  }
  if (score >= 35 || level === 'moderate' || level === 'medium') {
    return {
      key: 'moderate',
      label: 'Bantayan / Observation',
      score,
      badgeClass: 'risk-badge-mod',
      cardClass: 'record-card-mod',
      Icon: AlertTriangle,
      color: '#F59E0B',
      nextCheck: 'Sa loob ng 48 oras',
    };
  }
  return {
    key: 'low',
    label: 'Maayos / Low Risk',
    score,
    badgeClass: 'risk-badge-low',
    cardClass: 'record-card-low',
    Icon: CheckCircle2,
    color: '#16A34A',
    nextCheck: 'Sa loob ng 7 araw',
  };
}

export function HealthPage() {
  const farmData = useFarmData();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // Modal & Prediction State
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

  // Filters & UI State
  const [fRisk, setFRisk] = useState<string>('All');
  const [fAnimal, setFAnimal] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [trendRange, setTrendRange] = useState<'7' | '30' | '90'>('30');
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<HealthRecord | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HealthRecord | null>(null);

  // Active animals list
  const activeAnimals = useMemo(() => {
    return farmData.animals.filter((a) => !a.archived);
  }, [farmData.animals]);

  // Selected animal for modal
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

  // 4 Health Summary Statistics (Live Supabase DB Counts)
  const stats = useMemo(() => {
    let highRisk = 0;
    let modRisk = 0;
    let lowRisk = 0;

    activeAnimals.forEach((a) => {
      const score = a.health_risk_score ?? 0;
      if (score >= 65 || a.health_status === 'Critical' || a.health_status === 'At Risk') {
        highRisk++;
      } else if (score >= 35 || a.health_status === 'Monitor') {
        modRisk++;
      } else {
        lowRisk++;
      }
    });

    return {
      total: activeAnimals.length,
      highRisk,
      modRisk,
      lowRisk,
    };
  }, [activeAnimals]);

  // Priority Health Alerts ("Animals Requiring Immediate Attention")
  const priorityAnimals = useMemo(() => {
    const list: {
      animal: Animal;
      record?: HealthRecord;
      riskScore: number;
      riskLevel: 'High' | 'Moderate' | 'Low';
      condition: string;
      temperature: number | null;
      heartRate: number | null;
      weight: number | null;
      lastCheck: string | null;
      delta: number;
    }[] = [];

    activeAnimals.forEach((animal) => {
      const records = farmData.healthRecords
        .filter((r) => r.animal_id === animal.id)
        .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());

      const latest = records[0];
      const prev = records[1];
      const delta = latest && prev ? latest.risk_score - prev.risk_score : 0;
      const score = latest?.risk_score ?? animal.health_risk_score ?? 0;
      const isHigh = score >= 65 || animal.health_status === 'Critical' || animal.health_status === 'At Risk';
      const isMod = (score >= 35 && score < 65) || animal.health_status === 'Monitor';
      const isJump = delta >= 20;

      if (isHigh || isJump || isMod) {
        list.push({
          animal,
          record: latest,
          riskScore: score,
          riskLevel: isHigh ? 'High' : isMod ? 'Moderate' : 'Low',
          condition:
            latest?.detected_conditions ||
            latest?.reasons ||
            (isHigh ? 'High illness risk flagged' : 'Requires monitoring'),
          temperature: latest?.temperature ?? animal.current_temperature ?? null,
          heartRate: latest?.heart_rate ?? null,
          weight: animal.weight_kg ?? null,
          lastCheck: latest?.record_date ?? null,
          delta,
        });
      }
    });

    // Sort highest risk first
    return list.sort((a, b) => b.riskScore - a.riskScore);
  }, [activeAnimals, farmData.healthRecords]);

  // Health Risk Trends over Time (7d / 30d / 90d)
  const trendData = useMemo(() => {
    const now = new Date();
    const days = Number(trendRange);
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const rangeRecords = farmData.healthRecords.filter(
      (r) => new Date(r.record_date).getTime() >= cutoff.getTime()
    );

    let highCount = 0;
    let modCount = 0;
    let lowCount = 0;
    let totalScore = 0;

    rangeRecords.forEach((r) => {
      const score = r.risk_score ?? 0;
      totalScore += score;
      if (score >= 65 || r.risk_level === 'High') highCount++;
      else if (score >= 35 || r.risk_level === 'Moderate') modCount++;
      else lowCount++;
    });

    const avgScore = rangeRecords.length > 0 ? Math.round(totalScore / rangeRecords.length) : 0;

    return {
      totalRecords: rangeRecords.length,
      highCount,
      modCount,
      lowCount,
      avgScore,
      records: rangeRecords,
    };
  }, [farmData.healthRecords, trendRange]);

  // Filtered health records for history table
  const filteredRecords = useMemo(() => {
    return farmData.healthRecords
      .filter((r) => {
        if (fRisk !== 'All') {
          const meta = getRecordRiskMeta(r);
          if (fRisk.toLowerCase() !== meta.key) return false;
        }
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

  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'add' || params.get('action') === 'check') {
      openPredictionModal();
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);


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
      setCameraError('Unable to access camera. Please check camera permissions or upload an image.');
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
        toast('This is not a goat or sheep. Please scan a goat or sheep.', 'warning');
      } else {
        toast('Camera ML visual assessment completed successfully!', 'success');
      }
      stopCameraStream();
    } catch (err: any) {
      setCameraError(err.message || 'Camera screening failed.');
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
        toast('This is not a goat or sheep. Please upload a goat or sheep image.', 'warning');
      } else {
        toast('Image assessment completed successfully!', 'success');
      }
    } catch (err: any) {
      setCameraError(err.message || 'Image evaluation failed.');
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
      toast('Insufficient evidence. Please provide at least one observation or camera scan before saving.', 'warning');
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
            ? `Risk Jump Alert (${selectedAnimal.name}): +${currentPrediction.riskDelta ?? 0}% risk increase`
            : `${selectedAnimal.name}: High Health Risk (${currentPrediction.riskScore}%)`;

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

      toast('Early Illness Prediction saved successfully!', 'success');
      setModalOpen(false);
      stopCameraStream();
      farmData.refresh();
    } catch (err: any) {
      toast(err.message || 'Unable to save record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!confirmDelete) return;
    try {
      const { error } = await supabase.from('health_records').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Health record deleted successfully.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Failed to delete record.', 'error');
    }
  };

  // Clean up camera stream when modal closes
  useEffect(() => {
    if (!modalOpen) {
      stopCameraStream();
    }
  }, [modalOpen]);

  const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown Animal';
  const animalTag = (id: string) => farmData.animals.find((a) => a.id === id)?.tag_id ?? '';

  return (
    <div className="health-page-container">
      {/* ── 1. PAGE HEADER ── */}
      <div className="health-page-header">
        <div className="health-header-left">
          <div className="health-icon-badge">
            <HeartPulse size={24} color="#FF7A18" />
          </div>
          <div>
            <h1 className="health-page-title">Health Monitoring</h1>
            <p className="health-page-subtitle">
              Subaybayan ang kalagayan ng bawat kambing at tupa.
            </p>
          </div>
        </div>

        <button
          className="btn btn-primary health-primary-btn"
          onClick={() => navigate('/camera-screening')}
        >
          <Camera size={18} />
          <span>Buksan ang AI Health Scanner</span>
        </button>
      </div>

      {/* ── 2. AI HEALTH MONITORING HERO BANNER ── */}
      <div className="prediction-hero-banner">
        <div className="hero-banner-content">
          <div className="hero-badge">
            <Camera size={14} color="#FF7A18" />
            <span>AI Health Scanner</span>
          </div>
          <h2 className="hero-banner-title">Awtomatikong AI Health Monitoring</h2>
          <p className="hero-banner-desc">
            Itutok ang camera sa kambing o tupa. Awtomatikong kikilalanin ng system ang hayop, susuriin ang visual indicators, titingnan ang records sa bukid, at magbibigay ng paunang pagsusuri nang mabilis at madali.
          </p>
          <div className="hero-banner-actions">
            <button
              className="btn btn-primary"
              style={{
                borderRadius: 12,
                padding: '11px 22px',
                fontWeight: 700,
                fontSize: 14,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
              onClick={() => navigate('/camera-screening')}
            >
              <Camera size={16} />
              <span>Buksan ang AI Health Scanner</span>
            </button>
            <button
              className="btn btn-outline"
              style={{
                borderRadius: 12,
                padding: '11px 20px',
                fontWeight: 600,
                fontSize: 14,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
              onClick={() => openPredictionModal()}
            >
              <Stethoscope size={16} />
              <span>Manual Health Check (Opsyonal)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. 3 HEALTH SUMMARY METRIC CARDS (STRICTLY 3 COLUMNS) ── */}
      <div className="health-summary-grid mobile-stats-grid-3">
        {/* Healthy Card */}
        <div className="health-stat-card low-risk-card mobile-stats-card-3">
          <div className="stat-card-header">
            <span className="stat-label low-risk-label">Healthy</span>
            <CheckCircle2 size={18} color="#16A34A" />
          </div>
          <div className="stat-value low-risk-value">{stats.lowRisk}</div>
          <div className="stat-subtext low-risk-subtext">Maayos</div>
        </div>

        {/* Moderate Risk / Monitor Card */}
        <div className="health-stat-card mod-risk-card mobile-stats-card-3">
          <div className="stat-card-header">
            <span className="stat-label mod-risk-label">Bantayan</span>
            <AlertTriangle size={18} color="#F59E0B" />
          </div>
          <div className="stat-value mod-risk-value">{stats.modRisk}</div>
          <div className="stat-subtext mod-risk-subtext">Obserbahan</div>
        </div>

        {/* High Risk Card */}
        <div className="health-stat-card high-risk-card mobile-stats-card-3">
          <div className="stat-card-header">
            <span className="stat-label high-risk-label">High Risk</span>
            <ShieldAlert size={18} color="#EF4444" />
          </div>
          <div className="stat-value high-risk-value">{stats.highRisk}</div>
          <div className="stat-subtext high-risk-subtext">Atensyon</div>
        </div>
      </div>

      {/* ── 4. PRIORITY HEALTH ALERTS ("Animals Requiring Immediate Attention") ── */}
      <div className="priority-alerts-section">
        <div className="section-header">
          <div className="section-title-group">
            <ShieldAlert size={20} color="#EF4444" />
            <h2 className="section-title">Mga Hayop na Nangangailangan ng Agarang Atensyon</h2>
          </div>
          <span className="badge badge-critical" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20 }}>
            {priorityAnimals.length} May Paalala
          </span>
        </div>

        {priorityAnimals.length === 0 ? (
          <div className="priority-empty-state">
            <CheckCircle2 size={36} color="#16A34A" />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
                Lahat ng hayop ay nasa maayos na kalagayan
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                Walang aktibong kritikal na alerto o biglaang pagtaas ng risk sa bukid.
              </div>
            </div>
          </div>
        ) : (
          <div className="priority-animals-grid">
            {priorityAnimals.map((item) => {
              const isHigh = item.riskLevel === 'High';
              return (
                <div key={item.animal.id} className={`priority-animal-card ${isHigh ? 'card-high' : 'card-mod'}`}>
                  <div className="card-top-row">
                    <div>
                      <div className="animal-title-row">
                        <span className="animal-name">{item.animal.name}</span>
                        <span className="animal-tag">{item.animal.tag_id}</span>
                        <span className="species-badge">{item.animal.species || 'Goat'}</span>
                      </div>
                      <div className="condition-text">{item.condition}</div>
                    </div>

                    <div className="risk-badge-group">
                      <span className={`risk-pill ${isHigh ? 'risk-pill-high' : 'risk-pill-mod'}`}>
                        {item.riskLevel === 'High' ? 'Mataas ang Risk' : 'Bantayan'} ({item.riskScore}%)
                      </span>
                      {item.delta >= 20 && (
                        <span className="jump-badge">+{item.delta}% Pagtaas</span>
                      )}
                    </div>
                  </div>

                  {/* Vitals & Summary Row */}
                  <div className="vitals-row">
                    <div className="vital-item">
                      <Thermometer size={13} color="var(--text-secondary)" />
                      <span>Temp: <strong>{item.temperature ? `${item.temperature}°C` : 'Hindi sinukat'}</strong></span>
                    </div>
                    <div className="vital-item">
                      <Activity size={13} color="var(--text-secondary)" />
                      <span>Heart: <strong>{item.heartRate ? `${item.heartRate} bpm` : 'Hindi sinukat'}</strong></span>
                    </div>
                    <div className="vital-item">
                      <PawPrint size={13} color="var(--text-secondary)" />
                      <span>Weight: <strong>{item.weight ? `${item.weight} kg` : 'Hindi nakatala'}</strong></span>
                    </div>
                    <div className="vital-item">
                      <Calendar size={13} color="var(--text-secondary)" />
                      <span>Huling Check: <strong>{item.lastCheck ? formatDate(item.lastCheck) : 'Wala pa'}</strong></span>
                    </div>
                  </div>

                  {/* Card Action */}
                  <div className="card-action-row">
                    <button
                      className="btn btn-primary btn-sm"
                      style={{
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 13,
                        padding: '6px 14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onClick={() => navigate('/camera-screening?animalId=' + item.animal.id)}
                    >
                      <Camera size={14} />
                      <span>I-scan gamit ang AI</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 5. HEALTH RISK TRENDS CHART ── */}
      <div className="health-trends-section">
        <div className="section-header">
          <div className="section-title-group">
            <TrendingUp size={20} color="#FF7A18" />
            <h2 className="section-title">Health Risk Trends</h2>
          </div>

          <div className="trend-range-tabs">
            {(['7', '30', '90'] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`trend-tab ${trendRange === r ? 'trend-tab-active' : ''}`}
                onClick={() => setTrendRange(r)}
              >
                {r} Days
              </button>
            ))}
          </div>
        </div>

        {trendData.totalRecords === 0 ? (
          <div className="trends-empty-state">
            <TrendingUp size={36} color="var(--border)" />
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginTop: 8 }}>
              No historical health data available yet for this period.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Run regular Early Illness Predictions or record health assessments to build trend analytics.
            </div>
          </div>
        ) : (
          <div className="trends-metrics-container">
            <div className="trend-stat-row">
              <div className="trend-stat-box">
                <span className="trend-box-label">Assessments in Window</span>
                <span className="trend-box-val">{trendData.totalRecords}</span>
              </div>
              <div className="trend-stat-box">
                <span className="trend-box-label">Average Risk Score</span>
                <span className="trend-box-val" style={{ color: trendData.avgScore >= 65 ? '#EF4444' : trendData.avgScore >= 35 ? '#F59E0B' : '#16A34A' }}>
                  {trendData.avgScore}%
                </span>
              </div>
              <div className="trend-stat-box">
                <span className="trend-box-label">High Risk Logs</span>
                <span className="trend-box-val" style={{ color: '#EF4444' }}>{trendData.highCount}</span>
              </div>
              <div className="trend-stat-box">
                <span className="trend-box-label">Low Risk Logs</span>
                <span className="trend-box-val" style={{ color: '#16A34A' }}>{trendData.lowCount}</span>
              </div>
            </div>

            {/* Visual Risk Distribution Bar */}
            <div className="trend-bar-wrapper">
              <div className="trend-bar-title">Risk Level Distribution ({trendRange} Days):</div>
              <div className="trend-bar-track">
                {trendData.highCount > 0 && (
                  <div
                    className="trend-bar-segment segment-high"
                    style={{ width: `${(trendData.highCount / trendData.totalRecords) * 100}%` }}
                    title={`High Risk: ${trendData.highCount}`}
                  />
                )}
                {trendData.modCount > 0 && (
                  <div
                    className="trend-bar-segment segment-mod"
                    style={{ width: `${(trendData.modCount / trendData.totalRecords) * 100}%` }}
                    title={`Moderate Risk: ${trendData.modCount}`}
                  />
                )}
                {trendData.lowCount > 0 && (
                  <div
                    className="trend-bar-segment segment-low"
                    style={{ width: `${(trendData.lowCount / trendData.totalRecords) * 100}%` }}
                    title={`Low Risk: ${trendData.lowCount}`}
                  />
                )}
              </div>
              <div className="trend-bar-legend">
                <span className="legend-item"><span className="legend-dot dot-high" /> High ({trendData.highCount})</span>
                <span className="legend-item"><span className="legend-dot dot-mod" /> Moderate ({trendData.modCount})</span>
                <span className="legend-item"><span className="legend-dot dot-low" /> Low ({trendData.lowCount})</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 6. QUICK ACTIONS SECTION ── */}
      <div className="quick-actions-section">
        <h2 className="section-title" style={{ marginBottom: 14 }}>Mabilis na Aksyon</h2>
        <div className="quick-actions-grid">
          {/* Card 1: AI Health Scanner */}
          <div className="action-card" onClick={() => navigate('/camera-screening')}>
            <div className="action-card-icon icon-purple">
              <Camera size={22} color="#8B5CF6" />
            </div>
            <div className="action-card-title">AI Health Scanner</div>
            <div className="action-card-desc">Visual screening at pagsusuri gamit ang camera</div>
            <div className="action-card-arrow">
              <ArrowUpRight size={16} />
            </div>
          </div>

          {/* Card 2: Record Health Check */}
          <div className="action-card" onClick={() => openPredictionModal()}>
            <div className="action-card-icon icon-orange">
              <Stethoscope size={22} color="#FF7A18" />
            </div>
            <div className="action-card-title">Magtala ng Health Check</div>
            <div className="action-card-desc">Itala ang temperatura, vitals, at pisikal na obserbasyon</div>
            <div className="action-card-arrow">
              <ArrowUpRight size={16} />
            </div>
          </div>

          {/* Card 3: Health History */}
          <div
            className="action-card"
            onClick={() => {
              const el = document.getElementById('health-history-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <div className="action-card-icon icon-blue">
              <ClipboardList size={22} color="#3B82F6" />
            </div>
            <div className="action-card-title">Kasaysayan ng Kalusugan</div>
            <div className="action-card-desc">Tingnan ang lahat ng nakaraang health records</div>
            <div className="action-card-arrow">
              <ArrowUpRight size={16} />
            </div>
          </div>

          {/* Card 4: Health Reports */}
          <div className="action-card" onClick={() => navigate('/reports')}>
            <div className="action-card-icon icon-green">
              <FileBarChart size={22} color="#10B981" />
            </div>
            <div className="action-card-title">Mga Ulat sa Kalusugan</div>
            <div className="action-card-desc">Bumuo ng diagnostic summaries at clinical export</div>
            <div className="action-card-arrow">
              <ArrowUpRight size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 7. HEALTH HISTORY & LOGS ── */}
      <div id="health-history-section" className="health-history-section">
        <div className="history-section-header">
          <div className="history-title-group">
            <Stethoscope size={20} color="#FF7A18" />
            <h2 className="section-title">Kasaysayan at Talaan ng Kalusugan</h2>
          </div>
          <span className="history-count-badge">
            {filteredRecords.length} {filteredRecords.length === 1 ? 'RECORD NA NAKITA' : 'MGA RECORD NA NAKITA'}
          </span>
        </div>

        {/* Filter Toolbar */}
        <div className="history-filter-bar">
          <div className="search-input-wrapper">
            <Search size={16} color="var(--text-secondary)" className="search-icon" />
            <input
              type="text"
              className="input search-input"
              placeholder="Maghanap ng animal, ID, breed, o sintomas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-selects-row">
            <select
              className="input select-input"
              value={fRisk}
              onChange={(e) => setFRisk(e.target.value)}
            >
              <option value="All">Lahat ng Risk Level</option>
              <option value="critical">Kritikal na Risk</option>
              <option value="high">Mataas ang Risk</option>
              <option value="moderate">Bantayan</option>
              <option value="low">Maayos / Mababang Risk</option>
            </select>

            <select
              className="input select-input"
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
        </div>

        {/* Records List */}
        {filteredRecords.length === 0 ? (
          <div className="records-empty-state">
            <HeartPulse size={40} color="var(--border)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Wala pang health records na tumutugma sa filter.
            </p>
            <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-secondary)' }}>
              Mag-scan o magtala ng bagong health assessment para makita ang talaan dito.
            </p>
          </div>
        ) : (
          <div className="records-list">
            {filteredRecords.map((r) => {
              const anName = animalName(r.animal_id);
              const tag = animalTag(r.animal_id);
              const riskMeta = getRecordRiskMeta(r);
              const reasonsData = formatHealthReasons(r.detected_conditions || r.reasons, 3);

              return (
                <div
                  key={r.id}
                  className={`health-log-card ${riskMeta.cardClass}`}
                  onClick={() => {
                    setSelectedRecordForDetail(r);
                    setDetailModalOpen(true);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedRecordForDetail(r);
                      setDetailModalOpen(true);
                    }
                  }}
                >
                  {/* Left Icon Badge */}
                  <div className="health-log-icon-box">
                    <Stethoscope size={18} />
                  </div>

                  {/* Main Content Info */}
                  <div className="health-log-main">
                    <div className="health-log-header-line">
                      <span className="health-log-animal-name" title={anName}>{anName}</span>
                      {tag && <span className="health-log-tag-badge">{tag}</span>}
                      <span className="health-log-date-badge">• {formatDate(r.record_date)}</span>
                    </div>
                    <div className="health-log-symptoms" title={reasonsData.items.join(' • ')}>
                      {reasonsData.summary}
                    </div>
                  </div>

                  {/* Right Risk Badge */}
                  <div className="health-log-badge-box">
                    <span className={`health-risk-badge ${riskMeta.badgeClass}`}>
                      <riskMeta.Icon size={13} strokeWidth={2.5} />
                      <span>{riskMeta.label} ({riskMeta.score}%)</span>
                    </span>
                  </div>

                  {/* Right Chevron Arrow */}
                  <div className="health-log-arrow-box">
                    <ChevronRight size={18} className="health-log-arrow" />
                  </div>

                  {/* Mobile-Only Stacking Structure */}
                  <div className="health-log-mobile-container">
                    <div className="health-log-mobile-header">
                      <div className="health-log-icon-box">
                        <Stethoscope size={16} />
                      </div>
                      <div className="health-log-mobile-title-wrap">
                        <span className="health-log-animal-name" title={anName}>{anName}</span>
                        <div className="health-log-mobile-meta">
                          {tag && <span className="health-log-tag-badge">{tag}</span>}
                          <span className="health-log-date-badge">• {formatDate(r.record_date)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="health-log-symptoms health-log-mobile-symptoms" title={reasonsData.items.join(' • ')}>
                      {reasonsData.summary}
                    </div>

                    <div className="health-log-mobile-footer">
                      <span className={`health-risk-badge ${riskMeta.badgeClass}`}>
                        <riskMeta.Icon size={12} strokeWidth={2.5} />
                        <span>{riskMeta.label} ({riskMeta.score}%)</span>
                      </span>
                      <div className="health-log-arrow-box">
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 8. EARLY ILLNESS PREDICTION MODAL (100% ENGLISH) ── */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          stopCameraStream();
        }}
        size="lg"
      >
        <ModalHeader
          title="Manual Health Check (Para sa Beterinaryo o Farm Staff)"
          onClose={() => {
            setModalOpen(false);
            stopCameraStream();
          }}
        />
        <ModalBody>
        <div className="modal-inner-flow">
          {/* Professional Vet Note */}
          <div style={{
            display: 'flex',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            fontSize: 12,
            color: '#1E40AF',
            lineHeight: 1.5,
            marginBottom: 14,
          }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Opsyonal na Health Form:</strong> Ang form na ito ay para sa manual na pagsusuri ng beterinaryo o farm staff. Para sa mabilisang herd screening gamit ang camera, gamitin ang <strong>AI Health Scanner</strong>.
            </div>
          </div>
          {/* STEP 1: Animal Selector */}
          <div>
            <label className="modal-step-label">
              1. Pumili ng Hayop *
            </label>
            <select
              className="input modal-animal-select"
              value={selectedAnimalId}
              onChange={(e) => setSelectedAnimalId(e.target.value)}
            >
              {activeAnimals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.species === 'Sheep' ? 'Tupa' : 'Kambing'}: {a.name} ({a.tag_id}) — Health: {a.health_status}
                </option>
              ))}
            </select>
          </div>

          {/* STEP 2: Automated Database Context */}
          {currentPrediction && (
            <div className="modal-context-card">
              <div className="context-card-title">
                <Brain size={15} />
                <span>Impormasyon Mula sa Database:</span>
              </div>
              <div className="context-grid">
                <div>Edad: <strong>{currentPrediction.contextSummary.ageMonths} buwan</strong></div>
                <div>Timbang: <strong>{selectedAnimal?.weight_kg ? `${selectedAnimal.weight_kg} kg` : 'Hindi nakatala'}</strong> ({currentPrediction.contextSummary.weightTrend})</div>
                <div>Bakuna: <strong>{currentPrediction.contextSummary.vaccinationStatus}</strong></div>
                <div>Nakaraang Risk: <strong>{currentPrediction.previousRiskScore !== null ? `${currentPrediction.previousRiskScore}%` : 'Bagong tala'}</strong></div>
              </div>
            </div>
          )}

          {/* STEP 3: Farmer Observations */}
          <div className="modal-observations-card">
            <div className="modal-step-label" style={{ marginBottom: 12 }}>
              2. Obserbasyon sa Kalusugan (Opsyonal):
            </div>

            {/* Temperature with quick presets */}
            <div style={{ marginBottom: 16 }}>
              <label className="obs-field-label">
                Temperatura ng Katawan (°C):
              </label>
              <div className="temp-presets-row">
                <input
                  type="number"
                  step="0.1"
                  placeholder="hal. 39.2"
                  className="input temp-input"
                  value={obsTemp}
                  onChange={(e) => setObsTemp(e.target.value)}
                />
                <button
                  type="button"
                  className={`btn btn-sm ${obsTemp === '39.0' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 12, borderRadius: 8 }}
                  onClick={() => setObsTemp(obsTemp === '39.0' ? '' : '39.0')}
                >
                  Normal (39.0°C)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${obsTemp === '40.2' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 12, borderRadius: 8 }}
                  onClick={() => setObsTemp(obsTemp === '40.2' ? '' : '40.2')}
                >
                  Medyo Mainit (40.2°C)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${obsTemp === '41.0' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 12, borderRadius: 8 }}
                  onClick={() => setObsTemp(obsTemp === '41.0' ? '' : '41.0')}
                >
                  Lagnat (41.0°C)
                </button>
              </div>
            </div>

            {/* Appetite Buttons */}
            <div style={{ marginBottom: 16 }}>
              <label className="obs-field-label">
                Gana sa Pagkain (Appetite):
              </label>
              <div className="chip-buttons-row">
                {(['Normal', 'Reduced', 'None'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="btn btn-sm"
                    style={{
                      borderRadius: 10,
                      background:
                        obsAppetite === mode
                          ? mode === 'Normal'
                            ? '#16A34A'
                            : mode === 'Reduced'
                            ? '#D97706'
                            : '#DC2626'
                          : 'var(--surface)',
                      color: obsAppetite === mode ? '#FFF' : 'var(--text)',
                      fontWeight: 700,
                      border: '1px solid var(--border)',
                    }}
                    onClick={() => setObsAppetite(obsAppetite === mode ? null : mode)}
                  >
                    {mode === 'Normal' ? 'Normal / Magana' : mode === 'Reduced' ? 'Mahina ang Gana' : 'Walang Gana / Ayaw Kumain'}
                  </button>
                ))}
              </div>
            </div>

            {/* Activity Level Buttons */}
            <div style={{ marginBottom: 16 }}>
              <label className="obs-field-label">
                Lebel ng Sigla (Activity):
              </label>
              <div className="chip-buttons-row">
                {(['Normal', 'Low', 'Lethargic'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="btn btn-sm"
                    style={{
                      borderRadius: 10,
                      background:
                        obsActivity === mode
                          ? mode === 'Normal'
                            ? '#16A34A'
                            : mode === 'Low'
                            ? '#D97706'
                            : '#DC2626'
                          : 'var(--surface)',
                      color: obsActivity === mode ? '#FFF' : 'var(--text)',
                      fontWeight: 700,
                      border: '1px solid var(--border)',
                    }}
                    onClick={() => setObsActivity(obsActivity === mode ? null : mode)}
                  >
                    {mode === 'Normal' ? 'Aktibo / Normal' : mode === 'Low' ? 'Matamlay / Mababa' : 'Lethargic / Nakabukod'}
                  </button>
                ))}
              </div>
            </div>

            {/* Visible Symptoms Chips */}
            <div>
              <label className="obs-field-label">
                Mga Nakikitang Sintomas (Pindutin para piliin):
              </label>
              <div className="symptoms-chips-wrap">
                {AVAILABLE_SYMPTOMS.map((s) => {
                  const active = selectedSymptoms.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`symptom-chip ${active ? 'symptom-chip-active' : ''}`}
                      onClick={() => toggleSymptom(s.id)}
                    >
                      <Activity size={12} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* STEP 4: Camera ML Visual Scanner */}
          <div className="modal-camera-card">
            <div className="camera-header-row">
              <div className="camera-header-title">
                <Camera size={16} color="#8B5CF6" />
                <span>3. Visual Health Scanner (Camera ML - Opsyonal):</span>
              </div>
              {cameraResult && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, color: '#EF4444' }}
                  onClick={() => setCameraResult(null)}
                >
                  I-clear ang Scan
                </button>
              )}
            </div>

            {/* Controls */}
            {!cameraResult && !cameraActive && (
              <div className="camera-action-buttons">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={startCamera}
                >
                  <Camera size={14} />
                  <span>Simulan ang Live Camera</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  <span>Mag-upload ng Litrato</span>
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
              <div className="camera-live-container">
                <div className="camera-video-wrapper">
                  <video ref={videoRef} playsInline autoPlay muted style={{ width: '100%', display: 'block' }} />
                  {cameraScanning && (
                    <div className="camera-scanning-overlay">
                      <RefreshCw size={20} className="animate-spin" />
                      <span>Analyzing livestock visuals via MobileNetV2...</span>
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
                    Kumuha at I-scan Ngayon
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ borderRadius: 8 }}
                    onClick={stopCameraStream}
                  >
                    I-cancel
                  </button>
                </div>
              </div>
            )}

            {cameraScanning && !cameraActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, color: '#8B5CF6', fontSize: 13, fontWeight: 700 }}>
                <RefreshCw size={16} className="animate-spin" /> Sinusuri ang imahe gamit ang computer vision...
              </div>
            )}

            {cameraError && (
              <div className="camera-error-banner">
                {cameraError}
              </div>
            )}

            {cameraResult && (
              <div className={`scan-result-card ${cameraResult.goatDetected ? 'result-success' : 'result-error'}`}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: cameraResult.goatDetected ? '#7C3AED' : '#EF4444' }}>
                    {cameraResult.goatDetected
                      ? `${cameraResult.species === 'sheep' ? 'Tupa' : 'Kambing'} detected (${Math.round(cameraResult.goatDetectionConfidence * 100)}% match)`
                      : 'Hindi ito kambing o tupa'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Visual Risk: {cameraResult.riskLevelLabel} · Confidence: {Math.round(cameraResult.confidence * 100)}%
                  </div>
                </div>
                <Activity size={18} color={cameraResult.goatDetected ? '#7C3AED' : '#EF4444'} />
              </div>
            )}
          </div>

          {/* STEP 5: Instant Real-Time Prediction Output */}
          {currentPrediction && (
            <div>
              {currentPrediction.status === 'INSUFFICIENT_EVIDENCE' ? (
                <div className="prediction-insufficient-card">
                  <HelpCircle size={24} color="#D97706" style={{ flexShrink: 0 }} />
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#92400E' }}>
                      Kulang ang Datos — Mag-rescan o maglagay ng health check
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#78350F' }}>
                      Mangyaring maglagay ng kahit isang clinical parameter (temperatura, gana, sigla) o magsagawa ng camera scan.
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`prediction-result-card result-${currentPrediction.riskLevel.toLowerCase().replace(' ', '-')}`}>
                  <div className="result-header-row">
                    <div>
                      <span className="result-header-label">
                        Resulta ng AI Health Screening
                      </span>
                      <div className="result-score-line">
                        <span className={`result-score-text score-${currentPrediction.riskLevel.toLowerCase().replace(' ', '-')}`}>
                          {currentPrediction.riskLevel} ({currentPrediction.riskScore}%)
                        </span>
                        <span className="result-confidence">
                          · {currentPrediction.confidencePercent}% ML Confidence
                        </span>
                      </div>
                    </div>

                    <div className="result-vet-badge">
                      {currentPrediction.veterinaryAttention}
                    </div>
                  </div>

                  {/* Possible Health Concerns */}
                  {currentPrediction.possibleConcerns.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                        Posibleng Health Concern:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {currentPrediction.possibleConcerns.map((c, i) => (
                          <div key={i} className="concern-item">
                            <span style={{ fontWeight: 800, color: c.severity === 'Critical' ? '#EF4444' : '#F59E0B' }}>
                              {c.condition}:
                            </span>{' '}
                            <span style={{ color: 'var(--text)' }}>{c.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detected Indicators */}
                  {currentPrediction.detectedIndicators.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                        Mga Nakitang Indikasyon:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {currentPrediction.detectedIndicators.map((ind, i) => (
                          <span
                            key={i}
                            className={`indicator-badge ind-${ind.severity}`}
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
                      Rekomendasyon / Susunod na Hakbang:
                    </div>
                    <ul className="rec-list">
                      {currentPrediction.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="disclaimer-text">
                    Paunawa: Ang resulta ng AI ay para lamang sa maagang pag-monitor at decision support, hindi kumpirmadong diagnosis ng lisensyadong beterinaryo.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Modal Action Buttons */}
          <div className="modal-actions-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setModalOpen(false);
                stopCameraStream();
              }}
            >
              I-cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '10px 22px', fontWeight: 700, borderRadius: 10 }}
              onClick={handleSavePrediction}
              disabled={saving || !currentPrediction || currentPrediction.status === 'INSUFFICIENT_EVIDENCE'}
            >
              {saving ? 'Inililigtas...' : 'I-save ang Record sa Health History'}
            </button>
          </div>
        </div>
        </ModalBody>
      </Modal>

      
      {/* ── 7.1 HEALTH ASSESSMENT LOG DETAILS MODAL ── */}
      <Modal
        open={detailModalOpen && selectedRecordForDetail !== null}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedRecordForDetail(null);
        }}
        size="lg"
      >
        <ModalHeader
          title="Mga Detalye ng Health Record"
          onClose={() => {
            setDetailModalOpen(false);
            setSelectedRecordForDetail(null);
          }}
        />
        <ModalBody>
          {selectedRecordForDetail && (() => {
            const r = selectedRecordForDetail;
            const an = farmData.animals.find((a) => a.id === r.animal_id);
            const riskMeta = getRecordRiskMeta(r);
            const reasonsData = formatHealthReasons(r.reasons, 12);
            const conditionsData = formatHealthReasons(r.detected_conditions, 12);

            return (
              <div className="detail-modal-flow">
                {/* 1. Animal Information */}
                <div className="detail-card">
                  <div className="detail-card-head">
                    <PawPrint size={16} color="var(--primary)" />
                    <span>Impormasyon ng Hayop</span>
                  </div>
                  <div className="detail-grid-2x2">
                    <div className="detail-field">
                      <span className="detail-field-lbl">Pangalan ng Hayop</span>
                      <span className="detail-field-val font-bold">{an?.name || 'Walang Pangalan'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-field-lbl">Tag ID</span>
                      <span className="detail-tag-badge">{an?.tag_id || 'N/A'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-field-lbl">Species at Lahi</span>
                      <span className="detail-field-val">{an?.species === 'Sheep' ? 'Tupa' : 'Kambing'} • {an?.breed || 'Standard'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-field-lbl">Petsa ng Pagtala</span>
                      <span className="detail-field-val">{formatDate(r.record_date)}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Health Assessment Overview */}
                <div className="detail-card">
                  <div className="detail-card-head">
                    <Activity size={16} color="var(--primary)" />
                    <span>Pagsusuri sa Kalusugan</span>
                  </div>
                  <div className="detail-assessment-banner">
                    <span className={`health-risk-badge ${riskMeta.badgeClass} detail-lg-badge`}>
                      <riskMeta.Icon size={15} strokeWidth={2.5} />
                      <span>{riskMeta.label} ({riskMeta.score}%)</span>
                    </span>
                    <div className="detail-assessment-condition">
                      {r.detected_conditions || (riskMeta.key === 'low' ? 'Maayos ang Kalagayan' : 'May Paalala sa Kalusugan')}
                    </div>
                  </div>
                </div>

                {/* 3. Detected Factors & Vitals */}
                <div className="detail-card">
                  <div className="detail-card-head">
                    <Stethoscope size={16} color="var(--primary)" />
                    <span>Mga Nakitang Indikasyon at Obserbasyon</span>
                  </div>

                  {/* Vitals summary */}
                  <div className="detail-vitals-row">
                    {r.temperature !== undefined && r.temperature !== null && (
                      <span className={`detail-vital-chip ${r.temperature > 39.8 ? 'vital-warn' : 'vital-ok'}`}>
                        <Thermometer size={13} />
                        <span>Temp: {r.temperature}°C</span>
                      </span>
                    )}
                    {r.heart_rate !== undefined && r.heart_rate !== null && (
                      <span className="detail-vital-chip vital-ok">
                        <Activity size={13} />
                        <span>Heart Rate: {r.heart_rate} bpm</span>
                      </span>
                    )}
                    {r.appetite && (
                      <span className={`detail-vital-chip ${r.appetite === 'Normal' ? 'vital-ok' : 'vital-warn'}`}>
                        <span>Gana: {r.appetite === 'Normal' ? 'Normal / Magana' : r.appetite === 'Reduced' ? 'Mahina' : 'Walang Gana'}</span>
                      </span>
                    )}
                    {r.activity_level && (
                      <span className={`detail-vital-chip ${r.activity_level === 'Normal' ? 'vital-ok' : 'vital-warn'}`}>
                        <span>Sigla: {r.activity_level === 'Normal' ? 'Aktibo' : r.activity_level === 'Low' ? 'Matamlay' : 'Lethargic'}</span>
                      </span>
                    )}
                  </div>

                  {/* Clean bulleted factor list */}
                  <ul className="detail-factor-bullets">
                    {reasonsData.items.map((item, idx) => (
                      <li key={idx} className="detail-factor-bullet">
                        {riskMeta.key === 'low' ? (
                          <CheckCircle2 size={15} color="#16A34A" className="detail-bullet-icon" />
                        ) : (
                          <AlertTriangle size={15} color={riskMeta.color} className="detail-bullet-icon" />
                        )}
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 4. Recommendation & Actions */}
                <div className="detail-card">
                  <div className="detail-card-head">
                    <Sparkles size={16} color="var(--primary)" />
                    <span>Rekomendasyon sa Kalusugan</span>
                  </div>
                  <p className="detail-rec-intro">
                    {r.recommendation || (riskMeta.key === 'low'
                      ? 'Ipagpatuloy ang regular na pag-monitor. Walang kinakailangang agarang gamutan.'
                      : 'Bantayan nang maigi ang hayop. Maglagay ng regular na pisikal na check at ibukod kung lumala.')}
                  </p>
                  <div className="detail-action-steps">
                    <div className="detail-action-steps-title">Mga Mungkahing Hakbang:</div>
                    <ul className="detail-action-list">
                      {riskMeta.key === 'low' ? (
                        <>
                          <li>Ipagpatuloy ang regular na monitoring schedule</li>
                          <li>Siguraduhing may malinis na inuming tubig at sapat na pakain</li>
                          <li>Panatilihin ang routine na pagbabakuna at pagpurga</li>
                        </>
                      ) : (
                        <>
                          <li>Kumuha ng temperatura 2 beses sa isang araw</li>
                          <li>Suriin ang kulay ng mata at gums (FAMACHA check)</li>
                          <li>Obserbahan ang gana sa pagkain at inuming tubig sa loob ng 24 oras</li>
                          <li>Ihiwalay sa kawan kung may hinalang nakahahawang ubo o sugat</li>
                          <li>Kumonsulta sa lisensyadong beterinaryo kung hindi bumuti ang lagay</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>

                {/* 5. Next Recommended Check */}
                <div className="detail-next-check-box">
                  <div className="detail-next-check-left">
                    <Calendar size={18} color="var(--primary)" />
                    <div>
                      <div className="detail-next-check-lbl">Susunod na Inirerekomendang Health Check</div>
                      <div className="detail-next-check-val">{riskMeta.nextCheck}</div>
                    </div>
                  </div>
                </div>

                {/* 6. Medical Disclaimer */}
                <div className="detail-disclaimer-box">
                  <Info size={14} color="var(--text-secondary)" />
                  <span>Paunawa: AI-assisted assessment lamang. Hindi nito pinapalitan ang lisensyadong beterinaryo.</span>
                </div>
              </div>
            );
          })()}
        </ModalBody>
        <ModalFooter>
          <div className="detail-modal-footer-row">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: '#EF4444', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => {
                if (selectedRecordForDetail) {
                  setConfirmDelete(selectedRecordForDetail);
                  setDetailModalOpen(false);
                }
              }}
            >
              <Trash2 size={15} />
              <span>I-delete ang Record</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setDetailModalOpen(false);
                setSelectedRecordForDetail(null);
              }}
            >
              Isara
            </button>
          </div>
        </ModalFooter>
      </Modal>

      {/* ── CONFIRM DELETE DIALOG ── */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete Health Record"
        message="Are you sure you want to permanently delete this health assessment record?"
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteRecord}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* ── EMBEDDED STYLES FOR RESPONSIVENESS & LIQUID GLASS UI ── */}
      <style>{`
        .health-page-container {
          max-width: 1200px;
          margin: 0 auto;
          padding-bottom: 40px;
          overflow-x: hidden;
        }

        /* 1. Header */
        .health-page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 24px;
        }
        .health-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .health-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(255, 122, 24, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .health-page-title {
          font-size: 24px;
          font-weight: 900;
          margin: 0;
          color: var(--text);
          letter-spacing: -0.02em;
        }
        .health-page-subtitle {
          color: var(--text-secondary);
          font-size: 13px;
          margin: 2px 0 0;
        }
        .health-primary-btn {
          padding: 12px 22px;
          font-size: 14px;
          font-weight: 700;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
        }

        /* 2. Hero Banner */
        .prediction-hero-banner {
          background: linear-gradient(135deg, rgba(255, 122, 24, 0.15) 0%, rgba(255, 59, 48, 0.08) 100%);
          border: 1px solid rgba(255, 122, 24, 0.35);
          border-radius: 20px;
          padding: 24px 28px;
          margin-bottom: 24px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(255, 122, 24, 0.08);
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 122, 24, 0.18);
          border: 1px solid rgba(255, 122, 24, 0.35);
          border-radius: 20px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 800;
          color: var(--accent-orange);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
        }
        .hero-banner-title {
          font-size: 20px;
          font-weight: 900;
          margin: 0 0 6px;
          color: var(--text);
        }
        .hero-banner-desc {
          font-size: 13px;
          color: var(--text-secondary);
          max-width: 680px;
          line-height: 1.5;
          margin: 0 0 16px;
        }
        .hero-banner-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        /* 3. Summary Metric Cards */
        .health-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        .health-stat-card {
          border-radius: 16px;
          padding: 16px 20px;
          transition: transform 0.15s ease;
        }
        .total-card {
          background: var(--surface);
          border: 1px solid var(--border);
        }
        .high-risk-card {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .mod-risk-card {
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .low-risk-card {
          background: rgba(22, 163, 74, 0.08);
          border: 1px solid rgba(22, 163, 74, 0.3);
        }
        .stat-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .stat-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .high-risk-label { color: #EF4444; font-weight: 700; }
        .mod-risk-label { color: #F59E0B; font-weight: 700; }
        .low-risk-label { color: #16A34A; font-weight: 700; }
        .stat-value {
          font-size: 28px;
          font-weight: 900;
          margin-top: 6px;
          color: var(--text);
        }
        .high-risk-value { color: #EF4444; }
        .mod-risk-value { color: #F59E0B; }
        .low-risk-value { color: #16A34A; }
        .stat-subtext {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 2px;
        }
        .high-risk-subtext { color: #EF4444; }
        .mod-risk-subtext { color: #D97706; }
        .low-risk-subtext { color: #16A34A; }

        /* 4. Priority Alerts */
        .priority-alerts-section {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 20px 24px;
          margin-bottom: 24px;
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        .section-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .section-title {
          font-size: 17px;
          font-weight: 800;
          margin: 0;
          color: var(--text);
        }
        .priority-empty-state {
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(22, 163, 74, 0.08);
          border: 1px solid rgba(22, 163, 74, 0.25);
          border-radius: 14px;
          padding: 16px 20px;
        }
        .priority-animals-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 12px;
        }
        .priority-animal-card {
          border-radius: 14px;
          padding: 14px 16px;
          background: var(--surface-sunken);
          border: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .card-high {
          border-color: rgba(239, 68, 68, 0.4);
          background: rgba(239, 68, 68, 0.04);
        }
        .card-mod {
          border-color: rgba(245, 158, 11, 0.4);
          background: rgba(245, 158, 11, 0.04);
        }
        .card-top-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
        }
        .animal-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .animal-name {
          font-weight: 800;
          font-size: 15px;
          color: var(--text);
        }
        .animal-tag {
          font-size: 11px;
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 1px 6px;
          border-radius: 4px;
          color: var(--text-secondary);
        }
        .species-badge {
          font-size: 11px;
          background: rgba(255, 122, 24, 0.12);
          border: 1px solid rgba(255, 122, 24, 0.3);
          color: var(--accent-orange);
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 600;
        }
        .condition-text {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 3px;
        }
        .risk-badge-group {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .risk-pill {
          font-size: 11px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 12px;
          white-space: nowrap;
        }
        .risk-pill-high {
          background: #FEE2E2;
          color: #DC2626;
        }
        .risk-pill-mod {
          background: #FEF3C7;
          color: #D97706;
        }
        .jump-badge {
          font-size: 10px;
          font-weight: 700;
          color: #DC2626;
          background: rgba(239, 68, 68, 0.15);
          padding: 1px 5px;
          border-radius: 4px;
        }
        .vitals-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
          font-size: 11px;
          color: var(--text-secondary);
          background: var(--surface);
          border: 1px solid var(--border-light);
          padding: 8px 10px;
          border-radius: 8px;
        }
        .vital-item {
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .card-action-row {
          display: flex;
          justify-content: flex-end;
        }

        /* 5. Health Trends */
        .health-trends-section {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 20px 24px;
          margin-bottom: 24px;
        }
        .trend-range-tabs {
          display: flex;
          gap: 6px;
          background: var(--surface-sunken);
          padding: 3px;
          border-radius: 10px;
          border: 1px solid var(--border);
        }
        .trend-tab {
          background: none;
          border: none;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          border-radius: 7px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .trend-tab-active {
          background: var(--primary);
          color: #fff;
          font-weight: 700;
        }
        .trends-empty-state {
          text-align: center;
          padding: 36px 16px;
          color: var(--text-secondary);
        }
        .trends-metrics-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .trend-stat-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .trend-stat-box {
          background: var(--surface-sunken);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .trend-box-label {
          font-size: 11px;
          color: var(--text-secondary);
          font-weight: 600;
        }
        .trend-box-val {
          font-size: 20px;
          font-weight: 900;
          color: var(--text);
        }
        .trend-bar-wrapper {
          background: var(--surface-sunken);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .trend-bar-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .trend-bar-track {
          display: flex;
          height: 12px;
          border-radius: 6px;
          overflow: hidden;
          background: rgba(0,0,0,0.1);
        }
        .trend-bar-segment {
          height: 100%;
          transition: width 0.3s ease;
        }
        .segment-high { background: #EF4444; }
        .segment-mod { background: #F59E0B; }
        .segment-low { background: #16A34A; }
        .trend-bar-legend {
          display: flex;
          gap: 16px;
          margin-top: 10px;
          font-size: 11px;
          color: var(--text-secondary);
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .dot-high { background: #EF4444; }
        .dot-mod { background: #F59E0B; }
        .dot-low { background: #16A34A; }

        /* 6. Quick Actions */
        .quick-actions-section {
          margin-bottom: 24px;
        }
        .quick-actions-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .action-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 18px 16px;
          cursor: pointer;
          position: relative;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
        }
        .action-card:hover {
          transform: translateY(-2px);
          border-color: var(--primary);
          box-shadow: 0 8px 24px rgba(255, 122, 24, 0.15);
        }
        .action-card-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
        }
        .icon-purple { background: rgba(139, 92, 246, 0.12); }
        .icon-orange { background: rgba(255, 122, 24, 0.12); }
        .icon-blue { background: rgba(59, 130, 246, 0.12); }
        .icon-green { background: rgba(16, 185, 129, 0.12); }
        .action-card-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 4px;
        }
        .action-card-desc {
          font-size: 11px;
          color: var(--text-secondary);
          line-height: 1.4;
        }
        .action-card-arrow {
          position: absolute;
          top: 16px;
          right: 16px;
          color: var(--text-secondary);
          opacity: 0.6;
        }

        /* 7. History & Assessment Logs */
        .health-history-section {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 22px 24px;
          margin-bottom: 24px;
          box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.04);
        }
        .history-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 18px;
        }
        .history-title-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .history-count-badge {
          font-size: 11.5px;
          font-weight: 800;
          padding: 4px 12px;
          border-radius: 20px;
          background: var(--surface-sunken);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          letter-spacing: 0.5px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .history-filter-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
          width: 100%;
          flex-wrap: wrap;
        }
        .search-input-wrapper {
          position: relative;
          flex: 1;
          min-width: 240px;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
        }
        .search-input {
          padding-left: 36px;
          padding-right: 12px;
          width: 100%;
          height: 40px;
          border-radius: 10px;
          font-size: 13.5px;
          box-sizing: border-box;
          background: var(--surface-sunken);
          border: 1px solid var(--border);
          color: var(--text);
        }
        .filter-selects-row {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
        }
        .select-input {
          height: 40px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          padding: 0 12px;
          min-width: 160px;
          box-sizing: border-box;
          background: var(--surface-sunken);
          border: 1px solid var(--border);
          color: var(--text);
        }
        .records-empty-state {
          text-align: center;
          padding: 48px 20px;
        }
        .records-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* Health Log Card - Desktop Grid Layout */
        .health-log-card {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 16px;
          padding: 13px 18px;
          background: var(--surface-sunken);
          border: 1px solid var(--border);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          min-height: 64px;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
        }
        .health-log-card:hover {
          background: var(--surface);
          border-color: var(--primary);
          transform: translateY(-1px);
          box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.08);
        }
        .health-log-card:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        /* Border Accents by Risk */
        .record-card-critical { border-left: 4px solid #EF4444; }
        .record-card-high { border-left: 4px solid #F97316; }
        .record-card-mod { border-left: 4px solid #F59E0B; }
        .record-card-low { border-left: 4px solid #16A34A; }

        .health-log-icon-box {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
          flex-shrink: 0;
        }
        .health-log-main {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0; /* Prevents overflow in CSS grid */
        }
        .health-log-header-line {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          min-width: 0;
        }
        .health-log-animal-name {
          font-weight: 800;
          font-size: 14.5px;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }
        .health-log-tag-badge {
          font-size: 11.5px;
          font-weight: 600;
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 1px 7px;
          border-radius: 6px;
          color: var(--text-secondary);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .health-log-date-badge {
          font-size: 12px;
          color: var(--text-secondary);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .health-log-symptoms {
          font-size: 12.5px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.4;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        /* Right Risk Badge */
        .health-log-badge-box {
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }
        .health-risk-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 11px;
          border-radius: 20px;
          white-space: nowrap;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .risk-badge-critical {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #DC2626;
        }
        .risk-badge-high {
          background: rgba(249, 115, 22, 0.12);
          border: 1px solid rgba(249, 115, 22, 0.3);
          color: #EA580C;
        }
        .risk-badge-mod {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #D97706;
        }
        .risk-badge-low {
          background: rgba(22, 163, 74, 0.12);
          border: 1px solid rgba(22, 163, 74, 0.3);
          color: #16A34A;
        }
        .detail-lg-badge {
          font-size: 13.5px;
          padding: 6px 14px;
        }

        .health-log-arrow-box {
          display: flex;
          align-items: center;
          color: var(--text-secondary);
          opacity: 0.6;
          flex-shrink: 0;
        }
        .health-log-card:hover .health-log-arrow-box {
          color: var(--primary);
          opacity: 1;
          transform: translateX(2px);
        }
        .health-log-mobile-container {
          display: none;
        }

        /* Detail Modal Styles */
        .detail-modal-flow {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .detail-card {
          background: var(--surface-sunken);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .detail-card-head {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 800;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
        }
        .detail-grid-2x2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .detail-field {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .detail-field-lbl {
          font-size: 11px;
          color: var(--text-secondary);
        }
        .detail-field-val {
          font-size: 13.5px;
          color: var(--text);
          overflow-wrap: anywhere;
        }
        .detail-assessment-banner {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .detail-assessment-condition {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text);
          flex: 1;
          min-width: 180px;
        }
        .detail-vitals-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .detail-vital-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
        }
        .vital-ok {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text);
        }
        .vital-warn {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #EF4444;
        }
        .detail-factor-bullets {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .detail-factor-bullet {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 13px;
          color: var(--text);
          line-height: 1.4;
        }
        .detail-bullet-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }
        .detail-rec-intro {
          font-size: 13px;
          color: var(--text);
          line-height: 1.5;
          margin: 0 0 10px 0;
        }
        .detail-action-steps {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px 14px;
        }
        .detail-action-steps-title {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--primary);
          margin-bottom: 6px;
        }
        .detail-action-list {
          margin: 0;
          padding-left: 18px;
          font-size: 12.5px;
          color: var(--text);
          line-height: 1.5;
        }
        .detail-next-check-box {
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.25);
          border-radius: 12px;
          padding: 12px 16px;
        }
        .detail-next-check-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .detail-next-check-lbl {
          font-size: 11px;
          color: var(--text-secondary);
        }
        .detail-next-check-val {
          font-size: 14px;
          font-weight: 700;
          color: #2563EB;
        }
        .detail-disclaimer-box {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11.5px;
          color: var(--text-secondary);
          font-style: italic;
          padding: 6px 8px;
        }
        .detail-modal-footer-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        /* Modal Internals */
        .modal-inner-flow {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .modal-step-label {
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
          display: block;
          margin-bottom: 6px;
        }
        .modal-animal-select {
          width: 100%;
          font-size: 15px;
          padding: 10px 14px;
          font-weight: 600;
        }
        .modal-context-card {
          background: rgba(59, 130, 246, 0.06);
          border: 1px solid rgba(59, 130, 246, 0.25);
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .context-card-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #2563EB;
        }
        .context-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 8px;
          font-size: 12px;
          color: var(--text);
        }
        .modal-observations-card {
          background: var(--surface-sunken);
          border-radius: 14px;
          padding: 16px;
          border: 1px solid var(--border);
        }
        .obs-field-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          display: block;
          margin-bottom: 6px;
        }
        .temp-presets-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .temp-input {
          width: 120px;
          font-weight: 700;
        }
        .chip-buttons-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .symptoms-chips-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .symptom-chip {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
        }
        .symptom-chip-active {
          border-color: #FF7A18;
          background: rgba(255, 122, 24, 0.15);
          color: var(--accent-orange);
          font-weight: 700;
        }
        .modal-camera-card {
          background: var(--surface-sunken);
          border-radius: 14px;
          padding: 16px;
          border: 1px solid var(--border);
        }
        .camera-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .camera-header-title {
          font-size: 13px;
          font-weight: 800;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .camera-action-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .camera-live-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: center;
        }
        .camera-video-wrapper {
          position: relative;
          width: 100%;
          max-width: 400px;
          border-radius: 12px;
          overflow: hidden;
          background: #000;
        }
        .camera-scanning-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFF;
          font-weight: 700;
          gap: 8px;
          padding: 16px;
          text-align: center;
        }
        .camera-error-banner {
          color: #EF4444;
          font-size: 12px;
          margin-top: 8px;
          background: #FEE2E2;
          padding: 8px 12px;
          border-radius: 8px;
        }
        .scan-result-card {
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .result-success {
          background: rgba(124, 58, 237, 0.08);
          border: 1px solid rgba(124, 58, 237, 0.3);
        }
        .result-error {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .prediction-insufficient-card {
          background: #FFFBEB;
          border: 1px solid #FCD34D;
          border-radius: 14px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .prediction-result-card {
          border-radius: 14px;
          padding: 18px 20px;
        }
        .result-high-risk {
          background: rgba(239, 68, 68, 0.06);
          border: 1.5px solid #EF4444;
        }
        .result-moderate-risk {
          background: rgba(245, 158, 11, 0.06);
          border: 1.5px solid #F59E0B;
        }
        .result-low-risk {
          background: rgba(22, 163, 74, 0.06);
          border: 1.5px solid #16A34A;
        }
        .result-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 12px;
        }
        .result-header-label {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary);
        }
        .result-score-line {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
        }
        .result-score-text {
          font-size: 18px;
          font-weight: 900;
        }
        .score-high-risk { color: #EF4444; }
        .score-moderate-risk { color: #F59E0B; }
        .score-low-risk { color: #16A34A; }
        .result-confidence {
          font-size: 12px;
          color: var(--text-secondary);
        }
        .result-vet-badge {
          padding: 6px 12px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 800;
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text);
        }
        .concern-item {
          background: var(--surface);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
        }
        .indicator-badge {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 6px;
          font-weight: 600;
          border: 1px solid var(--border-light);
        }
        .ind-critical {
          background: #FEE2E2;
          color: #DC2626;
        }
        .ind-warning {
          background: #FEF3C7;
          color: #D97706;
        }
        .ind-info {
          background: var(--surface);
          color: var(--text);
        }
        .rec-list {
          margin: 0;
          padding-left: 18px;
          font-size: 12px;
          color: var(--text);
          line-height: 1.5;
        }
        .disclaimer-text {
          font-size: 11px;
          color: var(--text-secondary);
          margin-top: 12px;
          font-style: italic;
          border-top: 1px solid var(--border-light);
          padding-top: 8px;
        }
        .modal-actions-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
        }

        /* ── RESPONSIVE MEDIA QUERIES ── */
        @media (max-width: 1024px) {
          .health-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
          .quick-actions-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
          .trend-stat-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }
        }

        @media (max-width: 768px) {
          /* Compact AI Health Monitoring Hero Banner on Mobile */
          .prediction-hero-banner {
            padding: 14px 16px !important;
            border-radius: 14px !important;
            margin-bottom: 14px !important;
          }
          .hero-badge {
            padding: 3px 8px !important;
            font-size: 10px !important;
            margin-bottom: 6px !important;
          }
          .hero-banner-title {
            font-size: 16px !important;
            line-height: 1.25 !important;
            margin-bottom: 4px !important;
          }
          .hero-banner-desc {
            font-size: 11.5px !important;
            line-height: 1.4 !important;
            margin-bottom: 12px !important;
          }
          .hero-banner-actions {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .hero-banner-actions .btn {
            width: 100% !important;
            height: 42px !important;
            font-size: 13px !important;
            padding: 8px 14px !important;
            justify-content: center !important;
          }

          /* Summary Cards — STRICTLY 3 COLUMNS */
          .health-summary-grid {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
            margin-bottom: 16px !important;
          }
          .health-stat-card {
            padding: 8px 8px !important;
            border-radius: 12px !important;
            min-width: 0 !important;
            word-break: break-word !important;
            overflow-wrap: anywhere !important;
          }
          .stat-value {
            font-size: 19px !important;
            font-weight: 800 !important;
            line-height: 1.1 !important;
            margin-top: 2px !important;
          }
          .stat-label {
            font-size: 10.5px !important;
          }
          .stat-subtext {
            font-size: 9px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .quick-actions-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
            margin-bottom: 18px !important;
          }
          .action-card {
            padding: 12px 10px !important;
            border-radius: 12px !important;
            min-width: 0 !important;
          }
          .action-card-icon {
            width: 34px !important;
            height: 34px !important;
            margin-bottom: 8px !important;
          }
          .action-card-title {
            font-size: 12.5px !important;
            line-height: 1.2 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .action-card-desc {
            font-size: 10px !important;
            line-height: 1.2 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
          }
          .action-card-arrow {
            display: none !important;
          }
          .trend-stat-row {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
          .trend-stat-box {
            padding: 10px 12px !important;
          }
          .trend-box-val {
            font-size: 18px !important;
          }
          .health-page-header {
            flex-direction: column;
            align-items: stretch;
          }
          .health-primary-btn {
            width: 100%;
            justify-content: center;
          }
          .priority-animals-grid {
            grid-template-columns: 1fr;
          }
          .vitals-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .health-history-section {
            padding: 16px 14px !important;
            border-radius: 16px !important;
          }
          .history-filter-bar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .search-input-wrapper {
            width: 100% !important;
            min-width: 0 !important;
          }
          .filter-selects-row {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
          .select-input {
            width: 100% !important;
            min-width: 0 !important;
          }
          .health-log-card {
            display: block !important;
            padding: 12px 14px !important;
            min-height: auto !important;
          }
          .health-log-card > .health-log-icon-box,
          .health-log-card > .health-log-main,
          .health-log-card > .health-log-badge-box,
          .health-log-card > .health-log-arrow-box {
            display: none !important;
          }
          .health-log-mobile-container {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .health-log-mobile-header {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .health-log-mobile-title-wrap {
            display: flex !important;
            flex-direction: column !important;
            gap: 2px !important;
            min-width: 0 !important;
            flex: 1 !important;
          }
          .health-log-mobile-meta {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            flex-wrap: wrap !important;
          }
          .health-log-mobile-symptoms {
            font-size: 12px !important;
            white-space: normal !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            line-height: 1.4 !important;
            color: var(--text-secondary) !important;
          }
          .health-log-mobile-footer {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding-top: 8px !important;
            border-top: 1px solid var(--border-light) !important;
            width: 100% !important;
          }
          .detail-grid-2x2 {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }
          .detail-modal-footer-row {
            flex-direction: column-reverse !important;
            gap: 8px !important;
          }
          .detail-modal-footer-row button {
            width: 100% !important;
          }
          .modal-actions-footer {
            flex-direction: column-reverse;
          }
          .modal-actions-footer button {
            width: 100%;
          }
        }

        @media (max-width: 480px) {
          .filter-selects-row {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }
        }
      `}</style>
    </div>
  );
}
