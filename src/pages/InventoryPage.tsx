import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { FormField, Input, Select } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { FilterToolbar, FilterSearch, FilterSelect } from '../components/FilterToolbar';
import { GoatIcon } from '../components/layout/GoatIcon';
import {
  Plus,
  Pencil,
  Trash2,
  History,
  TrendingDown,
  TrendingUp,
  PackageX,
  Package,
  PawPrint,
  Wheat,
  Pill,
  Wrench,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Baby,
  Scale,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Layers,
  HeartPulse,
  Heart,
  DollarSign,
} from 'lucide-react';
import { inventoryStatus, formatDate, ageLabel } from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import { AnimalHealthBadge } from '../components/domain/animals/AnimalHealthBadge';
import type { InventoryItem, InventoryCategory, InventoryTransaction, Animal, HealthRecord } from '../types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function txSign(type: InventoryTransaction['type']): '+' | '-' {
  return type === 'STOCK_IN' || type === 'ADJUSTMENT_IN' || type === 'RETURN' ? '+' : '-';
}

function txColor(type: InventoryTransaction['type']): string {
  return txSign(type) === '+' ? '#16A34A' : '#EF4444';
}

function txLabel(type: InventoryTransaction['type']): string {
  const map: Record<InventoryTransaction['type'], string> = {
    STOCK_IN: 'Stock In',
    CONSUMPTION: 'Consumed',
    REMOVAL: 'Removed',
    ADJUSTMENT_IN: 'Adjustment +',
    ADJUSTMENT_OUT: 'Adjustment −',
    RETURN: 'Returned',
  };
  return map[type];
}

/** Calculate totals for one item from its transactions */
function itemTotals(itemId: string, txs: InventoryTransaction[]) {
  const mine = txs.filter((t) => t.inventory_item_id === itemId);
  let totalAdded = 0, totalConsumed = 0, totalRemoved = 0, totalAdjNet = 0;
  for (const t of mine) {
    if (t.type === 'STOCK_IN' || t.type === 'RETURN') totalAdded += t.quantity;
    else if (t.type === 'CONSUMPTION') totalConsumed += t.quantity;
    else if (t.type === 'REMOVAL') totalRemoved += t.quantity;
    else if (t.type === 'ADJUSTMENT_IN') totalAdjNet += t.quantity;
    else if (t.type === 'ADJUSTMENT_OUT') totalAdjNet -= t.quantity;
  }
  return { totalAdded, totalConsumed, totalRemoved, totalAdjNet };
}

function getAgeMonths(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  return months >= 0 ? months : 0;
}

function getAnimalHealthClassification(
  animal: Animal,
  healthRecords: HealthRecord[],
): 'Healthy' | 'Monitor' | 'Needs Attention' {
  const animalRecords = healthRecords.filter((h) => h.animal_id === animal.id);
  const latestRecord = animalRecords.length > 0
    ? [...animalRecords].sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())[0]
    : null;

  const score = Math.max(animal.health_risk_score ?? 0, latestRecord?.risk_score ?? 0);
  const status = animal.health_status;
  const recRisk = latestRecord?.risk_level;

  const isHigh =
    status === 'Critical' ||
    (status === 'At Risk' && score >= 50) ||
    recRisk === 'High' ||
    recRisk === 'Critical' ||
    score >= 50;

  if (isHigh) return 'Needs Attention';

  const isMonitor =
    status === 'Monitor' ||
    status === 'At Risk' ||
    recRisk === 'Moderate' ||
    score >= 25;

  if (isMonitor) return 'Monitor';

  return 'Healthy';
}

const emptyForm = {
  name: '',
  category: 'Feed' as InventoryCategory,
  quantity: '',
  unit: 'kg',
  minimum_stock: '',
  purchase_date: '',
  expiry_date: '',
  supplier: '',
  cost: '',
  notes: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function InventoryPage() {
  const farmData = useFarmData();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const warningDays = farmData.settings?.expiry_warning_days ?? 15;
  const allTx = farmData.inventoryTransactions;

  // Active view tab: 'all' | 'livestock' | 'feeds' | 'health' | 'equipment'
  const [activeTab, setActiveTab] = useState<'all' | 'livestock' | 'feeds' | 'health' | 'equipment'>('all');
  const [showAnimalsRoster, setShowAnimalsRoster] = useState(false);

  // ── Add/Edit modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InventoryItem | null>(null);

  // ── Filters ──
  const [fCategory, setFCategory] = useState('All');
  const [fStatus, setFStatus] = useState('All');
  const [search, setSearch] = useState('');

  // ── Consume modal ──
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeItem, setConsumeItem] = useState<InventoryItem | null>(null);
  const [consumeQty, setConsumeQty] = useState('');
  const [consumeReason, setConsumeReason] = useState('');
  const [consumeDate, setConsumeDate] = useState(new Date().toISOString().split('T')[0]);
  const [consumeAnimalId, setConsumeAnimalId] = useState('');
  const [consumeSaving, setConsumeSaving] = useState(false);

  // ── Stock-in modal ──
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockInItem, setStockInItem] = useState<InventoryItem | null>(null);
  const [stockInQty, setStockInQty] = useState('');
  const [stockInCost, setStockInCost] = useState('');
  const [stockInSupplier, setStockInSupplier] = useState('');
  const [stockInDate, setStockInDate] = useState(new Date().toISOString().split('T')[0]);
  const [stockInNotes, setStockInNotes] = useState('');
  const [stockInSaving, setStockInSaving] = useState(false);

  // ── Remove modal ──
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeItem, setRemoveItem] = useState<InventoryItem | null>(null);
  const [removeQty, setRemoveQty] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [removeNotes, setRemoveNotes] = useState('');
  const [removeSaving, setRemoveSaving] = useState(false);

  // ── History modal ──
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  // ── Dynamic Livestock Metrics (Computed from animals & clinical tables) ─────
  const activeAnimals = useMemo(() => {
    return farmData.animals.filter((a) => !a.archived);
  }, [farmData.animals]);

  const livestockMetrics = useMemo(() => {
    const total = activeAnimals.length;
    const goats = activeAnimals.filter((a) => (a.species || '').toLowerCase() === 'goat').length;
    const sheep = activeAnimals.filter((a) => (a.species || '').toLowerCase() === 'sheep').length;

    const male = activeAnimals.filter((a) => a.sex === 'Male').length;
    const female = activeAnimals.filter((a) => a.sex === 'Female').length;

    let young = 0;
    let adult = 0;
    for (const a of activeAnimals) {
      const m = getAgeMonths(a.date_of_birth);
      if (m !== null) {
        if (m < 12) young++;
        else adult++;
      } else {
        if (a.weight_kg !== null && a.weight_kg < 20) young++;
        else adult++;
      }
    }

    // Pregnant animals
    const pregnant = activeAnimals.filter((a) => {
      if (a.breeding_status === 'Pregnant') return true;
      return farmData.breedingRecords.some((r) => r.animal_id === a.id && r.status === 'Pregnant');
    }).length;

    // Breeding ready females (age >= 8 months or weight >= 25kg, not pregnant)
    const breedingFemales = activeAnimals.filter((a) => {
      if (a.sex !== 'Female' || a.breeding_status === 'Pregnant') return false;
      const m = getAgeMonths(a.date_of_birth);
      return (m !== null && m >= 8) || (a.weight_kg !== null && a.weight_kg >= 25);
    }).length;

    // Breeding males (mature males >= 8 months or weight >= 30kg)
    const breedingMales = activeAnimals.filter((a) => {
      if (a.sex !== 'Male') return false;
      const m = getAgeMonths(a.date_of_birth);
      return (m !== null && m >= 8) || (a.weight_kg !== null && a.weight_kg >= 30);
    }).length;

    // Expected kidding count from active pregnant breeding records
    const expectedKidding = farmData.breedingRecords.filter(
      (r) => r.status === 'Pregnant' && r.expected_kidding_date,
    ).length;

    // Health condition counts
    let healthyCount = 0;
    let monitorCount = 0;
    let needsAttentionCount = 0;

    for (const a of activeAnimals) {
      const cls = getAnimalHealthClassification(a, farmData.healthRecords);
      if (cls === 'Needs Attention') needsAttentionCount++;
      else if (cls === 'Monitor') monitorCount++;
      else healthyCount++;
    }

    return {
      total,
      goats,
      sheep,
      male,
      female,
      young,
      adult,
      pregnant,
      notPregnant: Math.max(0, female - pregnant),
      breedingFemales,
      breedingMales,
      expectedKidding,
      healthyCount,
      monitorCount,
      needsAttentionCount,
    };
  }, [activeAnimals, farmData.breedingRecords, farmData.healthRecords]);

  // ── Physical Farm Stocks Metrics ─────────────────────────────────────────────
  const totalFeedKg = useMemo(() => {
    return farmData.inventory
      .filter((i) => {
        const cat = (i.category || '').toLowerCase();
        return cat === 'feed' || cat.includes('feed') || cat.includes('hay') || cat.includes('pakain');
      })
      .reduce((sum, item) => {
        const q = Number(item.quantity) || 0;
        const u = (item.unit || '').toLowerCase();
        if (u.includes('bag') || u.includes('sack')) return sum + q * 50;
        return sum + q;
      }, 0);
  }, [farmData.inventory]);

  const healthSuppliesStats = useMemo(() => {
    const healthItems = farmData.inventory.filter((i) => {
      const c = (i.category || '').toLowerCase();
      return (
        c === 'medicine' ||
        c === 'vaccines' ||
        c === 'vitamins' ||
        c === 'supplements' ||
        c.includes('med') ||
        c.includes('vacc') ||
        c.includes('vit')
      );
    });
    const medsCount = healthItems.filter((i) => (i.category || '').toLowerCase().includes('med')).length;
    const vaxCount = healthItems.filter((i) => (i.category || '').toLowerCase().includes('vacc')).length;
    const suppCount = healthItems.filter((i) => {
      const c = (i.category || '').toLowerCase();
      return c.includes('vit') || c.includes('supp');
    }).length;
    const totalUnits = healthItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    return {
      itemCount: healthItems.length,
      medsCount,
      vaxCount,
      suppCount,
      totalUnits,
    };
  }, [farmData.inventory]);

  const equipmentToolsStats = useMemo(() => {
    const items = farmData.inventory.filter((i) => {
      const c = (i.category || '').toLowerCase();
      return (
        c === 'equipment' ||
        c === 'tools' ||
        c === 'supplies' ||
        c.includes('equip') ||
        c.includes('tool') ||
        c.includes('suppl')
      );
    });
    const equipCount = items.filter((i) => (i.category || '').toLowerCase().includes('equip')).length;
    const toolsCount = items.filter((i) => (i.category || '').toLowerCase().includes('tool')).length;
    const suppliesCount = items.filter((i) => (i.category || '').toLowerCase().includes('suppl')).length;
    const totalUnits = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    return {
      itemCount: items.length,
      equipCount,
      toolsCount,
      suppliesCount,
      totalUnits,
    };
  }, [farmData.inventory]);

  // ── Filtered Physical Inventory list ────────────────────────────────────────
  const filtered = useMemo(() => {
    return farmData.inventory
      .filter((i) => {
        if (activeTab === 'feeds') {
          const c = (i.category || '').toLowerCase();
          return c === 'feed' || c.includes('feed') || c.includes('hay');
        }
        if (activeTab === 'health') {
          const c = (i.category || '').toLowerCase();
          return c === 'medicine' || c === 'vaccines' || c === 'vitamins' || c === 'supplements';
        }
        if (activeTab === 'equipment') {
          const c = (i.category || '').toLowerCase();
          return c === 'equipment' || c === 'tools' || c === 'supplies';
        }
        return true;
      })
      .filter((i) => fCategory === 'All' || i.category === fCategory)
      .filter((i) => {
        if (fStatus === 'All') return true;
        const s = inventoryStatus(i, warningDays);
        return s.status === fStatus;
      })
      .filter(
        (i) =>
          !search ||
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          (i.supplier ?? '').toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [farmData.inventory, activeTab, fCategory, fStatus, search, warningDays]);

  // ── Financial and stock summary ─────────────────────────────────────────────
  const summary = useMemo(() => {
    const inv = farmData.inventory;
    const warningDaysLocal = warningDays;
    const lowStock = inv.filter((i) => inventoryStatus(i, warningDaysLocal).status === 'Low Stock').length;
    const outOfStock = inv.filter((i) => inventoryStatus(i, warningDaysLocal).status === 'Out of Stock').length;
    const expiring = inv.filter((i) => inventoryStatus(i, warningDaysLocal).status === 'Expiring Soon').length;
    const expired = inv.filter((i) => inventoryStatus(i, warningDaysLocal).status === 'Expired').length;

    const totalConsumed = allTx.filter((t) => t.type === 'CONSUMPTION').reduce((s, t) => s + t.quantity, 0);

    // Time boundaries
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const consumedToday = allTx
      .filter((t) => t.type === 'CONSUMPTION' && t.created_at.startsWith(todayStr))
      .reduce((s, t) => s + t.quantity, 0);

    const consumedWeek = allTx
      .filter((t) => t.type === 'CONSUMPTION' && new Date(t.created_at) >= weekAgo)
      .reduce((s, t) => s + t.quantity, 0);

    const consumedMonth = allTx
      .filter((t) => t.type === 'CONSUMPTION' && new Date(t.created_at) >= monthStart)
      .reduce((s, t) => s + t.quantity, 0);

    const addedMonth = allTx
      .filter((t) => (t.type === 'STOCK_IN' || t.type === 'RETURN') && new Date(t.created_at) >= monthStart)
      .reduce((s, t) => s + t.quantity, 0);

    // Spend transactions
    const spendTx = allTx.filter((t) => t.type === 'STOCK_IN' || t.type === 'RETURN');
    const totalSpent = spendTx.reduce((s, t) => s + t.quantity * (Number(t.cost_per_unit) || 0), 0);
    const spentThisMonth = spendTx
      .filter((t) => new Date(t.created_at) >= monthStart)
      .reduce((s, t) => s + t.quantity * (Number(t.cost_per_unit) || 0), 0);
    const spentThisWeek = spendTx
      .filter((t) => new Date(t.created_at) >= weekAgo)
      .reduce((s, t) => s + t.quantity * (Number(t.cost_per_unit) || 0), 0);
    const spentToday = spendTx
      .filter((t) => t.created_at.startsWith(todayStr))
      .reduce((s, t) => s + t.quantity * (Number(t.cost_per_unit) || 0), 0);

    const totalSpentFallback =
      totalSpent === 0
        ? inv.reduce((s, i) => s + (Number(i.cost) || 0) * (Number(i.quantity) || 0), 0)
        : totalSpent;

    const consumedTx = allTx.filter((t) => t.type === 'CONSUMPTION');
    const totalConsumedValue = consumedTx.reduce((s, t) => s + t.quantity * (Number(t.cost_per_unit) || 0), 0);
    const consumedValueMonth = consumedTx
      .filter((t) => new Date(t.created_at) >= monthStart)
      .reduce((s, t) => s + t.quantity * (Number(t.cost_per_unit) || 0), 0);

    const currentInventoryValue = inv.reduce((s, i) => s + Number(i.quantity) * (Number(i.cost) || 0), 0);

    const byCategory: Record<string, number> = {};
    for (const t of spendTx) {
      const item = inv.find((i) => i.id === t.inventory_item_id);
      const cat = item?.category ?? 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + t.quantity * (Number(t.cost_per_unit) || 0);
    }

    return {
      totalItems: inv.length,
      lowStock,
      outOfStock,
      expiring,
      expired,
      totalValue: currentInventoryValue,
      totalConsumed,
      consumedToday,
      consumedWeek,
      consumedMonth,
      addedMonth,
      totalSpent: totalSpentFallback,
      spentThisMonth,
      spentThisWeek,
      spentToday,
      totalConsumedValue,
      consumedValueMonth,
      currentInventoryValue,
      byCategory,
    };
  }, [farmData.inventory, allTx, warningDays]);

  // ── Core transaction helper ─────────────────────────────────────────────────
  const recordTransaction = async (
    item: InventoryItem,
    type: InventoryTransaction['type'],
    qty: number,
    reason: string | null,
    notes: string | null,
    costPerUnit?: number | null,
    referenceType?: string | null,
    referenceId?: string | null,
  ): Promise<{ newStock: number } | null> => {
    const sign = txSign(type);
    const prevStock = Number(item.quantity);
    const newStock = sign === '+' ? prevStock + qty : prevStock - qty;

    if (newStock < 0) {
      toast(`Kulang ang stock. Natitira: ${prevStock} ${item.unit}, Nais kunin: ${qty} ${item.unit}.`, 'danger');
      return null;
    }

    const { error: txErr } = await supabase.from('inventory_transactions').insert({
      inventory_item_id: item.id,
      type,
      quantity: qty,
      unit: item.unit,
      reason: reason || null,
      notes: notes || null,
      previous_stock: prevStock,
      new_stock: newStock,
      cost_per_unit: costPerUnit ?? item.cost ?? null,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
    });
    if (txErr) throw txErr;

    const { error: invErr } = await supabase.from('inventory').update({ quantity: newStock }).eq('id', item.id);
    if (invErr) throw invErr;

    return { newStock };
  };

  // ── Consume (Usage) ─────────────────────────────────────────────────────────
  const openConsume = (item: InventoryItem) => {
    setConsumeItem(item);
    setConsumeQty('');
    setConsumeReason('');
    setConsumeDate(new Date().toISOString().split('T')[0]);
    setConsumeAnimalId('');
    setConsumeOpen(true);
  };

  const handleConsumeStock = async () => {
    if (!consumeItem || consumeSaving) return;
    const qty = Number(consumeQty);
    if (!consumeQty || isNaN(qty) || qty <= 0) {
      toast('Maglagay ng wastong dami.', 'danger');
      return;
    }
    if (qty > Number(consumeItem.quantity)) {
      toast(`Kulang ang stock (${consumeItem.quantity} ${consumeItem.unit} lamang ang natitira).`, 'danger');
      return;
    }
    setConsumeSaving(true);
    try {
      const targetAnimal = consumeAnimalId ? farmData.animals.find((a) => a.id === consumeAnimalId) : null;
      const txNotes = targetAnimal
        ? `Ginamit para kay ${targetAnimal.tag_id} (${targetAnimal.name || 'Walang Pangalan'})`
        : null;

      const result = await recordTransaction(
        consumeItem,
        'CONSUMPTION',
        qty,
        consumeReason || 'Usage',
        txNotes,
        null,
        targetAnimal ? 'animal' : null,
        targetAnimal ? targetAnimal.id : null,
      );
      if (!result) {
        setConsumeSaving(false);
        return;
      }

      // Link to clinical health audit trail if used for animal
      if (targetAnimal) {
        await supabase.from('health_records').insert({
          animal_id: targetAnimal.id,
          record_date: consumeDate || new Date().toISOString().split('T')[0],
          reasons: [`Paggamit ng Imbentaryo: ${consumeItem.name}`],
          notes: `Ibinigay/Ginamit ang ${qty} ${consumeItem.unit} ng ${consumeItem.name}. Dahilan: ${consumeReason || 'Gamot / Suporta sa kalusugan'}.`,
          risk_level: 'Low',
          risk_score: 0,
        });
      }

      const updatedItem = { ...consumeItem, quantity: result.newStock };
      const nextStatus = inventoryStatus(updatedItem, warningDays);
      if (nextStatus.status !== 'OK') {
        await createNotification(
          user?.id ?? '',
          'Inventory',
          `${consumeItem.name}: ${nextStatus.label}`,
          `Nagamit: ${qty} ${consumeItem.unit}. Natitirang stock: ${result.newStock} ${consumeItem.unit}.`,
          nextStatus.status === 'Out of Stock' || nextStatus.status === 'Expired' ? 'Critical' : 'Warning',
          '/inventory',
        );
      }

      toast(`Naitala: −${qty} ${consumeItem.unit} ng ${consumeItem.name}. Natitira: ${result.newStock} ${consumeItem.unit}.`, 'success');
      setConsumeOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Hindi maitala ang paggamit.', 'danger');
    } finally {
      setConsumeSaving(false);
    }
  };

  // ── Stock-in ────────────────────────────────────────────────────────────────
  const openStockIn = (item: InventoryItem) => {
    setStockInItem(item);
    setStockInQty('');
    setStockInCost('');
    setStockInSupplier(item.supplier ?? '');
    setStockInDate(new Date().toISOString().split('T')[0]);
    setStockInNotes('');
    setStockInOpen(true);
  };

  const handleStockIn = async () => {
    if (!stockInItem || stockInSaving) return;
    const qty = Number(stockInQty);
    if (!stockInQty || isNaN(qty) || qty <= 0) {
      toast('Maglagay ng wastong dami.', 'danger');
      return;
    }
    setStockInSaving(true);
    try {
      const costPerUnit = stockInCost ? Number(stockInCost) / qty : stockInItem.cost;
      const notes = [
        stockInSupplier ? `Supplier: ${stockInSupplier}` : '',
        stockInDate ? `Date: ${stockInDate}` : '',
        stockInNotes,
      ].filter(Boolean).join(' | ') || null;

      const result = await recordTransaction(stockInItem, 'STOCK_IN', qty, 'Stock replenishment', notes, costPerUnit);
      if (!result) {
        setStockInSaving(false);
        return;
      }

      if (stockInSupplier || stockInCost) {
        await supabase
          .from('inventory')
          .update({
            ...(stockInSupplier ? { supplier: stockInSupplier } : {}),
            ...(costPerUnit ? { cost: costPerUnit } : {}),
          })
          .eq('id', stockInItem.id);
      }

      toast(`Naidagdag ang ${qty} ${stockInItem.unit} sa ${stockInItem.name}. Bagong stock: ${result.newStock} ${stockInItem.unit}.`, 'success');
      setStockInOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Hindi maidagdag ang stock.', 'danger');
    } finally {
      setStockInSaving(false);
    }
  };

  // ── Remove (spoilage/loss) ──────────────────────────────────────────────────
  const openRemove = (item: InventoryItem) => {
    setRemoveItem(item);
    setRemoveQty('');
    setRemoveReason('');
    setRemoveNotes('');
    setRemoveOpen(true);
  };

  const handleRemove = async () => {
    if (!removeItem || removeSaving) return;
    const qty = Number(removeQty);
    if (!removeQty || isNaN(qty) || qty <= 0) {
      toast('Maglagay ng wastong dami.', 'danger');
      return;
    }
    if (qty > Number(removeItem.quantity)) {
      toast(`Hindi maaaring magbawas ng higit sa natitirang stock (${removeItem.quantity} ${removeItem.unit}).`, 'danger');
      return;
    }
    if (!removeReason.trim()) {
      toast('Pumili o magbigay ng dahilan sa pagbawas.', 'danger');
      return;
    }
    setRemoveSaving(true);
    try {
      const result = await recordTransaction(removeItem, 'REMOVAL', qty, removeReason, removeNotes || null);
      if (!result) {
        setRemoveSaving(false);
        return;
      }
      toast(`Nabawas ang ${qty} ${removeItem.unit} mula sa ${removeItem.name}. Natitira: ${result.newStock} ${removeItem.unit}.`, 'success');
      setRemoveOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Hindi maitala ang pagbawas.', 'danger');
    } finally {
      setRemoveSaving(false);
    }
  };

  // ── History modal ───────────────────────────────────────────────────────────
  const openHistory = (item: InventoryItem) => {
    setHistoryItem(item);
    setHistoryOpen(true);
  };

  const historyTx = useMemo(
    () =>
      historyItem
        ? [...allTx.filter((t) => t.inventory_item_id === historyItem.id)].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )
        : [],
    [historyItem, allTx],
  );

  // ── Add/Edit item ───────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      unit: item.unit,
      minimum_stock: String(item.minimum_stock),
      purchase_date: item.purchase_date ?? '',
      expiry_date: item.expiry_date ?? '',
      supplier: item.supplier ?? '',
      cost: item.cost !== null && item.cost !== undefined ? String(item.cost) : '',
      notes: item.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Pangalan ng item ay kailangan.';
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) < 0)
      e.quantity = 'Wastong dami ay kailangan.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        quantity: Number(form.quantity),
        unit: form.unit.trim() || 'kg',
        minimum_stock: Number(form.minimum_stock) || 0,
        purchase_date: form.purchase_date || null,
        expiry_date: form.expiry_date || null,
        supplier: form.supplier.trim() || null,
        cost: form.cost ? Number(form.cost) : null,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        const qtyDiff = Number(form.quantity) - Number(editing.quantity);
        const { error } = await supabase.from('inventory').update(payload).eq('id', editing.id);
        if (error) throw error;

        if (qtyDiff !== 0) {
          await supabase.from('inventory_transactions').insert({
            inventory_item_id: editing.id,
            type: qtyDiff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
            quantity: Math.abs(qtyDiff),
            unit: editing.unit,
            reason: 'Manual adjustment via edit',
            previous_stock: Number(editing.quantity),
            new_stock: Number(form.quantity),
          });
        }
        toast('Matagumpay na na-update ang gamit sa imbentaryo.', 'success');
      } else {
        const { data: inserted, error } = await supabase.from('inventory').insert(payload).select().maybeSingle();
        if (error) throw error;

        if (inserted && Number(form.quantity) > 0) {
          await supabase.from('inventory_transactions').insert({
            inventory_item_id: inserted.id,
            type: 'STOCK_IN',
            quantity: Number(form.quantity),
            unit: form.unit,
            reason: 'Initial stock entry',
            previous_stock: 0,
            new_stock: Number(form.quantity),
            cost_per_unit: form.cost ? Number(form.cost) : null,
          });
        }
        toast('Matagumpay na naidagdag sa imbentaryo.', 'success');
      }

      setModalOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Hindi mai-save ang item.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await supabase.from('inventory_transactions').delete().eq('inventory_item_id', confirmDelete.id);
      const { error } = await supabase.from('inventory').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Matagumpay na nabura ang gamit sa imbentaryo.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Hindi mabura ang item.', 'danger');
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.4px', color: 'var(--color-text-primary, #0F172A)' }}>
              Farm Inventory
            </h1>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 6,
                background: 'rgba(255, 106, 42, 0.12)',
                color: 'var(--color-primary, #FF6A2A)',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
              }}
            >
              Buod ng Bukid
            </span>
          </div>
          <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            Buod ng lahat ng mayroon sa bukid (Livestock, Pakain, Gamot, at Kagamitan).
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/animals?action=add')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}
          >
            <PawPrint size={15} />
            Magrehistro ng Hayop
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openAdd}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}
          >
            <Plus size={16} />
            Magdagdag ng Item
          </button>
        </div>
      </div>

      {/* ── Main Inventory Overview (Top 6 Cards) ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary, #64748B)', marginBottom: 8 }}>
          Pangkalahatang Buod ng Bukid (General Farm Overview)
        </div>
        <div className="dashboard-stats stats-grid gen-inv-grid mobile-stats-grid-3">
          {/* 1. Livestock */}
          <div className="kpi-card" onClick={() => setActiveTab('livestock')} style={{ cursor: 'pointer' }}>
            <div className="kpi-top">
              <div className="kpi-icon green" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>
                <Layers size={18} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary, #64748B)' }}>Livestock</span>
            </div>
            <div className="kpi-value">{livestockMetrics.total}</div>
            <div className="kpi-label">Lahat ng Alaga</div>
            <div className="kpi-delta up" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{livestockMetrics.goats} kambing · {livestockMetrics.sheep} tupa</span>
            </div>
          </div>

          {/* 2. Feed */}
          <div className="kpi-card" onClick={() => setActiveTab('feeds')} style={{ cursor: 'pointer' }}>
            <div className="kpi-top">
              <div className="kpi-icon orange" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B' }}>
                <Wheat size={18} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary, #64748B)' }}>Feed</span>
            </div>
            <div className="kpi-value">
              {totalFeedKg.toLocaleString('en-PH', { maximumFractionDigits: 1 })} <span style={{ fontSize: 14 }}>kg</span>
            </div>
            <div className="kpi-label">Reserbang Pakain</div>
            <div className="kpi-delta up">Kabuuang pakain sa bukid</div>
          </div>

          {/* 3. Health Supplies */}
          <div className="kpi-card" onClick={() => setActiveTab('health')} style={{ cursor: 'pointer' }}>
            <div className="kpi-top">
              <div className="kpi-icon red" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444' }}>
                <Pill size={18} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary, #64748B)' }}>Health Supplies</span>
            </div>
            <div className="kpi-value">{healthSuppliesStats.itemCount} <span style={{ fontSize: 14 }}>uri</span></div>
            <div className="kpi-label">Kalusugan at Gamot</div>
            <div className="kpi-delta up">
              {healthSuppliesStats.medsCount} gamot · {healthSuppliesStats.vaxCount} bakuna
            </div>
          </div>

          {/* 4. Farm Supplies */}
          <div className="kpi-card" onClick={() => setActiveTab('equipment')} style={{ cursor: 'pointer' }}>
            <div className="kpi-top">
              <div className="kpi-icon blue" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6' }}>
                <Package size={18} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary, #64748B)' }}>Farm Supplies</span>
            </div>
            <div className="kpi-value">{equipmentToolsStats.suppliesCount} <span style={{ fontSize: 14 }}>uri</span></div>
            <div className="kpi-label">Suplay sa Bukid</div>
            <div className="kpi-delta up">
              Materyales at gamit sa bukid
            </div>
          </div>

          {/* 5. Equipment */}
          <div className="kpi-card" onClick={() => setActiveTab('equipment')} style={{ cursor: 'pointer' }}>
            <div className="kpi-top">
              <div className="kpi-icon blue" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366F1' }}>
                <Wrench size={18} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary, #64748B)' }}>Equipment</span>
            </div>
            <div className="kpi-value">{equipmentToolsStats.equipCount + equipmentToolsStats.toolsCount} <span style={{ fontSize: 14 }}>gamit</span></div>
            <div className="kpi-label">Farm Equipment</div>
            <div className="kpi-delta up">
              {equipmentToolsStats.equipCount} equipment · {equipmentToolsStats.toolsCount} tools
            </div>
          </div>

          {/* 6. Low Stock */}
          <div className="kpi-card" onClick={() => setFStatus('Low Stock')} style={{ cursor: 'pointer' }}>
            <div className="kpi-top">
              <div className="kpi-icon red" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444' }}>
                <AlertTriangle size={18} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444' }}>Low Stock</span>
            </div>
            <div className="kpi-value" style={{ color: summary.lowStock > 0 ? '#EF4444' : undefined }}>
              {summary.lowStock} <span style={{ fontSize: 14 }}>item</span>
            </div>
            <div className="kpi-label">Kailangang Restock</div>
            <div className="kpi-delta down">
              Mababang antas ng imbentaryo
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .gen-inv-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        @media (max-width: 1024px) {
          .gen-inv-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }
        }
        @media (max-width: 767px) {
          .gen-inv-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
        }
        @media (max-width: 480px) {
          .gen-inv-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }
        }
      `}</style>

      {/* ── Active Alerts Strip ── */}
      {(livestockMetrics.needsAttentionCount > 0 || summary.lowStock > 0 || summary.expired > 0 || summary.expiring > 0) && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'var(--color-surface, #FFFFFF)',
            border: '1px solid var(--color-border, #E2E8F0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: 'var(--color-text-primary, #0F172A)' }}>
              <AlertTriangle size={16} color="#F59E0B" />
              Mga Alerto sa Bukid:
            </div>

            {livestockMetrics.needsAttentionCount > 0 && (
              <span
                onClick={() => navigate('/health')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#EF4444',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <ShieldAlert size={14} />
                {livestockMetrics.needsAttentionCount} Hayop ang Nangangailangan ng Atensyon
              </span>
            )}

            {summary.lowStock > 0 && (
              <span
                onClick={() => { setActiveTab('all'); setFStatus('Low Stock'); }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#D97706',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <PackageX size={14} />
                {summary.lowStock} Mababang Stock sa Supplies
              </span>
            )}

            {summary.expired > 0 && (
              <span
                onClick={() => { setActiveTab('all'); setFStatus('Expired'); }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#DC2626',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <AlertTriangle size={14} />
                {summary.expired} Expired na Gamot o Gamit
              </span>
            )}

            {summary.expiring > 0 && (
              <span
                onClick={() => { setActiveTab('all'); setFStatus('Expiring Soon'); }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: '#2563EB',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <History size={14} />
                {summary.expiring} Malapit Nang Mag-expire
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Category Quick Filter Tabs ── */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          borderBottom: '1px solid var(--color-border, #E2E8F0)',
        }}
      >
        {[
          { key: 'all', label: 'Lahat ng Mayroon sa Bukid (General Overview)', icon: <Layers size={15} /> },
          { key: 'livestock', label: `Mga Hayop / Livestock (${livestockMetrics.total})`, icon: <PawPrint size={15} /> },
          { key: 'feeds', label: 'Reserbang Pakain (Feeds)', icon: <Wheat size={15} /> },
          { key: 'health', label: 'Gamot at Kalusugan (Health Supplies)', icon: <Pill size={15} /> },
          { key: 'equipment', label: 'Kagamitan at Kasangkapan (Equipment & Tools)', icon: <Wrench size={15} /> },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              border: activeTab === tab.key ? '1px solid var(--color-primary, #FF6A2A)' : '1px solid transparent',
              background: activeTab === tab.key ? 'rgba(255, 106, 42, 0.1)' : 'transparent',
              color: activeTab === tab.key ? 'var(--color-primary, #FF6A2A)' : 'var(--color-text-secondary, #64748B)',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 1: LIVESTOCK INVENTORY (Mga Alagang Hayop)
          ══════════════════════════════════════════════════════════════════════════ */}
      {(activeTab === 'all' || activeTab === 'livestock') && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GoatIcon size={20} color="var(--color-primary, #FF6A2A)" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary, #0F172A)' }}>
                  Imbentaryo ng mga Hayop (Livestock Inventory)
                </h3>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-secondary, #64748B)' }}>
                Direktang naka-link sa Talaan ng mga Hayop (Animals Database). Awtomatikong nag-a-update ang bilang.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAnimalsRoster((prev) => !prev)}
                style={{ fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {showAnimalsRoster ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showAnimalsRoster ? 'Itago ang Talaan ng Alaga' : 'Ipakita ang Talaan ng Alaga'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => navigate('/animals')}
                style={{ fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-primary, #FF6A2A)' }}
              >
                Pamamahala ng Hayop <ArrowRight size={13} />
              </button>
            </div>
          </div>

          {/* 4 Livestock Dimension Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
            {/* Card A: Species & Kasarian */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: 'var(--color-surface-elevated, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-text-secondary, #64748B)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <GoatIcon size={14} color="var(--color-primary, #FF6A2A)" />
                Uri at Kasarian (Species & Sex)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Kambing (Goat):</span>
                  <span style={{ fontWeight: 800, color: 'var(--color-primary, #FF6A2A)' }}>{livestockMetrics.goats} ulo</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Tupa (Sheep):</span>
                  <span style={{ fontWeight: 800, color: '#3B82F6' }}>{livestockMetrics.sheep} ulo</span>
                </div>
                <div style={{ borderTop: '1px dashed var(--color-border, #E2E8F0)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Lalaki (Barako):</span>
                  <span style={{ fontWeight: 700 }}>{livestockMetrics.male}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Babae (Inahin):</span>
                  <span style={{ fontWeight: 700 }}>{livestockMetrics.female}</span>
                </div>
              </div>
            </div>

            {/* Card B: Edad at Yugto */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: 'var(--color-surface-elevated, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-text-secondary, #64748B)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Baby size={14} color="#06B6D4" />
                Yugto ng Edad (Age & Stage)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Bisiro / Young (&lt; 12 mo):</span>
                  <span style={{ fontWeight: 800, color: '#06B6D4' }}>{livestockMetrics.young} ulo</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Matanda / Adult (≥ 12 mo):</span>
                  <span style={{ fontWeight: 800, color: '#6366F1' }}>{livestockMetrics.adult} ulo</span>
                </div>
                <div style={{ borderTop: '1px dashed var(--color-border, #E2E8F0)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--color-text-secondary, #64748B)' }}>Lahi / Breeding Stock:</span>
                  <span style={{ fontWeight: 700, color: '#10B981' }}>{livestockMetrics.breedingFemales + livestockMetrics.breedingMales} handa</span>
                </div>
              </div>
            </div>

            {/* Card C: Pagpaparami at Pagbubuntis */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: 'var(--color-surface-elevated, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-text-secondary, #64748B)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Heart size={14} color="#EC4899" />
                Pagpaparami (Reproduction)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Buntis (Pregnant):</span>
                  <span style={{ fontWeight: 800, color: '#EC4899' }}>{livestockMetrics.pregnant} inahin</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Hindi Buntis:</span>
                  <span style={{ fontWeight: 700 }}>{livestockMetrics.notPregnant}</span>
                </div>
                <div style={{ borderTop: '1px dashed var(--color-border, #E2E8F0)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--color-text-secondary, #64748B)' }}>Inaasahang Panganganak:</span>
                  <span style={{ fontWeight: 700, color: '#F59E0B' }}>{livestockMetrics.expectedKidding}</span>
                </div>
              </div>
            </div>

            {/* Card D: Kalagayan sa Kalusugan */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: 'var(--color-surface-elevated, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-text-secondary, #64748B)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <HeartPulse size={14} color="#EF4444" />
                Kalusugan (Health Condition)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-secondary, #475569)' }}>
                    <CheckCircle2 size={13} color="#10B981" /> Malusog (Healthy):
                  </span>
                  <span style={{ fontWeight: 800, color: '#10B981' }}>{livestockMetrics.healthyCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-secondary, #475569)' }}>
                    <AlertTriangle size={13} color="#F59E0B" /> Bantayan (Monitor):
                  </span>
                  <span style={{ fontWeight: 800, color: '#F59E0B' }}>{livestockMetrics.monitorCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-secondary, #475569)' }}>
                    <ShieldAlert size={13} color="#EF4444" /> Needs Attention:
                  </span>
                  <span style={{ fontWeight: 800, color: '#EF4444' }}>{livestockMetrics.needsAttentionCount}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Animals Roster Drawer */}
          {showAnimalsRoster && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border, #E2E8F0)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary, #0F172A)' }}>
                  Aktibong Talaan ng mga Hayop sa Bukid ({activeAnimals.length})
                </h4>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate('/animals')}
                  style={{ fontSize: 11 }}
                >
                  Tingnan sa Animals Module
                </button>
              </div>

              {activeAnimals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--color-text-secondary, #64748B)', fontSize: 13 }}>
                  Walang aktibong hayop na nakatala. Magrehistro ng bago gamit ang button sa itaas.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Animal ID</th>
                        <th>Pangalan</th>
                        <th>Uri / Species</th>
                        <th>Kasarian</th>
                        <th>Edad</th>
                        <th>Kalusugan</th>
                        <th>Pagbubuntis</th>
                        <th>Aksyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeAnimals.slice(0, 15).map((a) => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 800, color: 'var(--color-primary, #FF6A2A)' }}>{a.tag_id}</td>
                          <td style={{ fontWeight: 600 }}>{a.name || 'Walang Pangalan'}</td>
                          <td>
                            <span className="badge" style={{ background: 'var(--color-surface-elevated, #F8FAFC)', border: '1px solid var(--color-border, #E2E8F0)', fontSize: 11 }}>
                              {a.species === 'Goat' ? 'Kambing' : 'Tupa'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{a.sex === 'Male' ? 'Lalaki' : 'Babae'}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748B)' }}>{ageLabel(a.date_of_birth)}</td>
                          <td>
                            <AnimalHealthBadge
                              status={a.health_status}
                              size="sm"
                            />
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {a.breeding_status === 'Pregnant' ? (
                              <span style={{ color: '#EC4899', fontWeight: 700 }}>Buntis</span>
                            ) : (
                              <span style={{ color: 'var(--color-text-secondary, #64748B)' }}>{a.breeding_status || 'Open'}</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => navigate(`/animals/${a.id}`)}
                              style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary, #FF6A2A)' }}
                            >
                              Tingnan
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {activeAnimals.length > 15 && (
                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12, color: 'var(--color-text-secondary, #64748B)' }}>
                      Ipinapakita ang unang 15 sa {activeAnimals.length} aktibong hayop.{' '}
                      <button
                        type="button"
                        onClick={() => navigate('/animals')}
                        style={{ color: 'var(--color-primary, #FF6A2A)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}
                      >
                        Tingnan ang lahat sa Animals Page &rarr;
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 2: FARM STOCKS & RESOURCES (Pakain, Gamot, Kagamitan)
          ══════════════════════════════════════════════════════════════════════════ */}
      {(activeTab === 'all' || activeTab !== 'livestock') && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={20} color="#F59E0B" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary, #0F172A)' }}>
                  Imbentaryo ng mga Gamit at Supplies (Farm Stocks & Resources)
                </h3>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-secondary, #64748B)' }}>
                Pakain, gamot, bakuna, kagamitan, at mga kasangkapan para sa pagpapatakbo ng bukid.
              </p>
            </div>

            <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
              <Plus size={14} /> Magdagdag ng Stock
            </button>
          </div>

          {/* Filters */}
          <FilterToolbar>
            <FilterSearch placeholder="Hanapin ang pangalan ng gamit o supplier..." value={search} onChange={setSearch} />
            <FilterSelect
              value={fCategory}
              onChange={setFCategory}
              options={[
                { value: 'All', label: 'Lahat ng Kategorya (All)' },
                { value: 'Feed', label: 'Reserbang Pakain (Feed)' },
                { value: 'Medicine', label: 'Gamot (Medicine)' },
                { value: 'Vaccines', label: 'Bakuna (Vaccines)' },
                { value: 'Vitamins', label: 'Bitamina (Vitamins)' },
                { value: 'Supplements', label: 'Suplemento (Supplements)' },
                { value: 'Supplies', label: 'Mga Gamit (Supplies)' },
                { value: 'Equipment', label: 'Kagamitan (Equipment)' },
                { value: 'Tools', label: 'Kasangkapan (Tools)' },
                { value: 'Other', label: 'Iba pa (Other)' },
              ]}
              ariaLabel="Filter Category"
            />
            <FilterSelect
              value={fStatus}
              onChange={setFStatus}
              options={[
                { value: 'All', label: 'Lahat ng Status' },
                { value: 'OK', label: 'May Stock (In Stock)' },
                { value: 'Low Stock', label: 'Mababang Stock' },
                { value: 'Out of Stock', label: 'Ubos na (Out of Stock)' },
                { value: 'Expiring Soon', label: 'Malapit Nang Mag-expire' },
                { value: 'Expired', label: 'Expired' },
              ]}
              ariaLabel="Filter Status"
            />
          </FilterToolbar>

          {/* Physical Inventory Table */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Package size={32} />}
              title="Walang natagpuang gamit o supply"
              description="Magdagdag ng pakain, gamot, o kagamitan upang masubaybayan ang stock at paggamit."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item & Supplier</th>
                    <th>Kategorya</th>
                    <th>Kasalukuyang Stock</th>
                    <th>Nagamit Ngayong Buwan</th>
                    <th>Min. Stock</th>
                    <th>Status</th>
                    <th>Tinatayang Halaga</th>
                    <th>Expiry Date</th>
                    <th>Mga Aksyon</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => {
                    const s = inventoryStatus(i, warningDays);
                    const tots = itemTotals(i.id, allTx);
                    const value = Number(i.quantity) * (Number(i.cost) || 0);
                    return (
                      <tr key={i.id}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary, #0F172A)' }}>
                            {i.name}
                          </div>
                          {i.supplier && (
                            <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748B)' }}>
                              {i.supplier}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: 'var(--color-surface-elevated, #F8FAFC)',
                              border: '1px solid var(--color-border, #E2E8F0)',
                              color: 'var(--color-text-secondary, #475569)',
                              fontSize: 11,
                            }}
                          >
                            {i.category}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: 14,
                              color:
                                Number(i.quantity) <= 0
                                  ? '#EF4444'
                                  : Number(i.quantity) <= Number(i.minimum_stock)
                                  ? '#F59E0B'
                                  : 'var(--color-text-primary, #0F172A)',
                            }}
                          >
                            {Number(i.quantity).toFixed(Number.isInteger(Number(i.quantity)) ? 0 : 1)} {i.unit}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: tots.totalConsumed > 0 ? '#EF4444' : 'var(--color-text-secondary, #64748B)' }}>
                          {tots.totalConsumed > 0
                            ? `${tots.totalConsumed.toFixed(Number.isInteger(tots.totalConsumed) ? 0 : 1)} ${i.unit}`
                            : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748B)' }}>
                          {i.minimum_stock} {i.unit}
                        </td>
                        <td>
                          <span
                            className={`badge badge-${
                              s.color === 'green'
                                ? 'green'
                                : s.color === 'orange'
                                ? 'orange'
                                : s.color === 'red'
                                ? 'red'
                                : 'gray'
                            }`}
                          >
                            {s.label}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 700 }}>
                          {value > 0 ? `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}` : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748B)' }}>
                          {formatDate(i.expiry_date)}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openConsume(i)}
                              title="Itala ang nagamit (Gamitin)"
                              style={{ color: '#EF4444' }}
                            >
                              <TrendingDown size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openStockIn(i)}
                              title="Dagdagan ang stock"
                              style={{ color: '#16A34A' }}
                            >
                              <TrendingUp size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openRemove(i)}
                              title="Tapon / Bawas (Spoilage)"
                              style={{ color: '#F59E0B' }}
                            >
                              <PackageX size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openHistory(i)}
                              title="Kasaysayan ng stock"
                            >
                              <History size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openEdit(i)}
                              title="I-edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setConfirmDelete(i)}
                              style={{ color: '#EF4444' }}
                              title="Burahin"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 3: INVENTORY FINANCIALS & USAGE (Gastos at Paggamit)
          ══════════════════════════════════════════════════════════════════════════ */}
      {(activeTab === 'all' || activeTab !== 'livestock') && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarSign size={16} color="var(--color-primary, #FF6A2A)" />
            Pangkalahatang Gastos at Halaga ng Imbentaryo (Inventory Financials)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12, marginBottom: 12 }} className="inv-main-expense">
            {[
              { label: 'Kabuuang Binili (Total Purchased)', value: summary.totalSpent, color: '#FF7A18' },
              { label: 'Kabuuang Nagamit (Total Consumed)', value: summary.totalConsumedValue, color: '#EF4444' },
              { label: 'Kasalukuyang Halaga (Stock Asset Value)', value: summary.currentInventoryValue, color: '#3B82F6' },
            ].map((e) => (
              <div
                key={e.label}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'var(--color-surface-elevated, #F8FAFC)',
                  border: '1px solid var(--color-border, #E2E8F0)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748B)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                  {e.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: e.color }}>
                  ₱{e.value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }} className="inv-expense-grid">
            {[
              { label: 'Ngayong Araw', value: summary.spentToday },
              { label: 'Ngayong Linggo', value: summary.spentThisWeek },
              { label: 'Ngayong Buwan', value: summary.spentThisMonth },
              { label: 'Kabuuang Gastos', value: summary.totalSpent },
            ].map((e) => (
              <div
                key={e.label}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--color-surface-elevated, #F8FAFC)',
                  border: '1px solid var(--color-border, #E2E8F0)',
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--color-text-secondary, #64748B)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>
                  {e.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary, #0F172A)' }}>
                  ₱{e.value.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md">
        <ModalHeader
          title={editing ? 'I-edit ang Gamit sa Bukid' : 'Magdagdag ng Farm Stock / Supply'}
          onClose={() => setModalOpen(false)}
        />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Pangalan ng Gamit / Item Name" required error={errors.name}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Hal. Napier Grass, Dewormer, Feeder Trough"
                />
              </FormField>

              <FormField label="Kategorya / Category">
                <Select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as InventoryCategory })}
                  options={[
                    { value: 'Feed', label: 'Reserbang Pakain (Feed)' },
                    { value: 'Medicine', label: 'Gamot (Medicine)' },
                    { value: 'Vaccines', label: 'Bakuna (Vaccines)' },
                    { value: 'Vitamins', label: 'Bitamina (Vitamins)' },
                    { value: 'Supplements', label: 'Suplemento (Supplements)' },
                    { value: 'Supplies', label: 'Mga Gamit (Supplies)' },
                    { value: 'Equipment', label: 'Kagamitan (Equipment)' },
                    { value: 'Tools', label: 'Kasangkapan (Tools)' },
                    { value: 'Other', label: 'Iba pa (Other)' },
                  ]}
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
              <FormField label="Dami / Quantity" required error={errors.quantity}>
                <Input
                  type="number"
                  step="0.01"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="Hal. 50"
                />
              </FormField>

              <FormField label="Yunit (kg, bote, piraso, sako)">
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="kg"
                />
              </FormField>

              <FormField label="Minimum Safe Stock">
                <Input
                  type="number"
                  step="0.01"
                  value={form.minimum_stock}
                  onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })}
                  placeholder="Hal. 10"
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Petsa ng Pagbili (Purchase Date)">
                <Input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                />
              </FormField>

              <FormField label="Petsa ng Pag-expire (Expiry Date)">
                <Input
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Supplier o Tindahan">
                <Input
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  placeholder="Hal. Agrivet Supplies"
                />
              </FormField>

              <FormField label="Halaga bawat Yunit / Unit Cost (₱)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  placeholder="Hal. 120"
                />
              </FormField>
            </div>

            <FormField label="Mga Tala / Notes">
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Dagdag na detalye ukol sa item..."
                style={{ minHeight: 80 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Kanselahin
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {editing ? 'I-save ang Pagbabago' : 'I-save ang Stock'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Consume Modal ── */}
      <Modal open={consumeOpen} onClose={() => setConsumeOpen(false)} size="md">
        <ModalHeader title="Itala ang Nagamit sa Bukid o sa Hayop" onClose={() => setConsumeOpen(false)} />
        <ModalBody>
          {consumeItem && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--color-surface-elevated, #F8FAFC)',
                  border: '1px solid var(--color-border, #E2E8F0)',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                  {consumeItem.name}
                </div>
                <div style={{ color: 'var(--color-text-secondary, #64748B)', marginTop: 3 }}>
                  Magagamit na stock:{' '}
                  <strong
                    style={{
                      color:
                        Number(consumeItem.quantity) <= Number(consumeItem.minimum_stock)
                          ? '#F59E0B'
                          : '#16A34A',
                    }}
                  >
                    {consumeItem.quantity} {consumeItem.unit}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <FormField
                  label="Dami ng Nagamit"
                  required
                  error={
                    consumeQty && Number(consumeQty) > Number(consumeItem.quantity)
                      ? `Lumalampas sa stock (${consumeItem.quantity} ${consumeItem.unit})`
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={consumeQty}
                    onChange={(e) => setConsumeQty(e.target.value)}
                    placeholder={`Max ${consumeItem.quantity}`}
                  />
                </FormField>

                <FormField label="Petsa ng Paggamit">
                  <Input
                    type="date"
                    value={consumeDate}
                    onChange={(e) => setConsumeDate(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField label="Ginamit Para sa Partikular na Hayop (Opsyonal)">
                <select
                  className="form-select"
                  value={consumeAnimalId}
                  onChange={(e) => setConsumeAnimalId(e.target.value)}
                >
                  <option value="">-- Pangkalahatang Gamit sa Bukid (Walang Hayop) --</option>
                  {activeAnimals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tag_id} {a.name ? `(${a.name})` : ''} — {a.species === 'Goat' ? 'Kambing' : 'Tupa'}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Dahilan o Deskripsyon ng Paggamit">
                <textarea
                  className="form-textarea"
                  value={consumeReason}
                  onChange={(e) => setConsumeReason(e.target.value)}
                  placeholder="Hal. Araw-araw na pakain, pagpupurga, panggagamot..."
                  style={{ minHeight: 80 }}
                />
              </FormField>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setConsumeOpen(false)}>
            Kanselahin
          </Button>
          <Button
            variant="danger"
            onClick={handleConsumeStock}
            loading={consumeSaving}
            leftIcon={<TrendingDown size={14} />}
          >
            Itala ang Nagamit
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Stock-In Modal ── */}
      <Modal open={stockInOpen} onClose={() => setStockInOpen(false)} size="md">
        <ModalHeader title="Dagdagan ang Stock (Stock In)" onClose={() => setStockInOpen(false)} />
        <ModalBody>
          {stockInItem && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--color-surface-elevated, #F8FAFC)',
                  border: '1px solid var(--color-border, #E2E8F0)',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                  {stockInItem.name}
                </div>
                <div style={{ color: 'var(--color-text-secondary, #64748B)', marginTop: 3 }}>
                  Kasalukuyang stock: <strong>{stockInItem.quantity} {stockInItem.unit}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <FormField label="Dami na Idadagdag" required>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={stockInQty}
                    onChange={(e) => setStockInQty(e.target.value)}
                    placeholder="Hal. 20"
                  />
                </FormField>

                <FormField label="Kabuuang Halaga ng Bilihin (₱)">
                  <Input
                    type="number"
                    step="0.01"
                    value={stockInCost}
                    onChange={(e) => setStockInCost(e.target.value)}
                    placeholder="Opsyonal"
                  />
                </FormField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <FormField label="Supplier">
                  <Input
                    value={stockInSupplier}
                    onChange={(e) => setStockInSupplier(e.target.value)}
                    placeholder="Supplier..."
                  />
                </FormField>

                <FormField label="Petsa Natanggap">
                  <Input
                    type="date"
                    value={stockInDate}
                    onChange={(e) => setStockInDate(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField label="Mga Tala / Notes">
                <textarea
                  className="form-textarea"
                  value={stockInNotes}
                  onChange={(e) => setStockInNotes(e.target.value)}
                  placeholder="Numero ng resibo, batch number, atbp."
                  style={{ minHeight: 80 }}
                />
              </FormField>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setStockInOpen(false)}>
            Kanselahin
          </Button>
          <Button
            variant="primary"
            onClick={handleStockIn}
            loading={stockInSaving}
            leftIcon={<TrendingUp size={14} />}
          >
            Dagdagan ang Stock
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Remove Modal ── */}
      <Modal open={removeOpen} onClose={() => setRemoveOpen(false)} size="md">
        <ModalHeader title="Bawasan ang Stock (Spoilage / Loss)" onClose={() => setRemoveOpen(false)} />
        <ModalBody>
          {removeItem && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--color-surface-elevated, #F8FAFC)',
                  border: '1px solid var(--color-border, #E2E8F0)',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                  {removeItem.name}
                </div>
                <div style={{ color: 'var(--color-text-secondary, #64748B)', marginTop: 3 }}>
                  Kasalukuyang stock: <strong>{removeItem.quantity} {removeItem.unit}</strong>
                </div>
              </div>

              <FormField label="Dami na Ibabawas" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={removeQty}
                  onChange={(e) => setRemoveQty(e.target.value)}
                />
              </FormField>

              <FormField label="Dahilan ng Pagbawas" required>
                <Select
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  options={[
                    { value: '', label: 'Pumili ng dahilan...' },
                    { value: 'Spoiled', label: 'Napanis / Nabulok (Spoiled)' },
                    { value: 'Expired', label: 'Nag-expire na (Expired)' },
                    { value: 'Damaged', label: 'Nasira (Damaged)' },
                    { value: 'Lost', label: 'Nawala (Lost)' },
                    { value: 'Incorrect stock count', label: 'Maling bilang sa imbentaryo' },
                    { value: 'Other', label: 'Iba pang dahilan' },
                  ]}
                />
              </FormField>

              <FormField label="Mga Tala / Notes">
                <textarea
                  className="form-textarea"
                  value={removeNotes}
                  onChange={(e) => setRemoveNotes(e.target.value)}
                  placeholder="Karagdagang paliwanag..."
                  style={{ minHeight: 80 }}
                />
              </FormField>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setRemoveOpen(false)}>
            Kanselahin
          </Button>
          <Button
            variant="danger"
            onClick={handleRemove}
            loading={removeSaving}
            leftIcon={<PackageX size={14} />}
          >
            Kumpirmahin ang Pagbawas
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── History Modal ── */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} size="xl">
        <ModalHeader
          title={historyItem ? `Kasaysayan ng Stock — ${historyItem.name}` : 'Kasaysayan ng Stock'}
          onClose={() => setHistoryOpen(false)}
        />
        <ModalBody>
          {historyItem && (
            <div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                {(() => {
                  const tots = itemTotals(historyItem.id, allTx);
                  return [
                    { label: 'Kasalukuyang Stock', value: `${historyItem.quantity} ${historyItem.unit}`, color: '#FF7A18' },
                    { label: 'Kabuuang Idinagdag', value: `+${tots.totalAdded} ${historyItem.unit}`, color: '#16A34A' },
                    { label: 'Kabuuang Nagamit', value: `−${tots.totalConsumed} ${historyItem.unit}`, color: '#EF4444' },
                    { label: 'Kabuuang Nabawas', value: `−${tots.totalRemoved} ${historyItem.unit}`, color: '#F59E0B' },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        flex: '1 1 100px',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: 'var(--color-surface-elevated, #F8FAFC)',
                        border: '1px solid var(--color-border, #E2E8F0)',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748B)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ));
                })()}
              </div>

              {historyTx.length === 0 ? (
                <EmptyState
                  icon={<History size={32} />}
                  title="Walang naitalang kasaysayan"
                  description="Lalabas dito ang bawat galaw ng stock (pagdagdag, paggamit, o pagbawas)."
                />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Petsa</th>
                        <th>Uri</th>
                        <th>Dami</th>
                        <th>Dati</th>
                        <th>Bago</th>
                        <th>Dahilan</th>
                        <th>Mga Tala</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyTx.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748B)', whiteSpace: 'nowrap' }}>
                            {new Date(t.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td>
                            <Badge variant={txSign(t.type) === '+' ? 'success' : 'danger'} size="sm">
                              {txLabel(t.type)}
                            </Badge>
                          </td>
                          <td style={{ fontWeight: 700, color: txColor(t.type) }}>
                            {txSign(t.type)}{t.quantity} {t.unit}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748B)' }}>{t.previous_stock} {t.unit}</td>
                          <td style={{ fontSize: 12, fontWeight: 600 }}>{t.new_stock} {t.unit}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748B)', maxWidth: 160 }}>{t.reason ?? '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748B)', maxWidth: 160 }}>{t.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setHistoryOpen(false)}>
            Isara
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Burahin ang Gamit sa Imbentaryo"
        message={`Sigurado ka bang nais mong burahin ang ${confirmDelete?.name}? Mabubura rin ang lahat ng kaugnay na kasaysayan ng stock nito.`}
        confirmLabel="Burahin"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
