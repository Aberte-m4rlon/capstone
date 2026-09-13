/**
 * MedicationTreatmentModal
 * Unified modal for administering medicine/treatment to animals
 * directly connected to the user's Farm Inventory.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Button,
  Input,
  Select,
  Textarea,
  DateInput,
  NumberInput,
} from '../../ui';
import { Pill, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { administerMedicationTreatment, isTreatmentInventoryItem } from '../../../lib/inventoryOperations';
import type { Animal, InventoryItem, TreatmentStatus } from '../../../types';

export interface MedicationTreatmentModalProps {
  open: boolean;
  onClose: () => void;
  preselectedAnimalId?: string;
  onSuccess?: () => void;
}

const TREATMENT_STATUSES: { label: string; value: TreatmentStatus }[] = [
  { label: 'Kasalukuyang Ginagamot (Under Treatment)', value: 'Kasalukuyang Ginagamot' },
  { label: 'Kailangan ng Gamot (Medication Needed)', value: 'Kailangan ng Gamot' },
  { label: 'Tapos na ang Gamot (Completed)', value: 'Tapos na ang Gamot' },
  { label: 'Bantayan (Monitor)', value: 'Bantayan' },
  { label: 'Hindi pa Nabibigyan (Pending)', value: 'Hindi pa Nabibigyan' },
];

const FREQUENCY_OPTIONS = [
  { label: 'Isang beses sa isang araw (Once daily)', value: 'Isang beses sa isang araw' },
  { label: 'Dalawang beses sa isang araw (Twice daily)', value: 'Dalawang beses sa isang araw' },
  { label: 'Kada 8 oras (Every 8 hours)', value: 'Kada 8 oras' },
  { label: 'Kada 12 oras (Every 12 hours)', value: 'Kada 12 oras' },
  { label: 'Isang beses lamang (Single dose)', value: 'Isang beses lamang' },
  { label: 'Kada linggo (Weekly)', value: 'Kada linggo' },
  { label: 'Ayon sa payo ng Beterinaryo', value: 'Ayon sa payo ng Beterinaryo' },
];

export function MedicationTreatmentModal({
  open,
  onClose,
  preselectedAnimalId,
  onSuccess,
}: MedicationTreatmentModalProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data lists
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  // Form Fields
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(preselectedAnimalId || '');
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [status, setStatus] = useState<TreatmentStatus>('Kasalukuyang Ginagamot');
  const [quantity, setQuantity] = useState<string>('1');
  const [dosage, setDosage] = useState<string>('');
  const [frequency, setFrequency] = useState<string>('Isang beses sa isang araw');
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Fetch authenticated user's inventory & animals
  useEffect(() => {
    if (!open || !user?.id) return;

    let isMounted = true;
    setFetching(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const loadData = async () => {
      try {
        // 1. Fetch user's active animals (exclude sold & archived)
        const { data: animalRows, error: animalErr } = await supabase
          .from('animals')
          .select('id, user_id, tag_id, name, species, breed, health_status, is_sold, status, archived')
          .eq('user_id', user.id)
          .order('tag_id', { ascending: true });

        if (animalErr) throw animalErr;

        // Filter out sold/archived animals for treatment administration
        const activeAnimals = ((animalRows || []).filter(
          (a) => !a.archived && !a.is_sold && a.status !== 'Sold'
        ) as unknown) as Animal[];

        // 2. Fetch user's farm inventory
        const { data: invRows, error: invErr } = await supabase
          .from('inventory')
          .select('*')
          .eq('user_id', user.id)
          .order('name', { ascending: true });

        if (invErr) throw invErr;

        // Strictly filter for medicine/treatment/health items
        const treatmentItems = (invRows || []).filter((item: InventoryItem) =>
          isTreatmentInventoryItem(item.category)
        ) as InventoryItem[];

        if (isMounted) {
          setAnimals(activeAnimals);
          setInventoryItems(treatmentItems);

          // Auto-select animal
          if (preselectedAnimalId) {
            setSelectedAnimalId(preselectedAnimalId);
          } else if (activeAnimals.length > 0 && !selectedAnimalId) {
            setSelectedAnimalId(activeAnimals[0].id);
          }

          // Auto-select first item with stock if none selected
          if (treatmentItems.length > 0 && !selectedInventoryId) {
            const firstInStock = treatmentItems.find((i) => Number(i.quantity) > 0) || treatmentItems[0];
            setSelectedInventoryId(firstInStock.id);
          }
        }
      } catch (err: any) {
        console.error('Error loading inventory/animals for treatment modal:', err);
        if (isMounted) {
          setErrorMessage(err.message || 'Nabigong kunin ang datos mula sa bukid.');
        }
      } finally {
        if (isMounted) setFetching(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [open, user?.id, preselectedAnimalId]);

  // Derived selected objects
  const selectedAnimal = useMemo(
    () => animals.find((a) => a.id === selectedAnimalId),
    [animals, selectedAnimalId]
  );

  const selectedItem = useMemo(
    () => inventoryItems.find((i) => i.id === selectedInventoryId),
    [inventoryItems, selectedInventoryId]
  );

  // Live Calculations
  const availableStock = selectedItem ? Number(selectedItem.quantity) || 0 : 0;
  const requestedQty = Number(quantity) || 0;
  const remainingStock = Math.max(0, +(availableStock - requestedQty).toFixed(2));
  const isOutOfStock = availableStock <= 0;
  const isInsufficientStock = requestedQty > availableStock;
  const isMinStockBreached = selectedItem && remainingStock <= Number(selectedItem.minimum_stock);

  // Handle dosage placeholder
  useEffect(() => {
    if (selectedItem && !dosage) {
      setDosage(`${quantity || 1} ${selectedItem.unit}`);
    }
  }, [selectedItem, quantity]);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setErrorMessage('Kailangan ng naka-login na user.');
      return;
    }

    if (!selectedAnimalId) {
      setErrorMessage('Pumili ng hayop para sa paggamot.');
      return;
    }

    if (!selectedItem) {
      setErrorMessage('Pumili ng gamot mula sa imbentaryo.');
      return;
    }

    if (isNaN(requestedQty) || requestedQty <= 0) {
      setErrorMessage('Maglagay ng wastong dami (dapat mas mataas sa 0).');
      return;
    }

    if (isInsufficientStock) {
      setErrorMessage(
        `Hindi sapat ang stock. Mayroon lamang ${availableStock} ${selectedItem.unit} sa imbentaryo.`
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await administerMedicationTreatment({
        userId: user.id,
        animalId: selectedAnimalId,
        animalTag: selectedAnimal?.tag_id,
        animalName: selectedAnimal?.name || undefined,
        inventoryItem: selectedItem,
        quantity: requestedQty,
        unit: selectedItem.unit,
        usageType: 'Medication',
        status: status,
        dosage: dosage || `${requestedQty} ${selectedItem.unit}`,
        frequency: frequency,
        startDate: startDate,
        endDate: endDate || undefined,
        reason: reason || undefined,
        notes: notes || undefined,
      });

      if (!result.success) {
        throw new Error(result.error || 'Nabigo ang pagtatala ng gamot.');
      }

      setSuccessMessage(
        `Matagumpay na naitala ang gamot! Nabawasan ang ${selectedItem.name} ng ${requestedQty} ${selectedItem.unit} (Natitirang stock: ${result.newStock} ${selectedItem.unit}).`
      );

      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Medication submit error:', err);
      setErrorMessage(err.message || 'May naganap na error sa pagtatala ng gamot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bigyan ng Gamot / Gamit mula sa Imbentaryo"
      subtitle="Direktang konektado sa Farm Inventory — awtomatikong mababawas ang stock"
      size="md"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Error Notification Banner */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: '#FEE2E2',
              border: '1px solid #FCA5A5',
              color: '#991B1B',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Banner */}
        {successMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: '#DCFCE7',
              border: '1px solid #86EFAC',
              color: '#166534',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 1. Animal Selection */}
        <Select
          label="Hayop (Animal)"
          required
          value={selectedAnimalId}
          onChange={(e) => setSelectedAnimalId(e.target.value)}
          disabled={Boolean(preselectedAnimalId) || loading}
          helperText={
            selectedAnimal
              ? `Napili: ${selectedAnimal.tag_id} ${selectedAnimal.name ? `(${selectedAnimal.name})` : ''} — Kalusugan: ${selectedAnimal.health_status || 'Healthy'}`
              : 'Piliin ang hayop na gagamutin'
          }
        >
          {animals.length === 0 ? (
            <option value="">Walang aktibong hayop na available</option>
          ) : (
            animals.map((a) => (
              <option key={a.id} value={a.id}>
                {a.tag_id} — {a.name ? `${a.name} (${a.species === 'Goat' ? 'Kambing' : a.species === 'Sheep' ? 'Tupa' : a.species || 'Hayop'})` : (a.species === 'Goat' ? 'Kambing' : a.species === 'Sheep' ? 'Tupa' : a.species || 'Hayop')}
              </option>
            ))
          )}
        </Select>

        {/* 2. Medicine Selection from Farm Inventory */}
        <Select
          label="Gamot / Item mula sa Imbentaryo"
          required
          value={selectedInventoryId}
          onChange={(e) => setSelectedInventoryId(e.target.value)}
          disabled={loading || fetching}
          helperText={
            inventoryItems.length === 0
              ? 'Walang nakatalang gamot sa imbentaryo. Magdagdag muna sa Farm Stock.'
              : 'Mula sa iyong opisyal na Farm Inventory'
          }
        >
          {inventoryItems.length === 0 ? (
            <option value="">Walang gamot na nakatala sa imbentaryo</option>
          ) : (
            inventoryItems.map((item) => {
              const qty = Number(item.quantity) || 0;
              const isOut = qty <= 0;
              return (
                <option key={item.id} value={item.id} disabled={isOut}>
                  {item.name} ({item.category}) — {isOut ? 'Walang available na stock' : `${qty} ${item.unit} available`}
                </option>
              );
            })
          )}
        </Select>

        {/* 3. Live Stock Calculation Preview */}
        {selectedItem && (
          <div
            className="stock-preview-card"
            style={{
              borderColor: isInsufficientStock ? '#EF4444' : isMinStockBreached ? '#F59E0B' : '#E2E8F0',
            }}
          >
            <div className="stat-pill">
              <span className="stat-label">Available Stock</span>
              <span className="stat-value" style={{ color: isOutOfStock ? '#EF4444' : '#166534' }}>
                {availableStock} {selectedItem.unit}
              </span>
            </div>

            <div className="stat-pill">
              <span className="stat-label">Gagamitin</span>
              <span className="stat-value" style={{ color: isInsufficientStock ? '#EF4444' : '#1E293B' }}>
                {requestedQty} {selectedItem.unit}
              </span>
            </div>

            <div className="stat-pill">
              <span className="stat-label">Matitira</span>
              <span
                className="stat-value"
                style={{
                  color: isInsufficientStock ? '#EF4444' : isMinStockBreached ? '#D97706' : '#238B45',
                }}
              >
                {remainingStock} {selectedItem.unit}
              </span>
            </div>
          </div>
        )}

        {/* Stock Warning messages */}
        {isInsufficientStock && (
          <div style={{ color: '#DC2626', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} />
            <span>Hindi sapat ang stock! Kulang ng {(requestedQty - availableStock).toFixed(2)} {selectedItem?.unit}.</span>
          </div>
        )}

        {/* 4. Dami & Unit (Compact 2-Column Grid on Mobile) */}
        <div className="modal-form-grid-2">
          <NumberInput
            label="Dami (Quantity)"
            required
            min="0.01"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={loading || isOutOfStock}
            placeholder="Hal. 10"
          />

          <Input
            label="Unit (Mula sa Imbentaryo)"
            value={selectedItem?.unit || 'Unit'}
            disabled
            readOnly
            style={{ background: 'rgba(241, 245, 249, 0.8)', cursor: 'not-allowed' }}
          />
        </div>

        {/* 5. Katayuan ng Gamot (Treatment Status) */}
        <Select
          label="Katayuan ng Gamot (Status)"
          required
          value={status}
          onChange={(e) => setStatus(e.target.value as TreatmentStatus)}
          disabled={loading}
        >
          {TREATMENT_STATUSES.map((st) => (
            <option key={st.value} value={st.value}>
              {st.label}
            </option>
          ))}
        </Select>

        {/* 6. Dosis & Dalas */}
        <div className="modal-form-grid-2">
          <Input
            label="Dosis (Dosage)"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder={selectedItem ? `Hal. ${quantity || '10'} ${selectedItem.unit}` : 'Hal. 10 ml'}
            disabled={loading}
          />

          <Select
            label="Dalas (Frequency)"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            disabled={loading}
          >
            {FREQUENCY_OPTIONS.map((freq) => (
              <option key={freq.value} value={freq.value}>
                {freq.label}
              </option>
            ))}
          </Select>
        </div>

        {/* 7. Petsa ng Simula & Susunod na Gamot */}
        <div className="modal-form-grid-2">
          <DateInput
            label="Petsa ng Simula"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={loading}
          />

          <DateInput
            label="Susunod na Gamot / Pagtatapos"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* 8. Dahilan / Sintomas */}
        <Input
          label="Dahilan / Sintomas (Reason / Symptoms)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Hal. Lagnat, sipon, regular na purga"
          disabled={loading}
        />

        {/* 9. Mga Tala (Notes) */}
        <Textarea
          label="Mga Tala (Notes / Instructions)"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Iba pang tagubilin o obserbasyon sa hayop..."
          disabled={loading}
        />

        {/* Modal Actions Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 8,
            paddingTop: 12,
            borderTop: '1px solid var(--color-border-light, #E2E8F0)',
          }}
        >
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            style={{ minHeight: 44, padding: '0 18px' }}
          >
            Kanselahin
          </Button>

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={loading || isInsufficientStock || isOutOfStock || !selectedAnimalId || !selectedInventoryId}
            leftIcon={<Pill size={16} />}
            style={{ minHeight: 44, padding: '0 20px', fontWeight: 600 }}
          >
            I-save / Ibigay ang Gamot
          </Button>
        </div>
      </form>
    </Modal>
  );
}