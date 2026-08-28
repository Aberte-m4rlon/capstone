import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { FilterToolbar, FilterSearch, FilterSelect } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2, History, TrendingDown, TrendingUp, PackageX, Package } from 'lucide-react';
import { inventoryStatus, formatDate } from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import type { InventoryItem, InventoryCategory, InventoryTransaction } from '../types';

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

  const warningDays = farmData.settings?.expiry_warning_days ?? 15;
  const allTx = farmData.inventoryTransactions;

  // ── Add/Edit modal ──────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InventoryItem | null>(null);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [fCategory, setFCategory] = useState('All');
  const [fStatus, setFStatus] = useState('All');
  const [search, setSearch] = useState('');

  // ── Consume modal ───────────────────────────────────────────────────────────
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeItem, setConsumeItem] = useState<InventoryItem | null>(null);
  const [consumeQty, setConsumeQty] = useState('');
  const [consumeReason, setConsumeReason] = useState('');
  const [consumeDate, setConsumeDate] = useState(new Date().toISOString().split('T')[0]);
  const [consumeSaving, setConsumeSaving] = useState(false);

  // ── Stock-in modal ──────────────────────────────────────────────────────────
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockInItem, setStockInItem] = useState<InventoryItem | null>(null);
  const [stockInQty, setStockInQty] = useState('');
  const [stockInCost, setStockInCost] = useState('');
  const [stockInSupplier, setStockInSupplier] = useState('');
  const [stockInDate, setStockInDate] = useState(new Date().toISOString().split('T')[0]);
  const [stockInNotes, setStockInNotes] = useState('');
  const [stockInSaving, setStockInSaving] = useState(false);

  // ── Remove modal ────────────────────────────────────────────────────────────
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeItem, setRemoveItem] = useState<InventoryItem | null>(null);
  const [removeQty, setRemoveQty] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [removeNotes, setRemoveNotes] = useState('');
  const [removeSaving, setRemoveSaving] = useState(false);

  // ── History modal ───────────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return farmData.inventory
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
  }, [farmData.inventory, fCategory, fStatus, search, warningDays]);

  // ── Summary KPIs ────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const inv = farmData.inventory;
    const warningDaysLocal = warningDays;
    const lowStock = inv.filter((i) => inventoryStatus(i, warningDaysLocal).status === 'Low Stock').length;
    const outOfStock = inv.filter((i) => inventoryStatus(i, warningDaysLocal).status === 'Out of Stock').length;
    const expiring = inv.filter((i) => inventoryStatus(i, warningDaysLocal).status === 'Expiring Soon').length;
    const expired = inv.filter((i) => inventoryStatus(i, warningDaysLocal).status === 'Expired').length;
    // Total value = current stock × unit cost
    const totalValue = inv.reduce((s, i) => s + (Number(i.quantity) * (Number(i.cost) || 0)), 0);
    const totalConsumed = allTx.filter((t) => t.type === 'CONSUMPTION').reduce((s, t) => s + t.quantity, 0);

    // Time boundaries
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const consumedToday = allTx.filter(
      (t) => t.type === 'CONSUMPTION' && t.created_at.startsWith(todayStr),
    ).reduce((s, t) => s + t.quantity, 0);

    const consumedWeek = allTx.filter(
      (t) => t.type === 'CONSUMPTION' && new Date(t.created_at) >= weekAgo,
    ).reduce((s, t) => s + t.quantity, 0);

    const consumedMonth = allTx.filter(
      (t) => t.type === 'CONSUMPTION' && new Date(t.created_at) >= monthStart,
    ).reduce((s, t) => s + t.quantity, 0);

    const addedMonth = allTx.filter(
      (t) => (t.type === 'STOCK_IN' || t.type === 'RETURN') && new Date(t.created_at) >= monthStart,
    ).reduce((s, t) => s + t.quantity, 0);

    // ── Money spent = sum of (qty × cost_per_unit) for all STOCK_IN transactions ──
    const spendTx = allTx.filter((t) => t.type === 'STOCK_IN' || t.type === 'RETURN');
    const totalSpent = spendTx.reduce((s, t) => s + (t.quantity * (Number(t.cost_per_unit) || 0)), 0);
    const spentThisMonth = spendTx
      .filter((t) => new Date(t.created_at) >= monthStart)
      .reduce((s, t) => s + (t.quantity * (Number(t.cost_per_unit) || 0)), 0);
    const spentThisWeek = spendTx
      .filter((t) => new Date(t.created_at) >= weekAgo)
      .reduce((s, t) => s + (t.quantity * (Number(t.cost_per_unit) || 0)), 0);
    const spentToday = spendTx
      .filter((t) => t.created_at.startsWith(todayStr))
      .reduce((s, t) => s + (t.quantity * (Number(t.cost_per_unit) || 0)), 0);

    // Fallback: if no transactions have cost_per_unit recorded yet, use inventory cost field
    const totalSpentFallback = totalSpent === 0
      ? inv.reduce((s, i) => s + (Number(i.cost) || 0) * (Number(i.quantity) || 0), 0)
      : totalSpent;

    // ── Consumed monetary value = sum of (qty × cost_per_unit) for CONSUMPTION txs ──
    const consumedTx = allTx.filter((t) => t.type === 'CONSUMPTION');
    const totalConsumedValue = consumedTx.reduce((s, t) => s + (t.quantity * (Number(t.cost_per_unit) || 0)), 0);
    const consumedValueMonth = consumedTx
      .filter((t) => new Date(t.created_at) >= monthStart)
      .reduce((s, t) => s + (t.quantity * (Number(t.cost_per_unit) || 0)), 0);

    // ── Current inventory value = remaining stock × unit cost ──
    const currentInventoryValue = inv.reduce((s, i) => s + (Number(i.quantity) * (Number(i.cost) || 0)), 0);

    // ── Category breakdown ──────────────────────────────────────────────────
    const byCategory: Record<string, number> = {};
    for (const t of spendTx) {
      const item = inv.find((i) => i.id === t.inventory_item_id);
      const cat = item?.category ?? 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + (t.quantity * (Number(t.cost_per_unit) || 0));
    }

    return {
      totalItems: inv.length, lowStock, outOfStock, expiring, expired,
      totalValue: currentInventoryValue,
      totalConsumed, consumedToday, consumedWeek, consumedMonth, addedMonth,
      totalSpent: totalSpentFallback, spentThisMonth, spentThisWeek, spentToday,
      totalConsumedValue, consumedValueMonth, currentInventoryValue, byCategory,
    };
  }, [farmData.inventory, allTx, warningDays]);

  // ── Core transaction helper ─────────────────────────────────────────────────
  /**
   * Records a transaction AND updates inventory.quantity in one logical operation.
   * No race-condition protection beyond the single-user per-farm design, which is
   * sufficient for the current architecture (each farm has one manager).
   */
  const recordTransaction = async (
    item: InventoryItem,
    type: InventoryTransaction['type'],
    qty: number,
    reason: string | null,
    notes: string | null,
    costPerUnit?: number | null,
  ): Promise<{ newStock: number } | null> => {
    const sign = txSign(type);
    const prevStock = Number(item.quantity);
    const newStock = sign === '+' ? prevStock + qty : prevStock - qty;

    if (newStock < 0) {
      toast(
        `Insufficient stock. Available: ${prevStock} ${item.unit}, Requested: ${qty} ${item.unit}.`,
        'error',
      );
      return null;
    }

    // 1. Insert transaction record
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
    });
    if (txErr) throw txErr;

    // 2. Update inventory quantity
    const { error: invErr } = await supabase
      .from('inventory')
      .update({ quantity: newStock })
      .eq('id', item.id);
    if (invErr) throw invErr;

    return { newStock };
  };

  // ── Consume (Usage) ─────────────────────────────────────────────────────────
  const openConsume = (item: InventoryItem) => {
    setConsumeItem(item);
    setConsumeQty('');
    setConsumeReason('');
    setConsumeDate(new Date().toISOString().split('T')[0]);
    setConsumeOpen(true);
  };

  const handleConsumeStock = async () => {
    if (!consumeItem || consumeSaving) return;
    const qty = Number(consumeQty);
    if (!consumeQty || isNaN(qty) || qty <= 0) {
      toast('Please enter a valid quantity.', 'error'); return;
    }
    if (qty > Number(consumeItem.quantity)) {
      toast(`Insufficient stock. Available: ${consumeItem.quantity} ${consumeItem.unit}, Requested: ${qty} ${consumeItem.unit}.`, 'error'); return;
    }
    setConsumeSaving(true);
    try {
      const result = await recordTransaction(consumeItem, 'CONSUMPTION', qty, consumeReason || 'Usage', null);
      if (!result) { setConsumeSaving(false); return; }

      const updatedItem = { ...consumeItem, quantity: result.newStock };
      const nextStatus = inventoryStatus(updatedItem, warningDays);
      if (nextStatus.status !== 'OK') {
        await createNotification(
          user?.id ?? '',
          'Inventory',
          `${consumeItem.name}: ${nextStatus.label}`,
          `Used ${qty} ${consumeItem.unit}. Remaining: ${result.newStock} ${consumeItem.unit}.`,
          nextStatus.status === 'Out of Stock' || nextStatus.status === 'Expired' ? 'Critical' : 'Warning',
          '/inventory',
        );
      }

      toast(`Recorded: −${qty} ${consumeItem.unit} of ${consumeItem.name}. Remaining: ${result.newStock} ${consumeItem.unit}.`, 'success');
      setConsumeOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to record usage.', 'error');
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
      toast('Please enter a valid quantity.', 'error'); return;
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
      if (!result) { setStockInSaving(false); return; }

      // Update supplier/cost if provided
      if (stockInSupplier || stockInCost) {
        await supabase.from('inventory').update({
          ...(stockInSupplier ? { supplier: stockInSupplier } : {}),
          ...(costPerUnit ? { cost: costPerUnit } : {}),
        }).eq('id', stockInItem.id);
      }

      toast(`Added ${qty} ${stockInItem.unit} to ${stockInItem.name}. New stock: ${result.newStock} ${stockInItem.unit}.`, 'success');
      setStockInOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to add stock.', 'error');
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
      toast('Please enter a valid quantity.', 'error'); return;
    }
    if (qty > Number(removeItem.quantity)) {
      toast(`Cannot remove more than available stock (${removeItem.quantity} ${removeItem.unit}).`, 'error'); return;
    }
    if (!removeReason.trim()) {
      toast('Please provide a reason for removal.', 'error'); return;
    }
    setRemoveSaving(true);
    try {
      const result = await recordTransaction(removeItem, 'REMOVAL', qty, removeReason, removeNotes || null);
      if (!result) { setRemoveSaving(false); return; }
      toast(`Removed ${qty} ${removeItem.unit} from ${removeItem.name}. Remaining: ${result.newStock} ${removeItem.unit}.`, 'success');
      setRemoveOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to record removal.', 'error');
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
        ? [...allTx.filter((t) => t.inventory_item_id === historyItem.id)]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [],
    [historyItem, allTx],
  );

  // ── Add/Edit item ───────────────────────────────────────────────────────────
  const openAdd = () => { setEditing(null); setForm(emptyForm); setErrors({}); setModalOpen(true); };
  const openEdit = (i: InventoryItem) => {
    setEditing(i);
    setForm({
      name: i.name, category: i.category, quantity: String(i.quantity), unit: i.unit,
      minimum_stock: String(i.minimum_stock), purchase_date: i.purchase_date ?? '',
      expiry_date: i.expiry_date ?? '', supplier: i.supplier ?? '',
      cost: i.cost ? String(i.cost) : '', notes: i.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (form.quantity === '' || isNaN(Number(form.quantity)) || Number(form.quantity) < 0)
      e.quantity = 'Quantity must be 0 or more.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(), category: form.category,
      quantity: Number(form.quantity), unit: form.unit,
      minimum_stock: form.minimum_stock ? Number(form.minimum_stock) : 0,
      purchase_date: form.purchase_date || null, expiry_date: form.expiry_date || null,
      supplier: form.supplier.trim() || null,
      cost: form.cost ? Number(form.cost) : null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('inventory').update(payload).eq('id', editing.id);
        if (error) throw error;

        // If quantity changed while editing, record an adjustment transaction
        const qtyDiff = Number(form.quantity) - Number(editing.quantity);
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
        toast('Inventory item updated.', 'success');
      } else {
        const { data: inserted, error } = await supabase.from('inventory').insert(payload).select().maybeSingle();
        if (error) throw error;

        // Record initial opening stock as STOCK_IN
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
        toast('Inventory item added.', 'success');
      }

      const statusCheck = inventoryStatus(payload, warningDays);
      if (statusCheck.status === 'Expired') {
        await createNotification(user?.id ?? '', 'Inventory', `${payload.name} has expired`, 'Expired item needs disposal.', 'Critical', '/inventory');
      } else if (statusCheck.status === 'Expiring Soon') {
        await createNotification(user?.id ?? '', 'Inventory', `${payload.name} expires soon`, statusCheck.label, 'Warning', '/inventory');
      } else if (statusCheck.status === 'Low Stock') {
        await createNotification(user?.id ?? '', 'Inventory', `${payload.name} is low on stock`, `Current: ${payload.quantity} ${payload.unit}, Minimum: ${payload.minimum_stock}`, 'Warning', '/inventory');
      }

      setModalOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save item.', 'error');
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
      toast('Inventory item deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch { toast('Unable to delete item.', 'error'); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Inventory Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {farmData.inventory.length} items · Stock movements tracked automatically
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Inventory</button>
      </div>

      {/* KPI Cards — horizontal scroll on mobile, 4-col on desktop */}
      <div style={{ marginBottom: 16, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))',
          gap: 12,
          minWidth: 'max-content',
          width: '100%',
        }} className="inv-kpi-grid">
        {/* Total Items */}
        <div className="kpi-card" style={{ minWidth: 140 }}>
          <div className="kpi-top"><div className="kpi-icon blue"><Icons.Package size={18} /></div></div>
          <div className="kpi-value">{summary.totalItems}</div>
          <div className="kpi-label">Total Items</div>
          <div className="kpi-delta up">₱{summary.currentInventoryValue.toLocaleString('en-PH', { maximumFractionDigits: 0 })} value</div>
        </div>

        {/* Money Spent */}
        <div className="kpi-card" style={{ minWidth: 140 }}>
          <div className="kpi-top"><div className="kpi-icon orange"><Icons.DollarSign size={18} /></div></div>
          <div className="kpi-value" style={{ fontSize: summary.totalSpent >= 100000 ? 16 : undefined }}>
            ₱{summary.totalSpent.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
          </div>
          <div className="kpi-label">Purchased</div>
          <div className="kpi-delta up">Mo: ₱{summary.spentThisMonth.toLocaleString('en-PH', { maximumFractionDigits: 0 })}</div>
        </div>

        {/* Consumed */}
        <div className="kpi-card" style={{ minWidth: 140 }}>
          <div className="kpi-top"><div className="kpi-icon red"><TrendingDown size={18} /></div></div>
          <div className="kpi-value">{summary.consumedMonth.toFixed(1)}</div>
          <div className="kpi-label">Consumed / Mo</div>
          <div className="kpi-delta up">₱{summary.consumedValueMonth.toLocaleString('en-PH', { maximumFractionDigits: 0 })} val</div>
        </div>

        {/* Stock Alerts */}
        <div className="kpi-card" style={{ minWidth: 140 }}>
          <div className="kpi-top"><div className="kpi-icon orange"><Icons.AlertTriangle size={18} /></div></div>
          <div className="kpi-value">{summary.lowStock + summary.outOfStock}</div>
          <div className="kpi-label">Stock Alerts</div>
          <div className="kpi-delta down">{summary.expiring} exp · {summary.expired} exp'd</div>
        </div>
        </div>
      </div>
      {/* responsive CSS — on desktop use full-width auto grid, on mobile horizontal scroll */}
      <style>{`
        @media (min-width: 640px) {
          .inv-kpi-grid { min-width: unset !important; grid-template-columns: repeat(4, minmax(0,1fr)) !important; }
        }
      `}</style>

      {/* Expense Summary Strip */}
      <div className="card section-gap" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icons.DollarSign size={16} color="var(--accent-orange)" /> Inventory Expenses
        </div>

        {/* Main 3-metric row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12, marginBottom: 12 }} className="inv-main-expense">
          {[
            { label: 'Total Purchased', value: summary.totalSpent, color: '#FF7A18' },
            { label: 'Total Consumed', value: summary.totalConsumedValue, color: '#EF4444' },
            { label: 'Current Inventory Value', value: summary.currentInventoryValue, color: '#3B82F6' },
          ].map((e) => (
            <div key={e.label} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>{e.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: e.color }}>
                ₱{e.value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>

        {/* Period breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }} className="inv-expense-grid">
          {[
            { label: 'Today', value: summary.spentToday },
            { label: 'This Week', value: summary.spentThisWeek },
            { label: 'This Month', value: summary.spentThisMonth },
            { label: 'Total', value: summary.totalSpent },
          ].map((e) => (
            <div key={e.label} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{e.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                ₱{e.value.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </div>
          ))}
        </div>

        {/* Category breakdown — only shown if we have data */}
        {Object.keys(summary.byCategory).length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>By Category</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(summary.byCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, val]) => (
                  <div key={cat} style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(255,122,24,0.10)', border: '1px solid rgba(255,122,24,0.25)', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#FF7A18' }}>{cat}</span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>₱{val.toLocaleString('en-PH', { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <style>{`
          @media (max-width: 640px) {
            .inv-main-expense { grid-template-columns: repeat(1, minmax(0,1fr)) !important; }
            .inv-expense-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
          }
        `}</style>
        {summary.totalSpent === 0 && allTx.filter(t => t.type === 'STOCK_IN').length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10 }}>
            [Tip] Add a <strong>Unit Cost (₱)</strong> when adding or restocking inventory items to enable expense tracking.
          </p>
        )}
      </div>

      {/* Filters */}
      <FilterToolbar>
        <FilterSearch placeholder="Search name or supplier..." value={search} onChange={setSearch} />
        <FilterSelect value={fCategory} onChange={setFCategory}
          options={[
            { value: 'All', label: 'All Categories' },
            { value: 'Feed', label: 'Feed' },
            { value: 'Medicine', label: 'Medicine' },
            { value: 'Vaccines', label: 'Vaccines' },
            { value: 'Supplies', label: 'Supplies' },
            { value: 'Equipment', label: 'Equipment' },
            { value: 'Other', label: 'Other' },
          ]}
          ariaLabel="Filter Category"
        />
        <FilterSelect value={fStatus} onChange={setFStatus}
          options={[
            { value: 'All', label: 'All Status' },
            { value: 'OK', label: 'In Stock' },
            { value: 'Low Stock', label: 'Low Stock' },
            { value: 'Out of Stock', label: 'Out of Stock' },
            { value: 'Expiring Soon', label: 'Expiring Soon' },
            { value: 'Expired', label: 'Expired' },
          ]}
          ariaLabel="Filter Status"
        />
      </FilterToolbar>

      {/* Inventory Table */}
      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.Package size={24} /></div>
            <h4>No inventory items</h4>
            <p>Add inventory to track stock and usage.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Current Stock</th>
                  <th>Consumed</th>
                  <th>Min Stock</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Expiry</th>
                  <th>Actions</th>
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
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{i.name}</div>
                        {i.supplier && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{i.supplier}</div>}
                      </td>
                      <td><span className="badge" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11 }}>{i.category}</span></td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 14, color: Number(i.quantity) <= 0 ? '#EF4444' : Number(i.quantity) <= Number(i.minimum_stock) ? '#F59E0B' : 'var(--text)' }}>
                          {Number(i.quantity).toFixed(Number.isInteger(Number(i.quantity)) ? 0 : 1)} {i.unit}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: tots.totalConsumed > 0 ? '#EF4444' : 'var(--text-secondary)' }}>
                        {tots.totalConsumed > 0 ? `${tots.totalConsumed.toFixed(Number.isInteger(tots.totalConsumed) ? 0 : 1)} ${i.unit}` : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{i.minimum_stock} {i.unit}</td>
                      <td>
                        <span className={`badge badge-${s.color === 'green' ? 'green' : s.color === 'orange' ? 'orange' : s.color === 'red' ? 'red' : 'gray'}`}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>
                        {value > 0 ? `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}` : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(i.expiry_date)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => openConsume(i)} title="Record usage" style={{ color: '#EF4444' }}>
                            <TrendingDown size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openStockIn(i)} title="Add stock" style={{ color: '#16A34A' }}>
                            <TrendingUp size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openRemove(i)} title="Remove/spoilage" style={{ color: '#F59E0B' }}>
                            <PackageX size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openHistory(i)} title="View history">
                            <History size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(i)}><Pencil size={14} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(i)} style={{ color: '#EF4444' }}><Trash2 size={14} /></button>
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

      {/* ── Add/Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Inventory Item' : 'Add Inventory Item'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Name <span className="req">*</span></label>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rice Bran" />
            {errors.name && <div className="form-error">{errors.name}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as InventoryCategory })}>
              <option>Feed</option><option>Medicine</option><option>Vaccines</option>
              <option>Supplies</option><option>Equipment</option><option>Other</option>
            </select>
          </div>
        </div>
        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Quantity <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            {errors.quantity && <div className="form-error">{errors.quantity}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Unit</label>
            <input className="form-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg" />
          </div>
          <div className="form-group">
            <label className="form-label">Minimum Stock</label>
            <input className="form-input" type="number" step="0.01" value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Purchase Date</label>
            <input className="form-input" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Expiry Date</label>
            <input className="form-input" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Supplier</label>
            <input className="form-input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Unit Cost (₱)</label>
            <input className="form-input" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="per unit/kg/pcs" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>

      {/* ── Use/Consume Modal ── */}
      <Modal open={consumeOpen} onClose={() => setConsumeOpen(false)} title="Record Inventory Usage"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConsumeOpen(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleConsumeStock} disabled={consumeSaving}>
              <TrendingDown size={14} /> {consumeSaving ? 'Saving...' : 'Record Usage'}
            </button>
          </>
        }
      >
        {consumeItem && (
          <div>
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{consumeItem.name}</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 3 }}>
                Available: <strong style={{ color: Number(consumeItem.quantity) <= Number(consumeItem.minimum_stock) ? '#F59E0B' : '#16A34A' }}>
                  {consumeItem.quantity} {consumeItem.unit}
                </strong>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Quantity Used <span className="req">*</span></label>
                <input className="form-input" type="number" step="0.01" min="0.01" value={consumeQty}
                  onChange={(e) => setConsumeQty(e.target.value)} placeholder={`Max ${consumeItem.quantity}`} />
                {consumeQty && Number(consumeQty) > Number(consumeItem.quantity) && (
                  <div className="form-error">Exceeds available stock ({consumeItem.quantity} {consumeItem.unit})</div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={consumeDate} onChange={(e) => setConsumeDate(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Reason / Usage Description</label>
              <textarea className="form-textarea" value={consumeReason}
                onChange={(e) => setConsumeReason(e.target.value)}
                placeholder="Daily feeding, medicine administration, etc." />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Stock-In Modal ── */}
      <Modal open={stockInOpen} onClose={() => setStockInOpen(false)} title="Add Stock"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setStockInOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleStockIn} disabled={stockInSaving}>
              <TrendingUp size={14} /> {stockInSaving ? 'Saving...' : 'Add Stock'}
            </button>
          </>
        }
      >
        {stockInItem && (
          <div>
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{stockInItem.name}</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 3 }}>
                Current stock: <strong>{stockInItem.quantity} {stockInItem.unit}</strong>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Quantity Added <span className="req">*</span></label>
                <input className="form-input" type="number" step="0.01" min="0.01" value={stockInQty}
                  onChange={(e) => setStockInQty(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Total Purchase Cost (₱)</label>
                <input className="form-input" type="number" step="0.01" value={stockInCost}
                  onChange={(e) => setStockInCost(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <input className="form-input" value={stockInSupplier} onChange={(e) => setStockInSupplier(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Date Received</label>
                <input className="form-input" type="date" value={stockInDate} onChange={(e) => setStockInDate(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" value={stockInNotes} onChange={(e) => setStockInNotes(e.target.value)} placeholder="Receipt number, batch, etc." />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Remove Modal ── */}
      <Modal open={removeOpen} onClose={() => setRemoveOpen(false)} title="Remove Stock"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRemoveOpen(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleRemove} disabled={removeSaving}>
              <PackageX size={14} /> {removeSaving ? 'Saving...' : 'Confirm Removal'}
            </button>
          </>
        }
      >
        {removeItem && (
          <div>
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{removeItem.name}</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 3 }}>
                Available: <strong>{removeItem.quantity} {removeItem.unit}</strong>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity to Remove <span className="req">*</span></label>
              <input className="form-input" type="number" step="0.01" min="0.01" value={removeQty}
                onChange={(e) => setRemoveQty(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Reason <span className="req">*</span></label>
              <select className="form-select" value={removeReason} onChange={(e) => setRemoveReason(e.target.value)}>
                <option value="">Select reason...</option>
                <option value="Spoiled">Spoiled</option>
                <option value="Expired">Expired</option>
                <option value="Damaged">Damaged</option>
                <option value="Lost">Lost</option>
                <option value="Incorrect stock count">Incorrect stock count</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" value={removeNotes} onChange={(e) => setRemoveNotes(e.target.value)} placeholder="Additional details..." />
            </div>
          </div>
        )}
      </Modal>

      {/* ── History Modal ── */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} size="xl"
        title={historyItem ? `Stock History — ${historyItem.name}` : 'Stock History'}
        footer={<button className="btn btn-secondary" onClick={() => setHistoryOpen(false)}>Close</button>}
      >
        {historyItem && (
          <div>
            {/* Item summary */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {(() => {
                const tots = itemTotals(historyItem.id, allTx);
                return [
                  { label: 'Current Stock', value: `${historyItem.quantity} ${historyItem.unit}`, color: '#FF7A18' },
                  { label: 'Total Added', value: `+${tots.totalAdded} ${historyItem.unit}`, color: '#16A34A' },
                  { label: 'Total Consumed', value: `−${tots.totalConsumed} ${historyItem.unit}`, color: '#EF4444' },
                  { label: 'Total Removed', value: `−${tots.totalRemoved} ${historyItem.unit}`, color: '#F59E0B' },
                ].map((s) => (
                  <div key={s.label} style={{ flex: '1 1 100px', padding: '10px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ));
              })()}
            </div>

            {/* Transaction list */}
            {historyTx.length === 0 ? (
              <div className="empty-state" style={{ minHeight: 120 }}>
                <h4>No transaction history</h4>
                <p>Stock movements will appear here after recording usage, additions, or removals.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Date</th><th>Type</th><th>Qty</th><th>Before</th><th>After</th><th>Reason</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    {historyTx.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(t.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                            background: txSign(t.type) === '+' ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.10)',
                            color: txColor(t.type),
                          }}>
                            {txLabel(t.type)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: txColor(t.type) }}>
                          {txSign(t.type)}{t.quantity} {t.unit}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.previous_stock} {t.unit}</td>
                        <td style={{ fontSize: 12, fontWeight: 600 }}>{t.new_stock} {t.unit}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 160 }}>{t.reason ?? '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 160 }}>{t.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Inventory Item"
        message={`Are you sure you want to delete ${confirmDelete?.name}? All related stock history will also be deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
