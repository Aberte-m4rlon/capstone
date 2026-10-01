import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Pill,
  Calendar,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Package,
  User,
  Info,
} from 'lucide-react';
import { useFarmData } from '../../../lib/useFarmData';
import { useAuth } from '../../../lib/auth';
import { useToast } from '../../ui/Toast';
import { Button } from '../../ui/Button';
import { recordTreatment } from '../../../lib/healthService';
import type {
  Animal,
  TreatmentRoute,
  TreatmentRecordStatus,
  HealthCase,
} from '../../../types';

interface TreatmentManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedAnimalId?: string;
  onTreatmentSaved?: () => void;
}

export function TreatmentManagementModal({
  isOpen,
  onClose,
  preselectedAnimalId,
  onTreatmentSaved,
}: TreatmentManagementModalProps) {
  const { animals, inventory, healthCases, refresh } = useFarmData();
  const { user } = useAuth();
  const toast = useToast();

  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(preselectedAnimalId || '');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [medicineName, setMedicineName] = useState<string>('');
  const [activeIngredient, setActiveIngredient] = useState<string>('');
  const [dosage, setDosage] = useState<string>('');
  const [unit, setUnit] = useState<string>('ml');
  const [route, setRoute] = useState<TreatmentRoute>('Oral');
  const [frequency, setFrequency] = useState<string>('Once daily');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>('');
  const [administeringPerson, setAdministeringPerson] = useState<string>('');
  const [prescribingVet, setPrescribingVet] = useState<string>('');
  const [withdrawalDays, setWithdrawalDays] = useState<number>(0);
  const [treatmentNotes, setTreatmentNotes] = useState<string>('');
  const [status, setStatus] = useState<TreatmentRecordStatus>('Ongoing');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (preselectedAnimalId) {
      setSelectedAnimalId(preselectedAnimalId);
    } else if (animals.length > 0 && !selectedAnimalId) {
      setSelectedAnimalId(animals[0].id);
    }
  }, [preselectedAnimalId, animals, selectedAnimalId]);

  const currentAnimal: Animal | undefined = useMemo(() => {
    return animals.find((a: Animal) => a.id === selectedAnimalId);
  }, [animals, selectedAnimalId]);

  // Filter open cases for the selected animal
  const animalCases = useMemo(() => {
    return healthCases.filter((c: HealthCase) => c.animal_id === selectedAnimalId);
  }, [healthCases, selectedAnimalId]);

  // When inventory item is picked, autofill medicine name and unit
  const handleInventorySelect = (invId: string) => {
    setSelectedInventoryId(invId);
    if (!invId) return;
    const item = inventory.find((i: any) => i.id === invId);
    if (item) {
      setMedicineName(item.name);
      if (item.unit) setUnit(item.unit);
    }
  };

  // Compute withdrawal safe date
  const calculatedWithdrawalDate = useMemo(() => {
    if (!withdrawalDays || withdrawalDays <= 0) return null;
    const base = endDate ? new Date(endDate) : new Date(startDate);
    base.setDate(base.getDate() + withdrawalDays);
    return base.toLocaleDateString('fil-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [startDate, endDate, withdrawalDays]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAnimal || !user) {
      toast('Pumili ng alagang hayop muna.', 'error');
      return;
    }

    if (!medicineName.trim()) {
      toast('Ilagay ang pangalan ng gamot.', 'error');
      return;
    }

    if (!dosage.trim()) {
      toast('Ilagay ang niresetang dosis ng gamot.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordTreatment({
        userId: user.id,
        animalId: currentAnimal.id,
        caseId: selectedCaseId || null,
        inventoryId: selectedInventoryId || null,
        medicineName: medicineName.trim(),
        activeIngredient: activeIngredient.trim() || null,
        dosage: dosage.trim(),
        unit: unit.trim() || 'ml',
        route,
        frequency,
        startDate,
        endDate: endDate || null,
        administeringPerson: administeringPerson.trim() || null,
        prescribingVeterinarian: prescribingVet.trim() || null,
        withdrawalPeriodDays: withdrawalDays,
        treatmentNotes: treatmentNotes.trim() || null,
        status,
      });

      toast(`Matagumpay na naitala ang gamutan (${medicineName})!`, 'success');
      await refresh();
      if (onTreatmentSaved) onTreatmentSaved();
      onClose();
    } catch (err: any) {
      console.error('Error recording treatment:', err);
      toast(err.message || 'Hindi maitala ang gamutan.', 'error');
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
          maxWidth: '700px',
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
                width: 40,
                height: 40,
                borderRadius: '10px',
                backgroundColor: 'rgba(35, 139, 69, 0.12)',
                color: '#238B45',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Pill size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text, #111827)' }}>
                Itala ang Gamutan at Medisina
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
                Authorized Treatment & Medication Administration
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

        {/* Safety Disclaimer Banner */}
        <div
          style={{
            padding: '10px 24px',
            backgroundColor: '#fffbeb',
            borderBottom: '1px solid #fef3c7',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
            color: '#92400e',
          }}
        >
          <ShieldCheck size={16} color="#d97706" style={{ flexShrink: 0 }} />
          <span>
            <strong>Paalala sa Kaligtasan:</strong> Ang AlpasFarm ay nagtatala lamang ng mga opisyal na niresetang gamot ng lisensyadong beterinaryo. Hindi naghuhula ang AI ng dosis ng gamot.
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Animal and Health Case Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Alaga (Kambing o Tupa) *
              </label>
              <select
                value={selectedAnimalId}
                onChange={(e) => setSelectedAnimalId(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {animals.map((a: Animal) => (
                  <option key={a.id} value={a.id}>
                    {a.tag_id} — {a.name} ({a.species === 'Goat' ? 'Kambing' : 'Tupa'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Kaugnay na Health Case (Opsyonal)
              </label>
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              >
                <option value="">-- Walang nakakabit na Case --</option>
                {animalCases.map((c: HealthCase) => (
                  <option key={c.id} value={c.id}>
                    {c.case_number} ({c.suspected_condition} - {c.case_status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Select from Farm Inventory */}
          {inventory.length > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Pumili mula sa Farm Inventory (Opsyonal)
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedInventoryId}
                  onChange={(e) => handleInventorySelect(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 34px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #d1d5db)',
                    fontSize: 13,
                  }}
                >
                  <option value="">-- Manu-manong ilagay ang gamot o pumili sa stock --</option>
                  {inventory.map((inv: any) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} (May {inv.quantity} {inv.unit} sa stock)
                    </option>
                  ))}
                </select>
                <Package size={15} color="#9ca3af" style={{ position: 'absolute', left: 11, top: 11 }} />
              </div>
            </div>
          )}

          {/* Medicine Name and Active Ingredient */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Pangalan ng Gamot (Medicine Name) *
              </label>
              <input
                type="text"
                placeholder="Hal. Oxytetracycline / Amoxicillin / Penicillin"
                value={medicineName}
                onChange={(e) => setMedicineName(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Aktibong Sangkap (Active Ingredient)
              </label>
              <input
                type="text"
                placeholder="Hal. Oxytetracycline HCl 200mg/ml"
                value={activeIngredient}
                onChange={(e) => setActiveIngredient(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              />
            </div>
          </div>

          {/* Dosage, Unit, Route, and Frequency */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Dosis (Dosage) *
              </label>
              <input
                type="text"
                placeholder="Hal. 2.5"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Sukat (Unit) *
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              >
                <option value="ml">ml</option>
                <option value="mg">mg</option>
                <option value="g">g</option>
                <option value="tablets">tablets</option>
                <option value="bolus">bolus</option>
                <option value="drops">patak (drops)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Paraan (Route) *
              </label>
              <select
                value={route}
                onChange={(e) => setRoute(e.target.value as TreatmentRoute)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              >
                <option value="Oral">Oral (Ipainom)</option>
                <option value="Injectable SC">Injectable SC (Sa ilalim ng balat)</option>
                <option value="Injectable IM">Injectable IM (Sa kalamnan)</option>
                <option value="Topical">Topical (Pahid)</option>
                <option value="Pour-on">Pour-on (Ibuhos sa likod)</option>
                <option value="Eye drop">Eye drop (Patak sa mata)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Dalas (Frequency) *
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              >
                <option value="Once daily">Minsan sa isang araw</option>
                <option value="Twice daily">Dalawang beses sa isang araw</option>
                <option value="Every 12 hours">Kada 12 oras</option>
                <option value="Every 48 hours">Kada 2 araw</option>
                <option value="Single dose">Isang beses lamang (Single dose)</option>
              </select>
            </div>
          </div>

          {/* Dates & Schedule */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Petsa ng Simula *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Petsa ng Pagtatapos (End Date)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Katayuan (Status) *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TreatmentRecordStatus)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <option value="Ongoing">Kasalukuyang Ginagamot (Ongoing)</option>
                <option value="Scheduled">Nakatakda (Scheduled)</option>
                <option value="Completed">Tapos na ang Gamot (Completed)</option>
                <option value="Discontinued">Itinigil (Discontinued)</option>
              </select>
            </div>
          </div>

          {/* Withdrawal Period (Meat & Milk Safety) */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                Withdrawal Period para sa Karne at Gatas (Araw)
              </label>
              {calculatedWithdrawalDate && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', backgroundColor: '#fef3c7', padding: '2px 8px', borderRadius: 6 }}>
                  Ligtas ibenta / katayin: {calculatedWithdrawalDate}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="number"
                min="0"
                max="90"
                value={withdrawalDays}
                onChange={(e) => setWithdrawalDays(parseInt(e.target.value, 10) || 0)}
                style={{
                  width: 120,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              />
              <span style={{ fontSize: 12, color: '#78350f' }}>
                {withdrawalDays === 0
                  ? 'Walang withdrawal period (0 araw)'
                  : `Huwag katayin o kunan ng gatas sa loob ng ${withdrawalDays} araw matapos ang gamot.`}
              </span>
            </div>
          </div>

          {/* Administering Person & Prescribing Vet */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Nagpainom / Nagturok (Administering Person)
              </label>
              <input
                type="text"
                placeholder="Pangalan ng nagbigay ng gamot"
                value={administeringPerson}
                onChange={(e) => setAdministeringPerson(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Beterinaryong Nagreseta (Prescribing Vet)
              </label>
              <input
                type="text"
                placeholder="Dr. Juan Dela Cruz, DVM"
                value={prescribingVet}
                onChange={(e) => setPrescribingVet(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                }}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
              Mga Tala sa Gamutan (Treatment Notes)
            </label>
            <textarea
              rows={2}
              placeholder="Hal. Naging maayos ang pagtugon sa gamot, walang lumabas na masamang reaksyon."
              value={treatmentNotes}
              onChange={(e) => setTreatmentNotes(e.target.value)}
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
              {isSubmitting ? 'Itinatala…' : 'I-save ang Gamutan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
