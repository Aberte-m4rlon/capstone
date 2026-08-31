import { useState, useMemo } from 'react';
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
import { FilterToolbar, FilterSelect } from '../components/FilterToolbar';
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
  Info,
  Heart,
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

export function BreedingPage() {
  const farmData = useFarmData();
  const { user } = useAuth();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BreedingRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BreedingRecord | null>(null);
  const [fStatus, setFStatus] = useState('All');
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
    // Check if known parent/offspring
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

  const filtered = useMemo(() => {
    return farmData.breedingRecords
      .filter((r) => fStatus === 'All' || r.status === fStatus)
      .sort((a, b) => new Date(b.mating_date).getTime() - new Date(a.mating_date).getTime());
  }, [farmData.breedingRecords, fStatus]);

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

  const animalName = (id: string) => {
    const a = farmData.animals.find((x) => x.id === id);
    return a ? `${a.name} (${a.tag_id})` : 'Unknown';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', letterSpacing: '-0.02em' }}>
            Breeding Management
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary, #475569)', fontSize: '14px' }}>
            {filtered.length} breeding records · {readyFemales.length} does ready · {readyMales.length} bucks ready
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
      <Card variant="default">
        <CardContent>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--color-text-primary, #0F172A)' }}>
                Breeding Readiness Center
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--color-text-secondary, #64748B)' }}>
                Only mature, healthy animals meeting age ({farmData.settings?.breeding_min_age_months ?? 8} mos) and weight ({farmData.settings?.breeding_min_weight_kg ?? 25} kg) thresholds can be mated.
              </p>
            </div>

            {/* Sub Tabs */}
            <div style={{ display: 'inline-flex', background: 'var(--color-surface-elevated, #F1F5F9)', padding: 3, borderRadius: 'var(--radius-md, 10px)', gap: 4 }}>
              <button
                type="button"
                onClick={() => setReadinessTab('females')}
                style={{
                  border: 'none',
                  background: readinessTab === 'females' ? '#FFFFFF' : 'transparent',
                  color: readinessTab === 'females' ? '#2E7D32' : '#64748B',
                  fontWeight: readinessTab === 'females' ? 700 : 500,
                  fontSize: '12.5px',
                  padding: '6px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  boxShadow: readinessTab === 'females' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>Ready Females</span>
                <Badge variant="success" size="sm">{readyFemales.length}</Badge>
              </button>

              <button
                type="button"
                onClick={() => setReadinessTab('males')}
                style={{
                  border: 'none',
                  background: readinessTab === 'males' ? '#FFFFFF' : 'transparent',
                  color: readinessTab === 'males' ? '#2E7D32' : '#64748B',
                  fontWeight: readinessTab === 'males' ? 700 : 500,
                  fontSize: '12.5px',
                  padding: '6px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  boxShadow: readinessTab === 'males' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>Ready Sires</span>
                <Badge variant="success" size="sm">{readyMales.length}</Badge>
              </button>

              <button
                type="button"
                onClick={() => setReadinessTab('not_ready')}
                style={{
                  border: 'none',
                  background: readinessTab === 'not_ready' ? '#FFFFFF' : 'transparent',
                  color: readinessTab === 'not_ready' ? '#C2410C' : '#64748B',
                  fontWeight: readinessTab === 'not_ready' ? 700 : 500,
                  fontSize: '12.5px',
                  padding: '6px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  boxShadow: readinessTab === 'not_ready' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>Not Yet Ready</span>
                <Badge variant="warning" size="sm">{notReadyFemales.length + notReadyMales.length}</Badge>
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
              <div className="breeding-readiness-grid stats-grid" style={{ marginBottom: 0 }}>
                {readyFemales.map((animal) => {
                  const assessment = femaleAssessments.get(animal.id);
                  const age = animal.date_of_birth ? monthsSince(animal.date_of_birth) : null;
                  return (
                    <div
                      key={animal.id}
                      style={{
                        padding: 14,
                        borderRadius: 'var(--radius-md, 14px)',
                        background: 'rgba(46, 125, 50, 0.04)',
                        border: '1px solid rgba(46, 125, 50, 0.2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={16} color="#2E7D32" />
                          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary, #0F172A)' }}>
                            {animal.name} ({animal.tag_id})
                          </span>
                        </div>
                        <Badge variant="success" size="sm">Ready for Mating</Badge>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)', lineHeight: 1.4 }}>
                        {animal.breed || animal.species} · {age ? `${age} mos old` : 'Age verified'} · {animal.weight_kg ? `${animal.weight_kg} kg` : 'Weight met'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#2E7D32', fontWeight: 600, marginTop: 4 }}>
                        {assessment?.reasons.join(' · ')}
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
              <div className="breeding-readiness-grid stats-grid" style={{ marginBottom: 0 }}>
                {readyMales.map((animal) => {
                  const assessment = maleAssessments.get(animal.id);
                  const age = animal.date_of_birth ? monthsSince(animal.date_of_birth) : null;
                  return (
                    <div
                      key={animal.id}
                      style={{
                        padding: 14,
                        borderRadius: 'var(--radius-md, 14px)',
                        background: 'rgba(46, 125, 50, 0.04)',
                        border: '1px solid rgba(46, 125, 50, 0.2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={16} color="#2E7D32" />
                          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary, #0F172A)' }}>
                            {animal.name} ({animal.tag_id})
                          </span>
                        </div>
                        <Badge variant="success" size="sm">Ready for Service</Badge>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)', lineHeight: 1.4 }}>
                        {animal.breed || animal.species} Sire · {age ? `${age} mos old` : 'Age verified'} · {animal.weight_kg ? `${animal.weight_kg} kg` : 'Weight met'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#2E7D32', fontWeight: 600, marginTop: 4 }}>
                        {assessment?.reasons.join(' · ')}
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
              <div className="breeding-readiness-grid stats-grid" style={{ marginBottom: 0 }}>
                {[...notReadyFemales, ...notReadyMales].map((animal) => {
                  const isFemale = animal.sex === 'Female';
                  const assessment = isFemale ? femaleAssessments.get(animal.id) : maleAssessments.get(animal.id);
                  const isPregnant = animal.breeding_status === 'Pregnant';
                  return (
                    <div
                      key={animal.id}
                      style={{
                        padding: 14,
                        borderRadius: 'var(--radius-md, 14px)',
                        background: isPregnant ? 'rgba(59, 130, 246, 0.04)' : 'rgba(239, 68, 68, 0.04)',
                        border: `1px solid ${isPregnant ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AlertCircle size={16} color={isPregnant ? '#2563EB' : '#DC2626'} />
                          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary, #0F172A)' }}>
                            {animal.name} ({animal.tag_id})
                          </span>
                        </div>
                        <Badge variant={isPregnant ? 'info' : 'danger'} size="sm">
                          {isPregnant ? 'Pregnant' : 'Not Ready'}
                        </Badge>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)' }}>
                        {animal.sex} · {animal.breed || animal.species} · {animal.weight_kg ? `${animal.weight_kg} kg` : 'No weight'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: isPregnant ? '#2563EB' : '#DC2626', fontWeight: 600, marginTop: 4 }}>
                        {assessment?.reasons.join(' · ') || 'Restricted from mating selection'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Filter Toolbar */}
      <FilterToolbar>
        <FilterSelect
          value={fStatus}
          onChange={setFStatus}
          options={[
            { value: 'All', label: 'All Status' },
            { value: 'Planned', label: 'Planned' },
            { value: 'Pregnant', label: 'Pregnant' },
            { value: 'Kidded', label: 'Kidded' },
            { value: 'Failed', label: 'Failed' },
            { value: 'Monitor', label: 'Monitor' },
          ]}
          ariaLabel="Filter Status"
          minWidth={150}
        />
      </FilterToolbar>

      {/* Records Table */}
      <Card variant="default" padding="none">
        <CardContent>
          {filtered.length === 0 ? (
            <div style={{ padding: 32 }}>
              <EmptyState
                icon={<Icons.Heart size={32} />}
                title="No breeding records found"
                description={fStatus === 'All' ? 'Start tracking breeding by adding your first record.' : 'No records match the selected status filter.'}
                actionLabel="Add Record"
                onAction={openAdd}
              />
            </div>
          ) : (
            <div className="table-responsive">
              <table className="alpas-table">
                <thead>
                  <tr>
                    <th>Female (Dam)</th>
                    <th>Partner (Sire)</th>
                    <th>Mating Date</th>
                    <th>Expected Kidding</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const female = farmData.animals.find((a) => a.id === b.animal_id);
                    const male = farmData.animals.find((a) => a.id === b.partner_id);
                    const days = b.expected_kidding_date ? daysUntil(b.expected_kidding_date) : null;
                    return (
                      <tr key={b.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                            {female?.name ?? animalName(b.animal_id)}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #64748B)' }}>
                            {female?.tag_id ?? ''} {female?.breed ? `· ${female.breed}` : ''}
                          </div>
                        </td>
                        <td>
                          {male ? (
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--color-text-primary, #0F172A)' }}>{male.name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #64748B)' }}>{male.tag_id}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-secondary, #94A3B8)', fontSize: '12px' }}>Unassigned</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{formatDate(b.mating_date)}</div>
                        </td>
                        <td>
                          {b.expected_kidding_date ? (
                            <div>
                              <div style={{ fontWeight: 700, color: '#2E7D32' }}>{formatDate(b.expected_kidding_date)}</div>
                              {days !== null && b.status === 'Pregnant' && (
                                <div style={{ fontSize: '11px', color: days <= 14 ? '#DC2626' : '#2E7D32', fontWeight: 600 }}>
                                  {days === 0 ? 'Due today!' : days > 0 ? `${days} days remaining` : `${Math.abs(days)} days overdue`}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-secondary, #94A3B8)', fontSize: '12px' }}>—</span>
                          )}
                        </td>
                        <td>
                          <Badge
                            variant={b.status === 'Pregnant' ? 'info' : b.status === 'Kidded'
                                ? 'success'
                                : b.status === 'Failed'
                                ? 'danger'
                                : 'default'
                            }
                            size="sm"
                          >
                            {b.status}
                          </Badge>
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            {b.status === 'Kidded' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openRegisterOffspring(b)}
                                leftIcon={<Baby size={13} color="#FF6A00" />}
                                title="Register newborn kid/lamb"
                              >
                                Offspring
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                              <Pencil size={15} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(b)}>
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
                    { value: 'Kidded', label: 'Kidded' },
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
