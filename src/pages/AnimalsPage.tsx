import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { useFarmData } from '../lib/useFarmData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select, FormField } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { AnimalHealthBadge } from '../components/domain/animals/AnimalHealthBadge';
import { ComboBox } from '../components/ComboBox';
import { FilterToolbar, FilterSearch, FilterSelect, FilterToggle } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2, Eye, Archive, RotateCcw, QrCode, Download, Printer, CheckCircle2, Sparkles, Tag } from 'lucide-react';
import { ageLabel } from '../lib/analytics';
import { getBreedsForSpecies, COLOR_MARKINGS } from '../lib/farmDefaults';
import { generateNextAnimalId, fetchNextUniqueAnimalId, insertAnimalWithUniqueRetry } from '../lib/animalId';
import QRCode from 'qrcode';
import type { Animal, Species, Sex } from '../types';

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

const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'https://capstone-delta-jet.vercel.app';

export function AnimalsPage() {
  const farmData = useFarmData();
  const { user } = useAuth();
  const { toast } = useToast();
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
      .filter((a) => (fArchived ? a.archived : !a.archived))
      .filter((a) => fSpecies === 'All' || a.species === fSpecies)
      .filter((a) => fSex === 'All' || a.sex === fSex)
      .filter((a) => fHealth === 'All' || a.health_status === fHealth)
      .filter(
        (a) =>
          !search ||
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.tag_id.toLowerCase().includes(search.toLowerCase()) ||
          (a.breed ?? '').toLowerCase().includes(search.toLowerCase())
      );
  }, [farmData.animals, fSpecies, fSex, fHealth, fArchived, search]);

  const openAdd = () => {
    const nextId = generateNextAnimalId('Goat', farmData.animals);
    setEditing(null);
    setForm({
      ...emptyForm,
      species: 'Goat',
      tag_id: nextId,
    });
    setErrors({});
    setModalOpen(true);

    // Verify against database for newest sequential index
    fetchNextUniqueAnimalId('Goat', user?.id).then((freshId) => {
      setForm((prev) => (prev.species === 'Goat' ? { ...prev, tag_id: freshId } : prev));
    }).catch(() => {});
  };

  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'add') {
      openAdd();
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);


  const handleSpeciesChange = (newSpecies: Species) => {
    if (!editing) {
      const nextId = generateNextAnimalId(newSpecies, farmData.animals);
      setForm((prev) => ({
        ...prev,
        species: newSpecies,
        tag_id: nextId,
      }));
      fetchNextUniqueAnimalId(newSpecies, user?.id).then((freshId) => {
        setForm((prev) => (prev.species === newSpecies ? { ...prev, tag_id: freshId } : prev));
      }).catch(() => {});
    } else {
      setForm((prev) => ({ ...prev, species: newSpecies }));
    }
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
    if (!form.tag_id.trim()) e.tag_id = 'Kailangan ang Animal ID.';
    if (!form.name.trim()) e.name = 'Kailangan ang pangalan ng hayop.';
    if (!form.species) e.species = 'Kailangan piliin ang species.';
    if (!form.sex) e.sex = 'Kailangan piliin ang kasarian.';
    if (form.weight_kg && (isNaN(Number(form.weight_kg)) || Number(form.weight_kg) < 0))
      e.weight_kg = 'Dapat positibong numero ang timbang.';
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
        toast('Matagumpay na na-save ang record.', 'success');
      } else {
        const result = await insertAnimalWithUniqueRetry(
          {
            ...payload,
            user_id: user.id,
          },
          {
            onAutoIncrement: (newId) => {
              setForm((prev) => ({ ...prev, tag_id: newId }));
            },
          }
        );

        if (result.error) throw result.error;
        if (result.hadConflict) {
          toast(`Naresolba ang ID conflict. Matagumpay na na-save bilang ${result.finalTagId}.`, 'success');
        } else {
          toast(`Matagumpay na naidagdag ang hayop (${result.finalTagId}).`, 'success');
        }
      }
      setModalOpen(false);
      farmData.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hindi mai-save ang record. Pakisubukan muli.';
      toast(msg, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (a: Animal) => {
    try {
      const { error } = await supabase.from('animals').update({ archived: !a.archived }).eq('id', a.id);
      if (error) throw error;
      toast(a.archived ? 'Naibalik ang hayop sa aktibo.' : 'Nai-archive ang hayop.', 'success');
      farmData.refresh();
    } catch {
      toast('Hindi mai-update ang hayop. Pakisubukan muli.', 'danger');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error } = await supabase.from('animals').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast('Matagumpay na na-delete ang record.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Hindi mai-delete ang hayop. Pakisubukan muli.', 'danger');
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
      toast('Unable to generate QR code.', 'danger');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 800,
              color: 'var(--color-text-primary, #0F172A)',
              letterSpacing: '-0.02em',
            }}
          >
            Mga Hayop
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary, #475569)', fontSize: '14px' }}>
            {filtered.length} {filtered.length === 1 ? 'hayop' : 'mga hayop'} {fArchived ? 'na naka-archive' : 'na kasalukuyan sa bukid'}
          </p>
        </div>
        <Button variant="primary" onClick={openAdd} leftIcon={<Plus size={16} />}>
          Magdagdag ng Hayop
        </Button>
      </div>

      {/* Filter Toolbar */}
      <FilterToolbar>
        <FilterSearch value={search} onChange={setSearch} placeholder="Maghanap ng animal, ID, breed, o item..." />
        <FilterSelect
          value={fSpecies}
          onChange={setFSpecies}
          options={[
            { value: 'All', label: 'Lahat ng Uri' },
            { value: 'Goat', label: 'Goat / Kambing' },
            { value: 'Sheep', label: 'Sheep / Tupa' },
          ]}
          ariaLabel="Salain ang Uri"
        />
        <FilterSelect
          value={fSex}
          onChange={setFSex}
          options={[
            { value: 'All', label: 'Lahat ng Kasarian' },
            { value: 'Male', label: 'Male / Lalaki' },
            { value: 'Female', label: 'Female / Babae' },
          ]}
          ariaLabel="Salain ang Kasarian"
        />
        <FilterSelect
          value={fHealth}
          onChange={setFHealth}
          options={[
            { value: 'All', label: 'Lahat ng Kalusugan' },
            { value: 'Healthy', label: 'Maayos / Healthy' },
            { value: 'Monitor', label: 'Bantayan / Under Observation' },
            { value: 'At Risk', label: 'Nangangailangan ng Atensyon' },
            { value: 'Critical', label: 'Mataas ang Risk' },
          ]}
          ariaLabel="Salain ang Kalusugan"
        />
        <FilterToggle
          active={fArchived}
          onToggle={setFArchived}
          label="Ipakita ang Naka-archive"
          activeLabel="Naka-archive ang Ipinapakita"
        />
      </FilterToolbar>

      {/* Table Card */}
      <Card variant="default" padding="none">
        <CardContent>
          {filtered.length === 0 ? (
            <div style={{ padding: 32 }}>
              <EmptyState
                icon={<Icons.PawPrint size={36} />}
                title={fArchived ? 'Walang naka-archive na hayop' : 'Wala pang animal records.'}
                description={fArchived ? 'Dito lalabas ang mga naka-archive na rekord ng hayop.' : 'Magdagdag ng unang hayop para masimulan ang pag-monitor sa bukid.'}
                actionLabel={fArchived ? undefined : 'Magdagdag ng Hayop'}
                onAction={fArchived ? undefined : openAdd}
              />
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pangalan</th>
                    <th>Animal ID</th>
                    <th>Species</th>
                    <th>Breed</th>
                    <th>Sex</th>
                    <th>Edad</th>
                    <th>Weight</th>
                    <th>Health Status</th>
                    <th style={{ textAlign: 'right' }}>Aksyon</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id}>
                      <td
                        style={{
                          fontWeight: 700,
                          color: 'var(--color-text-primary, #0F172A)',
                          cursor: 'pointer',
                        }}
                        onClick={() => navigate(`/animals/${a.id}`)}
                      >
                        {a.name}
                      </td>
                      <td style={{ color: 'var(--color-primary, #FF6A2A)', fontWeight: 600 }}>{a.tag_id}</td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>{a.species === 'Goat' ? 'Kambing' : 'Tupa'}</td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>{a.breed ?? '—'}</td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>{a.sex === 'Female' ? 'Babae' : 'Lalaki'}</td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>{ageLabel(a.date_of_birth)}</td>
                      <td style={{ color: 'var(--color-text-secondary, #475569)' }}>
                        {a.weight_kg ? `${a.weight_kg} kg` : '—'}
                      </td>
                      <td>
                        <AnimalHealthBadge status={a.health_status} size="sm" />
                      </td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="View Profile"
                            onClick={() => navigate(`/animals/${a.id}`)}
                          >
                            <Eye size={15} />
                          </Button>
                          <Button variant="ghost" size="sm" title="I-edit" onClick={() => openEdit(a)}>
                            <Pencil size={15} />
                          </Button>
                          <Button variant="ghost" size="sm" title="QR Code" onClick={() => generateQR(a)}>
                            <QrCode size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title={a.archived ? 'Ibalik' : 'I-archive'}
                            onClick={() => handleArchive(a)}
                          >
                            {a.archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="I-delete"
                            onClick={() => setConfirmDelete(a)}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="md"
        role="dialog"
      >
        <ModalHeader
          title={editing ? 'I-edit ang Hayop' : 'Magdagdag ng Hayop'}
          onClose={() => setModalOpen(false)}
        />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                  Animal ID (Tag)
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
                      {form.tag_id || (editing ? '—' : 'Bumubuo ng ID...')}
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
                    {editing ? 'Rehistradong ID' : 'Auto-generated ID'}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748B)', marginTop: -2 }}>
                  Ang Animal ID ay awtomatikong binubuo ng system at hindi maaaring baguhin nang manu-mano.
                </span>
              </div>
              <FormField label="Pangalan" required error={errors.name}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="hal. Bella, Thor, Luna"
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <FormField label="Species" required>
                <Select
                  value={form.species}
                  onChange={(e) => handleSpeciesChange(e.target.value as Species)}
                  options={[
                    { value: 'Goat', label: 'Goat / Kambing' },
                    { value: 'Sheep', label: 'Sheep / Tupa' },
                  ]}
                />
              </FormField>
              <FormField label="Sex" required>
                <Select
                  value={form.sex}
                  onChange={(e) => setForm({ ...form, sex: e.target.value as Sex })}
                  options={[
                    { value: 'Female', label: 'Female / Babae' },
                    { value: 'Male', label: 'Male / Lalaki' },
                  ]}
                />
              </FormField>
              <FormField label="Breed">
                <ComboBox
                  value={form.breed}
                  onChange={(v) => setForm({ ...form, breed: v })}
                  options={getBreedsForSpecies(form.species)}
                  placeholder="Pumili o mag-type ng lahi..."
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Birth Date">
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                />
              </FormField>
              <FormField label="Weight (kg)" error={errors.weight_kg}>
                <Input
                  type="number"
                  step="0.1"
                  value={form.weight_kg}
                  onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                  placeholder="35.5"
                />
              </FormField>
            </div>

            <FormField label="Color / Markings">
              <ComboBox
                value={form.color_markings}
                onChange={(v) => setForm({ ...form, color_markings: v })}
                options={COLOR_MARKINGS}
                placeholder="Maghanap o mag-type ng kulay/markings..."
              />
            </FormField>

            <FormField label="Notes">
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Karagdagang tala sa kalusugan o kasaysayan ng hayop..."
                style={{ minHeight: 80 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            I-cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {editing ? 'I-update' : 'I-save'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* QR Modal */}
      <Modal open={!!qrAnimal} onClose={() => setQrAnimal(null)} size="sm">
        <ModalHeader title={`QR Code — ${qrAnimal?.name ?? ''}`} onClose={() => setQrAnimal(null)} />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 8 }}>
            <QRCodeCanvas value={`${APP_URL}/public/${qrAnimal?.id}`} size={240} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '17px', color: 'var(--color-text-primary, #0F172A)' }}>
                {qrAnimal?.name}
              </div>
              <div style={{ color: 'var(--color-primary, #FF6A2A)', fontSize: '13px', fontWeight: 600 }}>
                {qrAnimal?.tag_id}
              </div>
              <p style={{ color: 'var(--color-text-muted, #64748B)', fontSize: '12px', marginTop: 6, margin: 0 }}>
                I-scan gamit ang anumang QR camera para makita ang public health record ng hayop.
              </p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setQrAnimal(null)}>
            Isara
          </Button>
          <Button variant="secondary" onClick={downloadQR} leftIcon={<Download size={15} />}>
            I-download
          </Button>
          <Button variant="primary" onClick={printQR} leftIcon={<Printer size={15} />}>
            I-print
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="I-delete ang Hayop"
        message={`Sigurado ka bang nais mong i-delete si ${confirmDelete?.name}? Matatanggal din ang lahat ng kaugnay na health, weight, breeding, at vaccination records nito. Hindi na ito maibabalik.`}
        confirmLabel="I-delete"
        danger
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
  return <canvas ref={ref} style={{ borderRadius: 'var(--radius-md, 14px)' }} />;
}
