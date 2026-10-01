import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Bug,
  Calendar,
  AlertCircle,
  Clock,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import { useFarmData } from '../../../lib/useFarmData';
import { useAuth } from '../../../lib/auth';
import { useToast } from '../../ui/Toast';
import { Button } from '../../ui/Button';
import { recordDeworming } from '../../../lib/healthService';
import type { Animal, DewormingStatus } from '../../../types';

interface DewormingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedAnimalId?: string;
  onDewormingSaved?: () => void;
}

export function DewormingModal({
  isOpen,
  onClose,
  preselectedAnimalId,
  onDewormingSaved,
}: DewormingModalProps) {
  const { animals, refresh } = useFarmData();
  const { user } = useAuth();
  const toast = useToast();

  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(preselectedAnimalId || '');
  const [productName, setProductName] = useState<string>('Albendazole');
  const [dateAdministered, setDateAdministered] = useState<string>(new Date().toISOString().split('T')[0]);
  const [nextDueDate, setNextDueDate] = useState<string>('');
  const [provider, setProvider] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [dosage, setDosage] = useState<string>('');
  const [status, setStatus] = useState<DewormingStatus>('Completed');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (preselectedAnimalId) {
      setSelectedAnimalId(preselectedAnimalId);
    } else if (animals.length > 0 && !selectedAnimalId) {
      setSelectedAnimalId(animals[0].id);
    }
  }, [preselectedAnimalId, animals, selectedAnimalId]);

  // Suggest default next due date (+90 days for deworming)
  useEffect(() => {
    if (dateAdministered && !nextDueDate) {
      const d = new Date(dateAdministered);
      d.setDate(d.getDate() + 90);
      setNextDueDate(d.toISOString().split('T')[0]);
    }
  }, [dateAdministered, nextDueDate]);

  const currentAnimal: Animal | undefined = useMemo(() => {
    return animals.find((a: Animal) => a.id === selectedAnimalId);
  }, [animals, selectedAnimalId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAnimal || !user) {
      toast('Pumili ng alagang hayop muna.', 'error');
      return;
    }

    if (!productName.trim()) {
      toast('Ilagay ang pangalan ng gamot pampurga.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordDeworming({
        userId: user.id,
        animalId: currentAnimal.id,
        productName: productName.trim(),
        dateAdministered,
        nextDueDate: nextDueDate || null,
        provider: provider.trim() || null,
        batchNumber: batchNumber.trim() || null,
        dosage: dosage.trim() || null,
        status,
        notes: notes.trim() || null,
      });

      toast(`Matagumpay na naitala ang pagpupurga (${productName})!`, 'success');
      await refresh();
      if (onDewormingSaved) onDewormingSaved();
      onClose();
    } catch (err: any) {
      console.error('Error recording deworming:', err);
      toast(err.message || 'Hindi maitala ang pagpupurga.', 'error');
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
          maxWidth: '640px',
          maxHeight: '90vh',
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
              <Bug size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text, #111827)' }}>
                Itala ang Pagpupurga (Deworming)
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
                Parasite Control & Deworming Protocol
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
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Animal Selector */}
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

          {/* Product & Dosage */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Produkto / Gamot Pampurga *
              </label>
              <input
                type="text"
                placeholder="Hal. Albendazole / Ivermectin / Levamisole"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
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
                Dosis (Dosage & Route)
              </label>
              <input
                type="text"
                placeholder="Hal. 5ml Oral Drench o 1ml SC"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
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

          {/* Dates & Status */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Petsa ng Pagkakaturok / Pagpainom *
              </label>
              <input
                type="date"
                value={dateAdministered}
                onChange={(e) => setDateAdministered(e.target.value)}
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
                Susunod na Petsa (Next Due Date)
              </label>
              <input
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
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
                onChange={(e) => setStatus(e.target.value as DewormingStatus)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #d1d5db)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <option value="Completed">Tapos na (Completed)</option>
                <option value="Scheduled">Nakatakda (Scheduled)</option>
                <option value="Overdue">Lagpas na (Overdue)</option>
              </select>
            </div>
          </div>

          {/* Provider & Batch Number */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #4b5563)', display: 'block', marginBottom: 4 }}>
                Nagbigay / Provider
              </label>
              <input
                type="text"
                placeholder="Pangalan ng technician o farm manager"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
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
                Batch / Lot Number
              </label>
              <input
                type="text"
                placeholder="Hal. LOT-2026-X8"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
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
              Mga Tala (Notes)
            </label>
            <textarea
              rows={2}
              placeholder="Mga karagdagang obserbasyon, hal. FAMACHA score bago purgahin."
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
              {isSubmitting ? 'Itinatala…' : 'I-save ang Deworming Record'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
