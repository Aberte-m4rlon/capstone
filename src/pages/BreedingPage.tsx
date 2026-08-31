import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';

import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select, FormField } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterToolbar, FilterSearch, FilterSelect } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import {
  Plus,
  Pencil,
  Trash2,
  Baby,
  CheckCircle2,
  Tag,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Calendar,
  HeartHandshake,
} from 'lucide-react';
import {
  calculateKiddingDate,
  formatDate,
  daysUntil,
  assessBreedingReadiness,
  monthsSince,
  type BreedingAssessment,
} from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import { generateNextAnimalId, fetchNextUniqueAnimalId, insertAnimalWithUniqueRetry } from '../lib/animalId';
import type { Animal, BreedingRecord, Species, Sex } from '../types';

const emptyForm = {
  animal_id: '',
  partner_id: '',
  mating_date: new Date().toISOString().split('T')[0],
  status: 'Pregnant',
  notes: '',
};


/**
 * Helper to compute professional veterinary-style readiness card metadata
 */
function getAnimalReadinessCardData(
  animal: Animal,
  assessment: BreedingAssessment | undefined,
  settings: { breeding_min_age_months?: number; breeding_min_weight_kg?: number } | null | undefined
) {
  const isFemale = animal.sex === 'Female';
  const isReady = assessment?.recommendation === 'Ready';
  const isPregnant = animal.breeding_status === 'Pregnant';
  const age = animal.date_of_birth ? monthsSince(animal.date_of_birth) : null;
  const minAge = settings?.breeding_min_age_months ?? 8;
  const minWeight = settings?.breeding_min_weight_kg ?? 25;

  if (isReady) {
    const reasons: string[] = [];
    reasons.push(`Healthy & mature (${age ? `${age} mos old` : 'age verified'})`);
    if (animal.weight_kg) {
      reasons.push(`Weight criteria met (${animal.weight_kg} kg ≥ ${minWeight} kg)`);
    } else {
      reasons.push('Meets minimum breeding weight');
    }
    if (assessment?.reasons && assessment.reasons.length > 0) {
      assessment.reasons.forEach((r) => {
        if (!reasons.includes(r) && !r.toLowerCase().includes('healthy, mature')) {
          reasons.push(r);
        }
      });
    }

    return {
      statusType: 'ready',
      statusLabel: isFemale ? 'Ready for Mating' : 'Ready for Service',
      StatusIcon: CheckCircle2,
      ReasonIcon: CheckCircle2,
      reasons: reasons.slice(0, 3),
      cardClass: 'readiness-card-ready',
      badgeClass: 'badge-ready',
      dotClass: 'dot-ready',
      iconClass: 'icon-ready',
    };
  }

  if (isPregnant) {
    return {
      statusType: 'pregnant',
      statusLabel: 'Currently Pregnant',
      StatusIcon: Clock,
      ReasonIcon: AlertCircle,
      reasons: ['In active gestation (cannot be selected for mating)'],
      cardClass: 'readiness-card-pregnant',
      badgeClass: 'badge-pregnant',
      dotClass: 'dot-pregnant',
      iconClass: 'icon-pregnant',
    };
  }

  // Determine specific warning reason
  const reasons = assessment?.reasons && assessment.reasons.length > 0
    ? assessment.reasons
    : ['Does not meet criteria for breeding selection'];

  let statusLabel = 'Not Ready';
  let StatusIcon = AlertTriangle;
  let statusType = 'warning';

  if (age !== null && age < minAge) {
    statusLabel = 'Under Breeding Age';
  } else if (animal.weight_kg !== null && Number(animal.weight_kg) < minWeight) {
    statusLabel = 'Below Required Weight';
  } else if (animal.health_status === 'At Risk' || animal.health_status === 'Critical') {
    statusLabel = 'Health Alert Flagged';
    StatusIcon = AlertCircle;
    statusType = 'danger';
  }

  return {
    statusType,
    statusLabel,
    StatusIcon,
    ReasonIcon: AlertCircle,
    reasons,
    cardClass: statusType === 'danger' ? 'readiness-card-danger' : 'readiness-card-warning',
    badgeClass: statusType === 'danger' ? 'badge-danger' : 'badge-warning',
    dotClass: statusType === 'danger' ? 'dot-danger' : 'dot-warning',
    iconClass: statusType === 'danger' ? 'icon-danger' : 'icon-warning',
  };
}

export function BreedingPage() {
  const farmData = useFarmData();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();


  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BreedingRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BreedingRecord | null>(null);
  const [fStatus, setFStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [readinessTab, setReadinessTab] = useState<'females' | 'males' | 'not_ready'>('females');

  // Newborn registration state
  const [offspringModalOpen, setOffspringModalOpen] = useState(false);
  const [offspringMother, setOffspringMother] = useState<Animal | null>(null);
  const [offspringFather, setOffspringFather] = useState<Animal | null>(null);
  const [offspringForm, setOffspringForm] = useState({
    tag_id: '',
    name: '',
    species: 'Goat' as Species,
    breed: '',
    sex: 'Female' as Sex,
    date_of_birth: new Date().toISOString().split('T')[0],
    weight_kg: '3.0',
    notes: '',
  });
  const [savingOffspring, setSavingOffspring] = useState(false);

  const females = useMemo(() => farmData.animals.filter((a) => !a.archived && a.sex === 'Female'), [farmData.animals]);
  const males = useMemo(() => farmData.animals.filter((a) => !a.archived && a.sex === 'Male'), [farmData.animals]);

  // Comprehensive Breeding Assessments for all females and males
  const femaleAssessments = useMemo(() => {
    if (!farmData.settings) return new Map<string, BreedingAssessment>();
    const map = new Map<string, BreedingAssessment>();
    females.forEach((f) => {
      const lastMating = farmData.breedingRecords
        .filter((b) => b.animal_id === f.id)
        .sort((a, b) => new Date(b.mating_date).getTime() - new Date(a.mating_date).getTime())[0] ?? null;
      map.set(f.id, assessBreedingReadiness(f, farmData.settings!, lastMating));
    });
    return map;
  }, [females, farmData.breedingRecords, farmData.settings]);

  const maleAssessments = useMemo(() => {
    if (!farmData.settings) return new Map<string, BreedingAssessment>();
    const map = new Map<string, BreedingAssessment>();
    males.forEach((m) => {
      map.set(m.id, assessBreedingReadiness(m, farmData.settings!, null));
    });
    return map;
  }, [males, farmData.settings]);

  const readyFemales = useMemo(() => {
    return females.filter((f) => femaleAssessments.get(f.id)?.recommendation === 'Ready');
  }, [females, femaleAssessments]);

  const notReadyFemales = useMemo(() => {
    return females.filter((f) => femaleAssessments.get(f.id)?.recommendation !== 'Ready');
  }, [females, femaleAssessments]);

  const readyMales = useMemo(() => {
    return males.filter((m) => maleAssessments.get(m.id)?.recommendation === 'Ready');
  }, [males, maleAssessments]);

  const notReadyMales = useMemo(() => {
    return males.filter((m) => maleAssessments.get(m.id)?.recommendation !== 'Ready');
  }, [males, maleAssessments]);

  // Selected animal live assessments in modal
  const selectedFemale = useMemo(() => {
    return females.find((a) => a.id === form.animal_id) || null;
  }, [females, form.animal_id]);

  const selectedFemaleAssessment = useMemo(() => {
    if (!selectedFemale || !farmData.settings) return null;
    return femaleAssessments.get(selectedFemale.id) || null;
  }, [selectedFemale, femaleAssessments, farmData.settings]);

  const selectedMale = useMemo(() => {
    return males.find((a) => a.id === form.partner_id) || null;
  }, [males, form.partner_id]);

  const selectedMaleAssessment = useMemo(() => {
    if (!selectedMale || !farmData.settings) return null;
    return maleAssessments.get(selectedMale.id) || null;
  }, [selectedMale, maleAssessments, farmData.settings]);

  // Inbreeding & Species Compatibility Warnings
  const inbreedingWarning = useMemo(() => {
    if (!selectedFemale || !selectedMale) return null;
    if (selectedFemale.id === selectedMale.id) return 'Dam and Sire cannot be the same animal.';
    if (selectedFemale.species !== selectedMale.species) {
      return `Species mismatch: Dam is a ${selectedFemale.species} while Sire is a ${selectedMale.species}.`;
    }
    const damNotes = (selectedFemale.notes || '').toLowerCase();
    const sireNotes = (selectedMale.notes || '').toLowerCase();
    if (
      damNotes.includes(selectedMale.tag_id.toLowerCase()) ||
      sireNotes.includes(selectedFemale.tag_id.toLowerCase()) ||
      (selectedFemale.breed && selectedMale.breed && selectedFemale.breed === selectedMale.breed && damNotes.includes('sire') && sireNotes.includes('sire'))
    ) {
      return 'Potential close lineage detected between selected Dam and Sire. Verify pedigree to prevent inbreeding.';
    }
    return null;
  }, [selectedFemale, selectedMale]);

  // Filtered and Searched breeding records
  const filtered = useMemo(() => {
    return farmData.breedingRecords
      .filter((r) => {
        const matchesStatus = fStatus === 'All' || r.status === fStatus;
        if (!matchesStatus) return false;

        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const female = farmData.animals.find((a) => a.id === r.animal_id);
        const male = farmData.animals.find((a) => a.id === r.partner_id);

        const femaleName = (female?.name || '').toLowerCase();
        const femaleTag = (female?.tag_id || '').toLowerCase();
        const femaleBreed = (female?.breed || '').toLowerCase();
        const maleName = (male?.name || '').toLowerCase();
        const maleTag = (male?.tag_id || '').toLowerCase();
        const notes = (r.notes || '').toLowerCase();

        return (
          femaleName.includes(q) ||
          femaleTag.includes(q) ||
          femaleBreed.includes(q) ||
          maleName.includes(q) ||
          maleTag.includes(q) ||
          notes.includes(q)
        );
      })
      .sort((a, b) => new Date(b.mating_date).getTime() - new Date(a.mating_date).getTime());
  }, [farmData.breedingRecords, farmData.animals, fStatus, searchQuery]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      animal_id: readyFemales[0]?.id ?? '',
      partner_id: readyMales[0]?.id ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'add') {
      openAdd();
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);


  const openEdit = (r: BreedingRecord) => {
    setEditing(r);
    setForm({
      animal_id: r.animal_id,
      partner_id: r.partner_id ?? '',
      mating_date: r.mating_date,
      status: r.status,
      notes: r.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};

    if (!form.animal_id) {
      e.animal_id = 'Please select a female animal.';
    } else if (!editing && selectedFemaleAssessment && selectedFemaleAssessment.recommendation !== 'Ready') {
      e.animal_id = `This female is not ready for mating: ${selectedFemaleAssessment.reasons.join(', ')}`;
    }

    if (form.partner_id) {
      if (form.partner_id === form.animal_id) {
        e.partner_id = 'Sire and Dam cannot be the same animal.';
      } else if (!editing && selectedMaleAssessment && selectedMaleAssessment.recommendation !== 'Ready') {
        e.partner_id = `The selected sire is not ready for mating: ${selectedMaleAssessment.reasons.join(', ')}`;
      }
    }

    if (!form.mating_date) {
      e.mating_date = 'Mating date is required.';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const kiddingDate =
      form.status === 'Pregnant'
        ? calculateKiddingDate(form.mating_date, farmData.settings?.gestation_days ?? 150)
        : null;

    const payload = {
      animal_id: form.animal_id,
      partner_id: form.partner_id || null,
      mating_date: form.mating_date,
      expected_kidding_date: kiddingDate,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('breeding_records').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast('Breeding record updated.', 'success');
      } else {
        const { error } = await supabase.from('breeding_records').insert(payload);
        if (error) throw error;
        toast('Breeding record created successfully.', 'success');

        if (kiddingDate && form.status === 'Pregnant') {
          const female = farmData.animals.find((a) => a.id === form.animal_id);
          await createNotification(
            female?.user_id ?? '',
            'Breeding',
            `Expected Kidding: ${female?.name ?? 'Animal'}`,
            `${female?.name ?? 'Animal'} is expected to give birth around ${formatDate(kiddingDate)}.`,
            'Normal',
            '/breeding',
          );
        }
      }

      await supabase
        .from('animals')
        .update({ breeding_status: form.status })
        .eq('id', form.animal_id);

      setModalOpen(false);
      farmData.refresh();
    } catch {
      toast('Unable to save breeding record. Please try again.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error } = await supabase.from('breeding_records').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Breeding record deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Unable to delete breeding record. Please try again.', 'danger');
    }
  };

  const openRegisterOffspring = (record?: BreedingRecord) => {
    const mother = record ? farmData.animals.find((a) => a.id === record.animal_id) : (readyFemales[0] || females[0]);
    const father = record && record.partner_id ? farmData.animals.find((a) => a.id === record.partner_id) : null;
    const species = (mother?.species || 'Goat') as Species;
    const candidateId = generateNextAnimalId(species, farmData.animals);

    setOffspringMother(mother || null);
    setOffspringFather(father || null);
    setOffspringForm({
      tag_id: candidateId,
      name: mother ? `${mother.name}'s Kid` : 'Newborn',
      species,
      breed: mother?.breed || '',
      sex: 'Female',
      date_of_birth: record?.expected_kidding_date || new Date().toISOString().split('T')[0],
      weight_kg: species === 'Goat' ? '3.0' : '3.5',
      notes: mother ? `Dam: ${mother.name} (${mother.tag_id})${father ? `, Sire: ${father.name} (${father.tag_id})` : ''}` : '',
    });
    setOffspringModalOpen(true);

    fetchNextUniqueAnimalId(species, user?.id).then((freshId) => {
      setOffspringForm((prev) => (prev.species === species ? { ...prev, tag_id: freshId } : prev));
    }).catch(() => {});
  };

  const handleSpeciesChangeOffspring = (newSpecies: Species) => {
    const candidateId = generateNextAnimalId(newSpecies, farmData.animals);
    setOffspringForm((prev) => ({
      ...prev,
      species: newSpecies,
      tag_id: candidateId,
    }));
    fetchNextUniqueAnimalId(newSpecies, user?.id).then((freshId) => {
      setOffspringForm((prev) => (prev.species === newSpecies ? { ...prev, tag_id: freshId } : prev));
    }).catch(() => {});
  };

  const handleSaveOffspring = async () => {
    if (!offspringForm.name.trim()) {
      toast('Please enter a name for the newborn animal.', 'warning');
      return;
    }
    setSavingOffspring(true);
    try {
      const payload = {
        name: offspringForm.name.trim(),
        species: offspringForm.species,
        breed: offspringForm.breed.trim() || null,
        sex: offspringForm.sex,
        date_of_birth: offspringForm.date_of_birth || null,
        weight_kg: offspringForm.weight_kg ? Number(offspringForm.weight_kg) : null,
        notes: offspringForm.notes.trim() || null,
        user_id: user?.id,
      };

      const result = await insertAnimalWithUniqueRetry(payload, {
        onAutoIncrement: (newId) => {
          setOffspringForm((prev) => ({ ...prev, tag_id: newId }));
        },
      });

      if (result.error) throw result.error;

      toast(`Newborn registered successfully with ID: ${result.finalTagId}`, 'success');
      setOffspringModalOpen(false);
      farmData.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to register newborn.';
      toast(msg, 'danger');
    } finally {
      setSavingOffspring(false);
    }
  };

  const renderStatusPill = (status: string) => {
    let className = 'breeding-status-pill ';
    if (status === 'Pregnant') className += 'breeding-status-pregnant';
    else if (status === 'Kidded' || status === 'Delivered') className += 'breeding-status-kidded';
    else if (status === 'Failed') className += 'breeding-status-failed';
    else if (status === 'Monitor') className += 'breeding-status-monitor';
    else className += 'breeding-status-planned';

    return <span className={className}>{status}</span>;
  };

  const renderKiddingInfo = (dateStr: string | null, status: string) => {
    if (!dateStr) return <span style={{ color: 'var(--color-text-muted, #94A3B8)' }}>—</span>;
    const days = daysUntil(dateStr);

    let daysElement = null;
    if (status === 'Pregnant') {
      if (days === 0) {
        daysElement = <span style={{ fontSize: '11.5px', color: '#2E7D32', fontWeight: 700 }}>Due today!</span>;
      } else if (days > 0) {
        const isUrgent = days <= 14;
        daysElement = (
          <span style={{ fontSize: '11.5px', color: isUrgent ? '#D97706' : '#2E7D32', fontWeight: 600 }}>
            {days} days remaining{isUrgent ? ' (Due soon)' : ''}
          </span>
        );
      } else {
        daysElement = (
          <span style={{ fontSize: '11.5px', color: '#DC2626', fontWeight: 700 }}>
            {Math.abs(days)} days overdue
          </span>
        );
      }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--color-text-primary, #0F172A)' }}>
          {formatDate(dateStr)}
        </span>
        {daysElement}
      </div>
    );
  };

  return (
    <div className="breeding-page-container">
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', letterSpacing: '-0.02em' }}>
            Breeding Management
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary, #475569)', fontSize: '14px' }}>
            {farmData.breedingRecords.length} total breeding records · {readyFemales.length} does ready · {readyMales.length} bucks ready
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => openRegisterOffspring()} leftIcon={<Baby size={16} />}>
            Register Newborn
          </Button>
          <Button
            variant="primary"
            onClick={openAdd}
            disabled={readyFemales.length === 0}
            leftIcon={<Plus size={16} />}
            title={readyFemales.length === 0 ? 'No females are currently ready for mating' : 'Add Breeding Record'}
          >
            Add Breeding Record
          </Button>
        </div>
      </div>

      {/* Breeding Readiness Center */}
      <div className="breeding-readiness-card">
        <div className="readiness-header-row">
          <div className="readiness-title-group">
            <h2 className="readiness-title">Breeding Readiness Center</h2>
            <p className="readiness-subtitle">
              Only mature, healthy animals meeting age ({farmData.settings?.breeding_min_age_months ?? 8} mos) and weight ({farmData.settings?.breeding_min_weight_kg ?? 25} kg) thresholds can be mated.
            </p>
          </div>

          {/* Sub Tabs */}
          <div className="readiness-tabs-nav">
            <button
              type="button"
              onClick={() => setReadinessTab('females')}
              className={`readiness-tab-btn ${readinessTab === 'females' ? 'active' : ''}`}
            >
              <span>Ready Females</span>
              <span className="readiness-tab-count">{readyFemales.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setReadinessTab('males')}
              className={`readiness-tab-btn ${readinessTab === 'males' ? 'active' : ''}`}
            >
              <span>Ready Sires</span>
              <span className="readiness-tab-count">{readyMales.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setReadinessTab('not_ready')}
              className={`readiness-tab-btn ${readinessTab === 'not_ready' ? 'active' : ''}`}
            >
              <span>Not Yet Ready</span>
              <span className="readiness-tab-count warning">{notReadyFemales.length + notReadyMales.length}</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Ready Females */}
        {readinessTab === 'females' && (
          readyFemales.length === 0 ? (
            <EmptyState
              icon={<Icons.Heart size={28} />}
              title="No females currently ready for mating"
              description="Female animals must reach the minimum breeding age and weight to become eligible."
            />
          ) : (
            <div className="readiness-cards-grid">
              {readyFemales.map((animal) => {
                const assessment = femaleAssessments.get(animal.id);
                const age = animal.date_of_birth ? monthsSince(animal.date_of_birth) : null;
                const cardData = getAnimalReadinessCardData(animal, assessment, farmData.settings);
                const { StatusIcon, ReasonIcon } = cardData;

                return (
                  <div key={animal.id} className={`animal-readiness-card ${cardData.cardClass}`}>
                    <div className="readiness-card-header">
                      <div className="readiness-animal-info">
                        <div className="readiness-name-row">
                          <span className={`readiness-status-dot ${cardData.dotClass}`} />
                          <h3 className="readiness-animal-name" title={animal.name}>{animal.name}</h3>
                        </div>
                        <span className="readiness-tag-badge">{animal.tag_id}</span>
                      </div>
                    </div>

                    <div className="readiness-meta-row">
                      <span>{animal.breed || animal.species}</span>
                      <span className="readiness-meta-sep">•</span>
                      <span>{age ? `${age} mos old` : 'Age verified'}</span>
                    </div>

                    <div className="readiness-weight-row">
                      <span>{animal.weight_kg ? `${animal.weight_kg} kg` : 'Weight met'}</span>
                    </div>

                    <div className="readiness-badge-row">
                      <span className={`readiness-status-badge ${cardData.badgeClass}`}>
                        <StatusIcon size={13} strokeWidth={2.5} />
                        <span>{cardData.statusLabel}</span>
                      </span>
                    </div>

                    <div className="readiness-reasons-list">
                      {cardData.reasons.map((reason, idx) => (
                        <div key={idx} className="readiness-reason-item">
                          <ReasonIcon size={12} className={`reason-icon ${cardData.iconClass}`} />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Tab 2: Ready Sires */}
        {readinessTab === 'males' && (
          readyMales.length === 0 ? (
            <EmptyState
              icon={<Icons.Heart size={28} />}
              title="No male sires currently ready for service"
              description="Male animals must meet minimum age and weight to be eligible for service."
            />
          ) : (
            <div className="readiness-cards-grid">
              {readyMales.map((animal) => {
                const assessment = maleAssessments.get(animal.id);
                const age = animal.date_of_birth ? monthsSince(animal.date_of_birth) : null;
                const cardData = getAnimalReadinessCardData(animal, assessment, farmData.settings);
                const { StatusIcon, ReasonIcon } = cardData;

                return (
                  <div key={animal.id} className={`animal-readiness-card ${cardData.cardClass}`}>
                    <div className="readiness-card-header">
                      <div className="readiness-animal-info">
                        <div className="readiness-name-row">
                          <span className={`readiness-status-dot ${cardData.dotClass}`} />
                          <h3 className="readiness-animal-name" title={animal.name}>{animal.name}</h3>
                        </div>
                        <span className="readiness-tag-badge">{animal.tag_id}</span>
                      </div>
                    </div>

                    <div className="readiness-meta-row">
                      <span>{animal.breed || animal.species} Sire</span>
                      <span className="readiness-meta-sep">•</span>
                      <span>{age ? `${age} mos old` : 'Age verified'}</span>
                    </div>

                    <div className="readiness-weight-row">
                      <span>{animal.weight_kg ? `${animal.weight_kg} kg` : 'Weight met'}</span>
                    </div>

                    <div className="readiness-badge-row">
                      <span className={`readiness-status-badge ${cardData.badgeClass}`}>
                        <StatusIcon size={13} strokeWidth={2.5} />
                        <span>{cardData.statusLabel}</span>
                      </span>
                    </div>

                    <div className="readiness-reasons-list">
                      {cardData.reasons.map((reason, idx) => (
                        <div key={idx} className="readiness-reason-item">
                          <ReasonIcon size={12} className={`reason-icon ${cardData.iconClass}`} />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Tab 3: Not Yet Ready Animals */}
        {readinessTab === 'not_ready' && (
          (notReadyFemales.length === 0 && notReadyMales.length === 0) ? (
            <EmptyState
              icon={<CheckCircle2 size={28} color="#2E7D32" />}
              title="All active animals are ready for breeding"
              description="There are no animals currently restricted by age, weight, or pregnancy."
            />
          ) : (
            <div className="readiness-cards-grid">
              {[...notReadyFemales, ...notReadyMales].map((animal) => {
                const isFemale = animal.sex === 'Female';
                const assessment = isFemale ? femaleAssessments.get(animal.id) : maleAssessments.get(animal.id);
                const age = animal.date_of_birth ? monthsSince(animal.date_of_birth) : null;
                const cardData = getAnimalReadinessCardData(animal, assessment, farmData.settings);
                const { StatusIcon, ReasonIcon } = cardData;

                return (
                  <div key={animal.id} className={`animal-readiness-card ${cardData.cardClass}`}>
                    <div className="readiness-card-header">
                      <div className="readiness-animal-info">
                        <div className="readiness-name-row">
                          <span className={`readiness-status-dot ${cardData.dotClass}`} />
                          <h3 className="readiness-animal-name" title={animal.name}>{animal.name}</h3>
                        </div>
                        <span className="readiness-tag-badge">{animal.tag_id}</span>
                      </div>
                    </div>

                    <div className="readiness-meta-row">
                      <span>{animal.sex} · {animal.breed || animal.species}</span>
                      <span className="readiness-meta-sep">•</span>
                      <span>{age ? `${age} mos old` : 'No DOB recorded'}</span>
                    </div>

                    <div className="readiness-weight-row">
                      <span>{animal.weight_kg ? `${animal.weight_kg} kg` : 'No weight recorded'}</span>
                    </div>

                    <div className="readiness-badge-row">
                      <span className={`readiness-status-badge ${cardData.badgeClass}`}>
                        <StatusIcon size={13} strokeWidth={2.5} />
                        <span>{cardData.statusLabel}</span>
                      </span>
                    </div>

                    <div className="readiness-reasons-list">
                      {cardData.reasons.map((reason, idx) => (
                        <div key={idx} className="readiness-reason-item">
                          <ReasonIcon size={12} className={`reason-icon ${cardData.iconClass}`} />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Filter Toolbar with Search & Status Filter */}
      <FilterToolbar>
        <FilterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by animal name, tag ID, breed, or sire..."
          minWidth={260}
        />
        <FilterSelect
          value={fStatus}
          onChange={setFStatus}
          options={[
            { value: 'All', label: 'All Status' },
            { value: 'Planned', label: 'Planned' },
            { value: 'Pregnant', label: 'Pregnant' },
            { value: 'Kidded', label: 'Kidded / Delivered' },
            { value: 'Failed', label: 'Failed' },
            { value: 'Monitor', label: 'Monitor' },
          ]}
          ariaLabel="Filter Status"
          minWidth={160}
        />
      </FilterToolbar>

      {/* ── Desktop & Tablet Table (Hidden on Mobile < 768px) ── */}
      <div className="breeding-desktop-table">
        <div className="breeding-table-wrapper">
          {filtered.length === 0 ? (
            <div style={{ padding: 40 }}>
              <EmptyState
                icon={<Icons.Heart size={32} />}
                title="No breeding records found"
                description={
                  searchQuery || fStatus !== 'All'
                    ? 'No records match your search query or filter criteria.'
                    : 'Start tracking breeding by adding your first record.'
                }
                actionLabel="Add Record"
                onAction={openAdd}
              />
            </div>
          ) : (
            <table className="breeding-table">
              <thead>
                <tr>
                  <th className="breeding-col-female">Female (Dam)</th>
                  <th className="breeding-col-partner">Partner (Sire)</th>
                  <th className="breeding-col-date">Mating Date</th>
                  <th className="breeding-col-kidding">Expected Kidding</th>
                  <th className="breeding-col-status">Status</th>
                  <th className="breeding-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const female = farmData.animals.find((a) => a.id === b.animal_id);
                  const male = farmData.animals.find((a) => a.id === b.partner_id);

                  return (
                    <tr key={b.id}>
                      {/* Female Dam Column */}
                      <td className="breeding-col-female">
                        <div style={{ maxWidth: 220 }}>
                          <div className="animal-cell-title" title={female?.name || 'Unknown'}>
                            {female?.name || 'Unknown Female'}
                          </div>
                          <div className="animal-cell-subtitle" title={`${female?.tag_id || ''} ${female?.breed ? `• ${female.breed}` : female?.species ? `• ${female.species}` : ''}`}>
                            {female?.tag_id || 'No Tag'} {female?.breed ? `• ${female.breed}` : female?.species ? `• ${female.species}` : ''}
                          </div>
                        </div>
                      </td>

                      {/* Partner Sire Column */}
                      <td className="breeding-col-partner">
                        {male ? (
                          <div style={{ maxWidth: 200 }}>
                            <div className="animal-cell-title" title={male.name}>
                              {male.name}
                            </div>
                            <div className="animal-cell-subtitle" title={`${male.tag_id} ${male.breed ? `• ${male.breed}` : ''}`}>
                              {male.tag_id} {male.breed ? `• ${male.breed}` : ''}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted, #94A3B8)', fontSize: '13px' }}>Unassigned</span>
                        )}
                      </td>

                      {/* Mating Date Column */}
                      <td className="breeding-col-date">
                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary, #0F172A)', fontSize: '13.5px' }}>
                          {formatDate(b.mating_date)}
                        </div>
                      </td>

                      {/* Expected Kidding Column */}
                      <td className="breeding-col-kidding">
                        {renderKiddingInfo(b.expected_kidding_date, b.status)}
                      </td>

                      {/* Status Column */}
                      <td className="breeding-col-status">
                        {renderStatusPill(b.status)}
                      </td>

                      {/* Actions Column */}
                      <td className="breeding-col-actions">
                        <div className="breeding-actions-group">
                          {b.status === 'Kidded' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openRegisterOffspring(b)}
                              leftIcon={<Baby size={14} color="#FF6A00" />}
                              title="Register newborn kid/lamb"
                            >
                              Offspring
                            </Button>
                          )}
                          <button
                            type="button"
                            className="breeding-action-btn"
                            onClick={() => openEdit(b)}
                            title="Edit Breeding Record"
                            aria-label="Edit Breeding Record"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="breeding-action-btn delete"
                            onClick={() => setConfirmDelete(b)}
                            title="Delete Breeding Record"
                            aria-label="Delete Breeding Record"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Mobile Cards Layout (< 768px) ── */}
      <div className="breeding-mobile-cards">
        {filtered.length === 0 ? (
          <div style={{ padding: 24 }}>
            <EmptyState
              icon={<Icons.Heart size={32} />}
              title="No breeding records found"
              description={
                searchQuery || fStatus !== 'All'
                  ? 'No records match your filter criteria.'
                  : 'Start tracking breeding by adding your first record.'
              }
              actionLabel="Add Record"
              onAction={openAdd}
            />
          </div>
        ) : (
          filtered.map((b) => {
            const female = farmData.animals.find((a) => a.id === b.animal_id);
            const male = farmData.animals.find((a) => a.id === b.partner_id);

            return (
              <div key={b.id} className="breeding-card">
                {/* Header: Female Dam + Status Pill */}
                <div className="breeding-card-header">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--color-text-primary, #0F172A)' }}>
                      {female?.name || 'Unknown Female'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #64748B)', marginTop: 2 }}>
                      {female?.tag_id || 'No Tag'} {female?.breed ? `• ${female.breed}` : female?.species ? `• ${female.species}` : ''}
                    </div>
                  </div>
                  <div>
                    {renderStatusPill(b.status)}
                  </div>
                </div>

                {/* Body Details */}
                <div className="breeding-card-body">
                  {/* Partner Sire */}
                  <div className="breeding-card-field">
                    <span className="breeding-card-label">Partner (Sire)</span>
                    <span className="breeding-card-value">
                      {male ? (
                        <span>
                          {male.name} <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #64748B)', fontWeight: 500 }}>• {male.tag_id} {male.breed ? `(${male.breed})` : ''}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted, #94A3B8)', fontWeight: 400 }}>Unassigned</span>
                      )}
                    </span>
                  </div>

                  {/* 2-Column Grid: Mating Date & Expected Kidding */}
                  <div className="breeding-card-grid">
                    <div className="breeding-card-field">
                      <span className="breeding-card-label">Mating Date</span>
                      <span className="breeding-card-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={13} color="var(--color-text-secondary, #64748B)" />
                        {formatDate(b.mating_date)}
                      </span>
                    </div>

                    <div className="breeding-card-field">
                      <span className="breeding-card-label">Expected Kidding</span>
                      {renderKiddingInfo(b.expected_kidding_date, b.status)}
                    </div>
                  </div>

                  {/* Observations / Notes if present */}
                  {b.notes && (
                    <div className="breeding-card-notes">
                      {b.notes}
                    </div>
                  )}
                </div>

                {/* Footer Action Buttons */}
                <div className="breeding-card-footer">
                  {b.status === 'Kidded' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openRegisterOffspring(b)}
                      leftIcon={<Baby size={14} color="#FF6A00" />}
                      style={{ minHeight: 40 }}
                    >
                      Offspring
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(b)}
                    leftIcon={<Pencil size={15} />}
                    style={{ minHeight: 40, border: '1px solid var(--color-border, #E2E8F0)' }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(b)}
                    leftIcon={<Trash2 size={15} color="#DC2626" />}
                    style={{ minHeight: 40, border: '1px solid rgba(239, 68, 68, 0.2)', color: '#DC2626' }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Breeding Record Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md">
        <ModalHeader
          title={editing ? 'Edit Breeding Record' : 'Record Mating & Breeding'}
          onClose={() => setModalOpen(false)}
        />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Female Selection (Only Ready Females Enabled) */}
            <FormField
              label="Female Animal (Dam)"
              required
              error={errors.animal_id}
              helperText={readyFemales.length === 0 ? 'No female animals currently meet the age and weight requirements for mating.' : undefined}
            >
              <Select
                value={form.animal_id}
                onChange={(e) => setForm({ ...form, animal_id: e.target.value })}
                options={[
                  { value: '', label: 'Select eligible female (Dam)...' },
                  // Ready Females
                  ...readyFemales.map((a) => {
                    const age = a.date_of_birth ? monthsSince(a.date_of_birth) : null;
                    return {
                      value: a.id,
                      label: `✓ ${a.name} (${a.tag_id}) — Ready ${age ? `(${age} mos, ${a.weight_kg ?? '?'} kg)` : ''}`,
                    };
                  }),
                  // Not Ready Females (Disabled)
                  ...notReadyFemales.map((a) => {
                    const assessment = femaleAssessments.get(a.id);
                    const reason = assessment?.reasons[0] || 'Not Ready';
                    return {
                      value: a.id,
                      label: `⛔ ${a.name} (${a.tag_id}) — [Not Ready: ${reason}]`,
                      disabled: true,
                    };
                  }),
                ]}
              />
            </FormField>

            {/* Selected Female Readiness Preview */}
            {selectedFemale && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md, 12px)',
                  background: selectedFemaleAssessment?.recommendation === 'Ready' ? 'rgba(46, 125, 50, 0.06)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1.5px solid ${selectedFemaleAssessment?.recommendation === 'Ready' ? 'rgba(46, 125, 50, 0.25)' : 'rgba(239, 68, 68, 0.3)'}`,
                  marginTop: -6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {selectedFemaleAssessment?.recommendation === 'Ready' ? (
                      <ShieldCheck size={16} color="#2E7D32" />
                    ) : (
                      <ShieldAlert size={16} color="#DC2626" />
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: selectedFemaleAssessment?.recommendation === 'Ready' ? '#2E7D32' : '#DC2626' }}>
                      Dam Status: {selectedFemaleAssessment?.recommendation === 'Ready' ? 'Eligible for Mating' : 'Not Eligible for Mating'}
                    </span>
                  </div>
                  <Badge variant={selectedFemaleAssessment?.recommendation === 'Ready' ? 'success' : 'danger'} size="sm">
                    {selectedFemaleAssessment?.recommendation ?? 'Not Ready'}
                  </Badge>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)' }}>
                  {selectedFemaleAssessment?.reasons.join(' · ')}
                </div>
              </div>
            )}

            {/* Partner Selection (Only Ready Males Enabled) */}
            <FormField label="Partner (Sire - Optional)" error={errors.partner_id}>
              <Select
                value={form.partner_id}
                onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                options={[
                  { value: '', label: 'Select eligible male (Sire - Optional)...' },
                  // Ready Males
                  ...readyMales.map((a) => {
                    const age = a.date_of_birth ? monthsSince(a.date_of_birth) : null;
                    return {
                      value: a.id,
                      label: `✓ ${a.name} (${a.tag_id}) — Ready Sire ${age ? `(${age} mos, ${a.weight_kg ?? '?'} kg)` : ''}`,
                    };
                  }),
                  // Not Ready Males (Disabled)
                  ...notReadyMales.map((a) => {
                    const assessment = maleAssessments.get(a.id);
                    const reason = assessment?.reasons[0] || 'Not Ready';
                    return {
                      value: a.id,
                      label: `⛔ ${a.name} (${a.tag_id}) — [Not Ready: ${reason}]`,
                      disabled: true,
                    };
                  }),
                ]}
              />
            </FormField>

            {/* Selected Male Readiness Preview */}
            {selectedMale && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md, 12px)',
                  background: selectedMaleAssessment?.recommendation === 'Ready' ? 'rgba(46, 125, 50, 0.06)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1.5px solid ${selectedMaleAssessment?.recommendation === 'Ready' ? 'rgba(46, 125, 50, 0.25)' : 'rgba(239, 68, 68, 0.3)'}`,
                  marginTop: -6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {selectedMaleAssessment?.recommendation === 'Ready' ? (
                      <ShieldCheck size={16} color="#2E7D32" />
                    ) : (
                      <ShieldAlert size={16} color="#DC2626" />
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: selectedMaleAssessment?.recommendation === 'Ready' ? '#2E7D32' : '#DC2626' }}>
                      Sire Status: {selectedMaleAssessment?.recommendation === 'Ready' ? 'Eligible Breeding Sire' : 'Not Eligible for Service'}
                    </span>
                  </div>
                  <Badge variant={selectedMaleAssessment?.recommendation === 'Ready' ? 'success' : 'danger'} size="sm">
                    {selectedMaleAssessment?.recommendation ?? 'Not Ready'}
                  </Badge>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)' }}>
                  {selectedMaleAssessment?.reasons.join(' · ')}
                </div>
              </div>
            )}

            {/* Inbreeding / Lineage Safety Warning */}
            {inbreedingWarning && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md, 12px)',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1.5px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '12.5px', color: '#92400E', lineHeight: 1.4, fontWeight: 600 }}>
                  {inbreedingWarning}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Mating Date" required error={errors.mating_date}>
                <Input
                  type="date"
                  value={form.mating_date}
                  onChange={(e) => setForm({ ...form, mating_date: e.target.value })}
                />
              </FormField>

              <FormField label="Status">
                <Select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  options={[
                    { value: 'Planned', label: 'Planned' },
                    { value: 'Pregnant', label: 'Pregnant' },
                    { value: 'Kidded', label: 'Kidded / Delivered' },
                    { value: 'Failed', label: 'Failed' },
                    { value: 'Monitor', label: 'Monitor' },
                  ]}
                />
              </FormField>
            </div>

            {form.mating_date && form.status === 'Pregnant' && (
              <div
                style={{
                  background: 'rgba(46, 125, 50, 0.08)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md, 12px)',
                  color: '#2E7D32',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid rgba(46, 125, 50, 0.2)',
                }}
              >
                Expected kidding date:{' '}
                <span style={{ fontWeight: 800 }}>
                  {formatDate(
                    calculateKiddingDate(form.mating_date, farmData.settings?.gestation_days ?? 150)
                  )}
                </span>
                <br />
                <span style={{ fontSize: '11px', opacity: 0.85 }}>
                  Calculated using standard {farmData.settings?.gestation_days ?? 150}-day gestation period.
                </span>
              </div>
            )}

            <FormField label="Notes / Observations">
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Breeding observations, pen number, mating behavior..."
                style={{ minHeight: 80 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            disabled={!editing && selectedFemaleAssessment?.recommendation !== 'Ready'}
          >
            {editing ? 'Save Changes' : 'Confirm & Save Mating Record'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Newborn Offspring Registration Modal */}
      <Modal open={offspringModalOpen} onClose={() => setOffspringModalOpen(false)} size="md">
        <ModalHeader
          title={offspringMother ? `Register Newborn from ${offspringMother.name}` : 'Register Newborn Offspring'}
          onClose={() => setOffspringModalOpen(false)}
        />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                  Newborn Animal ID
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 14px',
                    borderRadius: 'var(--radius-md, 12px)',
                    background: 'var(--color-surface-elevated, rgba(255, 255, 255, 0.06))',
                    border: '1.5px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                    minHeight: 44,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag size={16} color="#FF6A00" />
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-primary, #FF6A00)', letterSpacing: '0.02em' }}>
                      {offspringForm.tag_id || 'Generating...'}
                    </span>
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#10B981',
                      background: 'rgba(16, 185, 129, 0.12)',
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    <CheckCircle2 size={12} color="#10B981" />
                    Auto-generated ID
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748B)', marginTop: -2 }}>
                  Offspring ID is automatically generated by the system.
                </span>
              </div>

              <FormField label="Offspring Name" required>
                <Input
                  value={offspringForm.name}
                  onChange={(e) => setOffspringForm({ ...offspringForm, name: e.target.value })}
                  placeholder="e.g. Leo, Bella Junior"
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <FormField label="Species" required>
                <Select
                  value={offspringForm.species}
                  onChange={(e) => handleSpeciesChangeOffspring(e.target.value as Species)}
                  options={[
                    { value: 'Goat', label: 'Goat' },
                    { value: 'Sheep', label: 'Sheep' },
                  ]}
                />
              </FormField>

              <FormField label="Sex" required>
                <Select
                  value={offspringForm.sex}
                  onChange={(e) => setOffspringForm({ ...offspringForm, sex: e.target.value as Sex })}
                  options={[
                    { value: 'Female', label: 'Female (Doeling/Ewe)' },
                    { value: 'Male', label: 'Male (Buckling/Ram)' },
                  ]}
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <FormField label="Date of Birth" required>
                <Input
                  type="date"
                  value={offspringForm.date_of_birth}
                  onChange={(e) => setOffspringForm({ ...offspringForm, date_of_birth: e.target.value })}
                />
              </FormField>

              <FormField label="Birth Weight (kg)">
                <Input
                  type="number"
                  step="0.1"
                  value={offspringForm.weight_kg}
                  onChange={(e) => setOffspringForm({ ...offspringForm, weight_kg: e.target.value })}
                  placeholder="3.0"
                />
              </FormField>
            </div>

            <FormField label="Pedigree / Notes">
              <Input
                value={offspringForm.notes}
                onChange={(e) => setOffspringForm({ ...offspringForm, notes: e.target.value })}
                placeholder="Dam, Sire, birth notes..."
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setOffspringModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveOffspring} loading={savingOffspring}>
            Register Offspring
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete Breeding Record"
        message="Are you sure you want to delete this breeding record? This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
