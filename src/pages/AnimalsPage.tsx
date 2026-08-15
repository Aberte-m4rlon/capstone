import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Modal, ConfirmDialog } from '../components/Modal';
import { ComboBox } from '../components/ComboBox';
import { FilterToolbar, FilterSearch, FilterSelect, FilterToggle } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2, Eye, Archive, RotateCcw, QrCode } from 'lucide-react';
import { formatDate, ageLabel } from '../lib/analytics';
import { getBreedsForSpecies, COLOR_MARKINGS } from '../lib/farmDefaults';
import QRCode from 'qrcode';
import type { Animal, HealthStatus, Species, Sex } from '../types';

const emptyForm = {
  tag_id: '',
  name: '',
  species: 'Goat' as Species,
  breed: '',
  sex: 'Female' as Sex,
  date_of_birth: '',
  color_markings: '',
  weight_kg: '',
  notes: '',
};

// Use the current app origin in dev/local environment so QR scans open the local app.
const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'https://capstone-delta-jet.vercel.app';

export function AnimalsPage() {
  const farmData = useFarmData();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Animal | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Animal | null>(null);
  const [qrAnimal, setQrAnimal] = useState<Animal | null>(null);

  // Filters
  const [fSpecies, setFSpecies] = useState('All');
  const [fSex, setFSex] = useState('All');
  const [fHealth, setFHealth] = useState('All');
  const [fArchived, setFArchived] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return farmData.animals
      .filter((a) => fArchived ? a.archived : !a.archived)
      .filter((a) => fSpecies === 'All' || a.species === fSpecies)
      .filter((a) => fSex === 'All' || a.sex === fSex)
      .filter((a) => fHealth === 'All' || a.health_status === fHealth)
      .filter(
        (a) =>
          !search ||
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.tag_id.toLowerCase().includes(search.toLowerCase()) ||
          (a.breed ?? '').toLowerCase().includes(search.toLowerCase()),
      );
  }, [farmData.animals, fSpecies, fSex, fHealth, fArchived, search]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (a: Animal) => {
    setEditing(a);
    setForm({
      tag_id: a.tag_id,
      name: a.name,
      species: a.species,
      breed: a.breed ?? '',
      sex: a.sex,
      date_of_birth: a.date_of_birth ?? '',
      color_markings: a.color_markings ?? '',
      weight_kg: a.weight_kg ? String(a.weight_kg) : '',
      notes: a.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.tag_id.trim()) e.tag_id = 'Animal ID is required.';
    if (!form.name.trim()) e.name = 'Name is required.';
    if (!form.species) e.species = 'Species is required.';
    if (!form.sex) e.sex = 'Sex is required.';
    if (form.weight_kg && (isNaN(Number(form.weight_kg)) || Number(form.weight_kg) < 0))
      e.weight_kg = 'Weight must be a positive number.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !user) return;
    setSaving(true);

    const payload = {
      tag_id: form.tag_id.trim(),
      name: form.name.trim(),
      species: form.species,
      breed: form.breed.trim() || null,
      sex: form.sex,
      date_of_birth: form.date_of_birth || null,
      color_markings: form.color_markings.trim() || null,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('animals').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast('Animal successfully updated.', 'success');
      } else {
        const { error } = await supabase.from('animals').insert(payload);
        if (error) throw error;
        toast('Animal successfully added.', 'success');
      }
      setModalOpen(false);
      farmData.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save. Please try again.';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (a: Animal) => {
    try {
      const { error } = await supabase.from('animals').update({ archived: !a.archived }).eq('id', a.id);
      if (error) throw error;
      toast(a.archived ? 'Animal restored successfully.' : 'Animal archived successfully.', 'success');
      farmData.refresh();
    } catch {
      toast('Unable to update animal. Please try again.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error } = await supabase.from('animals').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Animal successfully deleted.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Unable to delete animal. Please try again.', 'error');
    }
  };

  const generateQR = async (a: Animal) => {
    setQrAnimal(a);
  };

  const downloadQR = async () => {
    if (!qrAnimal) return;
    const url = `${APP_URL}/public/${qrAnimal.id}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `qr-${qrAnimal.tag_id}.png`;
      link.click();
      toast('QR code downloaded.', 'success');
    } catch {
      toast('Unable to generate QR code.', 'error');
    }
  };

  const printQR = () => {
    if (!qrAnimal) return;
    const url = `${APP_URL}/public/${qrAnimal.id}`;
    const win = window.open('', '_blank');
    if (!win) return;
    QRCode.toDataURL(url, { width: 300, margin: 2 }).then((dataUrl) => {
      win.document.write(`
        <html><head><title>QR Code - ${qrAnimal.name}</title></head>
        <body style="text-align:center;padding:40px;font-family:sans-serif">
          <h2>${qrAnimal.name} (${qrAnimal.tag_id})</h2>
          <img src="${dataUrl}" />
          <p>Scan to view animal profile</p>
        </body></html>
      `);
      win.document.close();
      win.print();
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Animals</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {filtered.length} {filtered.length === 1 ? 'animal' : 'animals'} {fArchived ? 'archived' : 'active'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Animal
        </button>
      </div>

      {/* Reusable One-Row Liquid Glass Filter Toolbar */}
      <FilterToolbar>
        <FilterSearch
          value={search}
          onChange={setSearch}
          placeholder="Search name or ID..."
        />
        <FilterSelect
          value={fSpecies}
          onChange={setFSpecies}
          options={[
            { value: 'All', label: 'All Species' },
            { value: 'Goat', label: 'Goat' },
            { value: 'Sheep', label: 'Sheep' },
          ]}
          ariaLabel="Filter Species"
        />
        <FilterSelect
          value={fSex}
          onChange={setFSex}
          options={[
            { value: 'All', label: 'All Sex' },
            { value: 'Male', label: 'Male' },
            { value: 'Female', label: 'Female' },
          ]}
          ariaLabel="Filter Sex"
        />
        <FilterSelect
          value={fHealth}
          onChange={setFHealth}
          options={[
            { value: 'All', label: 'All Health' },
            { value: 'Healthy', label: 'Healthy' },
            { value: 'Monitor', label: 'Monitor' },
            { value: 'At Risk', label: 'At Risk' },
            { value: 'Critical', label: 'Critical' },
          ]}
          ariaLabel="Filter Health"
        />
        <FilterToggle
          active={fArchived}
          onToggle={setFArchived}
          label="Show Archived"
          activeLabel="Showing Archived"
        />
      </FilterToolbar>

      {/* Table */}
      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.PawPrint size={24} /></div>
            <h4>{fArchived ? 'No archived animals' : 'No animals yet'}</h4>
            <p>{fArchived ? 'Archived animals will appear here.' : 'Add your first animal to get started.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tag ID</th>
                  <th>Species</th>
                  <th>Breed</th>
                  <th>Sex</th>
                  <th>Age</th>
                  <th>Weight</th>
                  <th>Health</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate(`/animals/${a.id}`)}>
                      {a.name}
                    </td>
                    <td>{a.tag_id}</td>
                    <td>{a.species}</td>
                    <td>{a.breed ?? '—'}</td>
                    <td>{a.sex}</td>
                    <td>{ageLabel(a.date_of_birth)}</td>
                    <td>{a.weight_kg ? `${a.weight_kg} kg` : '—'}</td>
                    <td>
                      <span className={`badge badge-${a.health_status === 'Healthy' ? 'green' : a.health_status === 'Monitor' ? 'blue' : a.health_status === 'At Risk' ? 'orange' : 'red'}`}>
                        {a.health_status}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" title="View" onClick={() => navigate(`/animals/${a.id}`)}>
                          <Eye size={15} />
                        </button>
                        <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => openEdit(a)}>
                          <Pencil size={15} />
                        </button>
                        <button className="btn btn-ghost btn-sm" title="QR Code" onClick={() => generateQR(a)}>
                          <QrCode size={15} />
                        </button>
                        <button className="btn btn-ghost btn-sm" title={a.archived ? 'Restore' : 'Archive'} onClick={() => handleArchive(a)}>
                          {a.archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                        </button>
                        <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => setConfirmDelete(a)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Animal' : 'Add Animal'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Animal'}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Animal ID (Tag) <span className="req">*</span></label>
            <input
              className="form-input"
              value={form.tag_id}
              onChange={(e) => setForm({ ...form, tag_id: e.target.value })}
              placeholder="GOAT-001"
            />
            {errors.tag_id && <div className="form-error">{errors.tag_id}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Name <span className="req">*</span></label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Bella"
            />
            {errors.name && <div className="form-error">{errors.name}</div>}
          </div>
        </div>
        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Species <span className="req">*</span></label>
            <select
              className="form-select"
              value={form.species}
              onChange={(e) => setForm({ ...form, species: e.target.value as Species })}
            >
              <option value="Goat">Goat</option>
              <option value="Sheep">Sheep</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Sex <span className="req">*</span></label>
            <select
              className="form-select"
              value={form.sex}
              onChange={(e) => setForm({ ...form, sex: e.target.value as Sex })}
            >
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Breed</label>
            <ComboBox
              value={form.breed}
              onChange={(v) => setForm({ ...form, breed: v })}
              options={getBreedsForSpecies(form.species)}
              placeholder="Search or type breed..."
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input
              className="form-input"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Weight (kg)</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              value={form.weight_kg}
              onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
              placeholder="35.5"
            />
            {errors.weight_kg && <div className="form-error">{errors.weight_kg}</div>}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Color / Markings</label>
          <ComboBox
            value={form.color_markings}
            onChange={(v) => setForm({ ...form, color_markings: v })}
            options={COLOR_MARKINGS}
            placeholder="Search or type color/markings..."
          />
        </div>
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Additional notes..."
          />
        </div>
      </Modal>

      {/* QR Modal */}
      <Modal
        open={!!qrAnimal}
        onClose={() => setQrAnimal(null)}
        title={`QR Code — ${qrAnimal?.name ?? ''}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setQrAnimal(null)}>Close</button>
            <button className="btn btn-secondary" onClick={downloadQR}>
              <Icons.Download size={15} /> Download
            </button>
            <button className="btn btn-primary" onClick={printQR}>
              <Icons.Printer size={15} /> Print
            </button>
          </>
        }
      >
        <div className="qr-display">
          <QRCodeCanvas value={`${APP_URL}/public/${qrAnimal?.id}`} size={240} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 700, fontSize: 16 }}>{qrAnimal?.name}</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{qrAnimal?.tag_id}</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>
              Scan with any QR reader or Google Lens to view public profile
            </p>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Animal"
        message={`Are you sure you want to delete ${confirmDelete?.name}? This will also delete all related health, weight, breeding, and vaccination records. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function QRCodeCanvas({ value, size }: { value: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      QRCode.toCanvas(ref.current, value, { width: size, margin: 2 });
    }
  }, [value, size]);
  return <canvas ref={ref} />;
}
