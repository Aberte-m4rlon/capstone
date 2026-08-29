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
import { Plus, Pencil, Trash2, Baby, CheckCircle2, Tag, Sparkles } from 'lucide-react';
import { calculateKiddingDate, formatDate, daysUntil, assessBreedingReadiness } from '../lib/analytics';
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

  const females = farmData.animals.filter((a) => !a.archived && a.sex === 'Female');
  const males = farmData.animals.filter((a) => !a.archived && a.sex === 'Male');

  const filtered = useMemo(() => {
    return farmData.breedingRecords
      .filter((r) => fStatus === 'All' || r.status === fStatus)
      .sort((a, b) => new Date(b.mating_date).getTime() - new Date(a.mating_date).getTime());
  }, [farmData.breedingRecords, fStatus]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, animal_id: females[0]?.id ?? '', partner_id: males[0]?.id ?? '' });
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
    if (!form.animal_id) e.animal_id = 'Please select a female animal.';
    if (!form.mating_date) e.mating_date = 'Mating date is required.';
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
        toast('Breeding record created.', 'success');

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
    const mother = record ? farmData.animals.find((a) => a.id === record.animal_id) : females[0];
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

  const readinessAssessments = useMemo(() => {
    if (!farmData.settings) return [];
    return females
      .map((f) => {
        const lastMating = farmData.breedingRecords
          .filter((b) => b.animal_id === f.id)
          .sort((a, b) => new Date(b.mating_date).getTime() - new Date(a.mating_date).getTime())[0] ?? null;
        return { animal: f, assessment: assessBreedingReadiness(f, farmData.settings!, lastMating) };
      })
      .filter((x) => x.assessment.recommendation !== 'Not Ready' || x.animal.breeding_status !== 'Pregnant');
  }, [females, farmData.breedingRecords, farmData.settings]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', letterSpacing: '-0.02em' }}>
            Breeding Management
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary, #475569)', fontSize: '14px' }}>
            {filtered.length} breeding records · 150-day gestation auto-calculated
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => openRegisterOffspring()} leftIcon={<Baby size={16} />}>
            Register Newborn
          </Button>
          <Button variant="primary" onClick={openAdd} disabled={females.length === 0} leftIcon={<Plus size={16} />}>
            Add Breeding Record
          </Button>
        </div>
      </div>

      {/* Breeding Readiness Overview */}
      <Card variant="default">
        <CardContent>
          <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-text-primary, #0F172A)', marginBottom: 14 }}>
            Breeding Readiness
          </div>
          {readinessAssessments.length === 0 ? (
            <EmptyState
              icon={<Icons.Heart size={28} />}
              title="No females to assess"
              description="Add female animals to see breeding recommendations."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {readinessAssessments.map(({ animal, assessment }) => (
                <div
                  key={animal.id}
                  style={{
                    padding: 14,
                    borderRadius: 'var(--radius-md, 14px)',
                    background: 'var(--color-surface-elevated, #F8FAFC)',
                    border: '1px solid var(--color-border, #E2E8F0)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary, #0F172A)' }}>
                      {animal.name}
                    </span>
                    <Badge
                      variant={
                        assessment.recommendation === 'Ready'
                          ? 'success'
                          : assessment.recommendation === 'Monitor'
                          ? 'warning'
                          : 'default'
                      }
                      size="sm"
                    >
                      {assessment.recommendation}
                    </Badge>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #475569)' }}>
                    {assessment.reasons.join(' · ')}
                  </div>
                </div>
              ))}
            </div>
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
                title="No breeding records"
                description="Add a mating record to track pregnancy and kidding dates."
                actionLabel="Add Breeding Record"
                onAction={openAdd}
              />
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Female</th>
                    <th>Partner</th>
                    <th>Mating Date</th>
                    <th>Expected Kidding</th>
                    <th>Days Until</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const days = b.expected_kidding_date ? daysUntil(b.expected_kidding_date) : null;
                    return (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                          {animalName(b.animal_id)}
                        </td>
                        <td style={{ color: 'var(--color-text-secondary, #475569)' }}>
                          {b.partner_id ? animalName(b.partner_id) : '—'}
                        </td>
                        <td style={{ color: 'var(--color-text-secondary, #475569)' }}>{formatDate(b.mating_date)}</td>
                        <td style={{ color: 'var(--color-text-secondary, #475569)' }}>
                          {formatDate(b.expected_kidding_date)}
                        </td>
                        <td style={{ color: 'var(--color-primary, #FF6A2A)', fontWeight: 600 }}>
                          {days !== null && days >= 0 ? `${days} days` : '—'}
                        </td>
                        <td>
                          <Badge
                            variant={
                              b.status === 'Pregnant'
                                ? 'primary'
                                : b.status === 'Kidded'
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
          title={editing ? 'Edit Breeding Record' : 'Add Breeding Record'}
          onClose={() => setModalOpen(false)}
        />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Female Animal" required error={errors.animal_id}>
              <Select
                value={form.animal_id}
                onChange={(e) => setForm({ ...form, animal_id: e.target.value })}
                options={[
                  { value: '', label: 'Select female...' },
                  ...females.map((a) => ({ value: a.id, label: `${a.name} (${a.tag_id})` })),
                ]}
              />
            </FormField>

            <FormField label="Partner (Sire)">
              <Select
                value={form.partner_id}
                onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                options={[
                  { value: '', label: 'Select male (optional)...' },
                  ...males.map((a) => ({ value: a.id, label: `${a.name} (${a.tag_id})` })),
                ]}
              />
            </FormField>

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
                  background: 'rgba(255,106,42,0.1)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md, 14px)',
                  color: 'var(--color-primary, #FF6A2A)',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Expected kidding date:{' '}
                {formatDate(
                  calculateKiddingDate(form.mating_date, farmData.settings?.gestation_days ?? 150)
                )}
                <br />
                <span style={{ fontSize: '11px', opacity: 0.85 }}>
                  Calculated using {farmData.settings?.gestation_days ?? 150} days gestation.
                </span>
              </div>
            )}

            <FormField label="Notes">
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Breeding observations..."
                style={{ minHeight: 80 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {editing ? 'Save Changes' : 'Save Record'}
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
                    { value: 'Female', label: 'Female' },
                    { value: 'Male', label: 'Male' },
                  ]}
                />
              </FormField>
              <FormField label="Breed">
                <Input
                  value={offspringForm.breed}
                  onChange={(e) => setOffspringForm({ ...offspringForm, breed: e.target.value })}
                  placeholder="e.g. Boer"
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Birth Date">
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

            <FormField label="Lineage / Notes">
              <textarea
                className="form-textarea"
                value={offspringForm.notes}
                onChange={(e) => setOffspringForm({ ...offspringForm, notes: e.target.value })}
                placeholder="Parentage or health observations..."
                style={{ minHeight: 70 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setOffspringModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveOffspring} loading={savingOffspring}>
            Register Animal
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Breeding Record"
        message="Are you sure you want to delete this breeding record? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
