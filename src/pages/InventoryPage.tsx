import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { FilterToolbar, FilterSearch, FilterSelect } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { inventoryStatus, formatDate } from '../lib/analytics';
import { createNotification } from '../lib/recommendations';
import type { InventoryItem, InventoryCategory } from '../types';

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

export function InventoryPage() {
  const farmData = useFarmData();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InventoryItem | null>(null);
  const [fCategory, setFCategory] = useState('All');
  const [fStatus, setFStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeItem, setConsumeItem] = useState<InventoryItem | null>(null);
  const [consumeQty, setConsumeQty] = useState('');
  const [consumeReason, setConsumeReason] = useState('');
  const [consumeDate, setConsumeDate] = useState(new Date().toISOString().split('T')[0]);

  const warningDays = farmData.settings?.expiry_warning_days ?? 15;

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

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openConsume = (item: InventoryItem) => {
    setConsumeItem(item);
    setConsumeQty('');
    setConsumeReason('');
    setConsumeDate(new Date().toISOString().split('T')[0]);
    setConsumeOpen(true);
  };

  const handleConsumeStock = async () => {
    if (!consumeItem) return;
    const used = Number(consumeQty);
    if (!consumeQty || Number.isNaN(used) || used <= 0) {
      toast('Please enter a valid quantity to consume.', 'error');
      return;
    }
    if (used > Number(consumeItem.quantity)) {
      toast('Consumption quantity cannot be greater than current stock.', 'error');
      return;
    }

    const nextQty = Number(consumeItem.quantity) - used;
    const notes = consumeItem.notes ? `${consumeItem.notes}\n` : '';
    const usageNote = `Used ${used} ${consumeItem.unit} on ${consumeDate}${consumeReason ? ` — ${consumeReason}` : ''}`;

    try {
      const { error } = await supabase
        .from('inventory')
        .update({
          quantity: nextQty,
          notes: `${notes}${usageNote}`.trim(),
        })
        .eq('id', consumeItem.id);

      if (error) throw error;

      const nextStatus = inventoryStatus({ ...consumeItem, quantity: nextQty }, warningDays);
      if (nextStatus.status === 'Low Stock' || nextStatus.status === 'Out of Stock' || nextStatus.status === 'Expiring Soon' || nextStatus.status === 'Expired') {
        await createNotification(
          farmData.animals[0]?.user_id ?? '',
          'Inventory',
          `${consumeItem.name} stock reduced`,
          `Used ${used} ${consumeItem.unit}. Remaining: ${nextQty} ${consumeItem.unit}. ${nextStatus.label}`,
          nextStatus.status === 'Expired' ? 'Critical' : 'Warning',
          '/inventory',
        );
      }

      toast(`Stock updated. Remaining quantity: ${nextQty} ${consumeItem.unit}.`, 'success');
      setConsumeOpen(false);
      setConsumeItem(null);
      setConsumeQty('');
      setConsumeReason('');
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to update stock.', 'error');
    }
  };

  const openEdit = (i: InventoryItem) => {
    setEditing(i);
    setForm({
      name: i.name, category: i.category, quantity: String(i.quantity), unit: i.unit,
      minimum_stock: String(i.minimum_stock), purchase_date: i.purchase_date ?? '',
      expiry_date: i.expiry_date ?? '', supplier: i.supplier ?? '', cost: i.cost ? String(i.cost) : '',
      notes: i.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (form.quantity === '' || isNaN(Number(form.quantity)) || Number(form.quantity) < 0) e.quantity = 'Quantity must be 0 or more.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(), category: form.category, quantity: Number(form.quantity), unit: form.unit,
      minimum_stock: form.minimum_stock ? Number(form.minimum_stock) : 0,
      purchase_date: form.purchase_date || null, expiry_date: form.expiry_date || null,
      supplier: form.supplier.trim() || null, cost: form.cost ? Number(form.cost) : null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('inventory').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast('Inventory item updated.', 'success');
      } else {
        const { error } = await supabase.from('inventory').insert(payload);
        if (error) throw error;
        toast('Inventory item added.', 'success');
      }

      // Create notifications for expired/expiring/low stock
      const status = inventoryStatus(payload, warningDays);
      if (status.status === 'Expired') {
        await createNotification(farmData.animals[0]?.user_id ?? '', 'Inventory', `${payload.name} has expired`, `Expired item needs disposal.`, 'Critical', '/inventory');
      } else if (status.status === 'Expiring Soon') {
        await createNotification(farmData.animals[0]?.user_id ?? '', 'Inventory', `${payload.name} expires soon`, status.label, 'Warning', '/inventory');
      } else if (status.status === 'Low Stock') {
        await createNotification(farmData.animals[0]?.user_id ?? '', 'Inventory', `${payload.name} is below minimum stock`, `Current: ${payload.quantity} ${payload.unit}, minimum: ${payload.minimum_stock}`, 'Warning', '/inventory');
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
      const { error } = await supabase.from('inventory').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Inventory item deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Unable to delete item.', 'error');
    }
  };

  // Summary
  const summary = useMemo(() => {
    const lowStock = farmData.inventory.filter((i) => inventoryStatus(i, warningDays).status === 'Low Stock').length;
    const outOfStock = farmData.inventory.filter((i) => inventoryStatus(i, warningDays).status === 'Out of Stock').length;
    const expiring = farmData.inventory.filter((i) => inventoryStatus(i, warningDays).status === 'Expiring Soon').length;
    const expired = farmData.inventory.filter((i) => inventoryStatus(i, warningDays).status === 'Expired').length;
    return { lowStock, outOfStock, expiring, expired };
  }, [farmData.inventory, warningDays]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Inventory Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {filtered.length} items · Expiry and stock alerts auto-generated
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Inventory</button>
      </div>

      {/* Summary cards */}
      <div className="kpi-grid section-gap">
        <div className="kpi-card"><div className="kpi-top"><div className="kpi-icon orange"><Icons.Package size={20} /></div></div><div className="kpi-value">{summary.lowStock}</div><div className="kpi-label">Low Stock</div></div>
        <div className="kpi-card"><div className="kpi-top"><div className="kpi-icon red"><Icons.PackageX size={20} /></div></div><div className="kpi-value">{summary.outOfStock}</div><div className="kpi-label">Out of Stock</div></div>
        <div className="kpi-card"><div className="kpi-top"><div className="kpi-icon orange"><Icons.Clock size={20} /></div></div><div className="kpi-value">{summary.expiring}</div><div className="kpi-label">Expiring Soon</div></div>
        <div className="kpi-card"><div className="kpi-top"><div className="kpi-icon red"><Icons.AlertTriangle size={20} /></div></div><div className="kpi-value">{summary.expired}</div><div className="kpi-label">Expired</div></div>
      </div>

      <FilterToolbar>
        <FilterSearch
          placeholder="Search name or supplier..."
          value={search}
          onChange={setSearch}
        />
        <FilterSelect
          value={fCategory}
          onChange={setFCategory}
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
        <FilterSelect
          value={fStatus}
          onChange={setFStatus}
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

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state"><div className="es-icon"><Icons.Package size={24} /></div><h4>No inventory items</h4><p>Add inventory to track stock and expiry.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Category</th><th>Quantity</th><th>Min Stock</th><th>Expiry</th><th>Status</th><th>Supplier</th><th>Cost</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((i) => {
                  const s = inventoryStatus(i, warningDays);
                  return (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 600 }}>{i.name}</td>
                      <td>{i.category}</td>
                      <td>{i.quantity} {i.unit}</td>
                      <td>{i.minimum_stock} {i.unit}</td>
                      <td>{formatDate(i.expiry_date)}</td>
                      <td><span className={`badge badge-${s.color === 'green' ? 'green' : s.color === 'orange' ? 'orange' : s.color === 'red' ? 'red' : 'gray'}`}>{s.label}</span></td>
                      <td>{i.supplier ?? '—'}</td>
                      <td>{i.cost ? `₱${i.cost}` : '—'}</td>
                      <td><div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openConsume(i)} title="Use stock">Use</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(i)}><Pencil size={15} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(i)}><Trash2 size={15} /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Inventory Item' : 'Add Inventory Item'}
        footer={<><button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
      >
        <div className="form-row">
          <div className="form-group"><label className="form-label">Name <span className="req">*</span></label>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rice Bran" />
            {errors.name && <div className="form-error">{errors.name}</div>}</div>
          <div className="form-group"><label className="form-label">Category</label>
            <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as InventoryCategory })}>
              <option>Feed</option><option>Medicine</option><option>Vaccines</option><option>Supplies</option><option>Equipment</option><option>Other</option>
            </select></div>
        </div>
        <div className="form-row-3">
          <div className="form-group"><label className="form-label">Quantity <span className="req">*</span></label>
            <input className="form-input" type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            {errors.quantity && <div className="form-error">{errors.quantity}</div>}</div>
          <div className="form-group"><label className="form-label">Unit</label>
            <input className="form-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg" /></div>
          <div className="form-group"><label className="form-label">Minimum Stock</label>
            <input className="form-input" type="number" step="0.01" value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Purchase Date</label>
            <input className="form-input" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Expiry Date</label>
            <input className="form-input" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Supplier</label>
            <input className="form-input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Cost (₱)</label>
            <input className="form-input" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
        </div>
        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Modal>

      <Modal open={consumeOpen} onClose={() => setConsumeOpen(false)} title="Use Inventory Stock"
        footer={<><button className="btn btn-secondary" onClick={() => setConsumeOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleConsumeStock}>Confirm Usage</button></>}
      >
        {consumeItem && (
          <div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Item</label>
              <input className="form-input" value={`${consumeItem.name} (${consumeItem.quantity} ${consumeItem.unit} available)`} readOnly />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Quantity used</label>
                <input className="form-input" type="number" step="0.01" min="0.01" value={consumeQty} onChange={(e) => setConsumeQty(e.target.value)} placeholder="e.g. 5" />
              </div>
              <div className="form-group">
                <label className="form-label">Date used</label>
                <input className="form-input" type="date" value={consumeDate} onChange={(e) => setConsumeDate(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Reason / Usage</label>
              <textarea className="form-textarea" value={consumeReason} onChange={(e) => setConsumeReason(e.target.value)} placeholder="Example: Feeding for 3 goats, medicine administration, cleaning supply use" />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Delete Inventory Item" message={`Are you sure you want to delete ${confirmDelete?.name}?`} confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
