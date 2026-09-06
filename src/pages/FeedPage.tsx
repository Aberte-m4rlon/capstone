import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select, FormField } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterToolbar, FilterSelect } from '../components/FilterToolbar';
import { Icons } from '../lib/icons';
import { Plus, Pencil, Trash2, Brain, TrendingUp } from 'lucide-react';
import { formatDate, calculateFeedEfficiency, calculateMilkForecast } from '../lib/analytics';
import { useMilkForecast, useFeedPrediction } from '../lib/mlHooks';
import { isFeedCategory, consumeInventoryStock } from '../lib/inventoryOperations';
import type { FeedRecord, MilkRecord } from '../types';

const emptyForm = {
  animal_id: '',
  inventory_item_id: '',
  record_date: new Date().toISOString().split('T')[0],
  feed_type: '',
  quantity_kg: '',
  cost: '',
  notes: '',
};

const emptyMilkForm = {
  animal_id: '',
  record_date: new Date().toISOString().split('T')[0],
  yield_litres: '',
  notes: '',
};

export function FeedPage() {
  const farmData = useFarmData();
  const { user, profile } = useAuth();
  const isSuperAdmin = profile?.role === 'super_admin';
  const { toast } = useToast();
  const feedPred = useFeedPrediction();

  const [modalOpen, setModalOpen] = useState(false);
  const [milkModalOpen, setMilkModalOpen] = useState(false);
  const [editing, setEditing] = useState<FeedRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [milkForm, setMilkForm] = useState(emptyMilkForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FeedRecord | null>(null);
  const [tab, setTab] = useState<'feed' | 'milk'>('feed');
  const [fAnimal, setFAnimal] = useState('All');

  const activeAnimals = farmData.animals.filter((a) => !a.archived);
  const females = activeAnimals.filter((a) => a.sex === 'Female');

  const filteredFeed = useMemo(() => {
    return farmData.feedRecords
      .filter((r) => fAnimal === 'All' || r.animal_id === fAnimal)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  }, [farmData.feedRecords, fAnimal]);

  const filteredMilk = useMemo(() => {
    return farmData.milkRecords
      .filter((r) => fAnimal === 'All' || r.animal_id === fAnimal)
      .sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime());
  }, [farmData.milkRecords, fAnimal]);

  const feedInventory = useMemo(() => {
    return farmData.inventory.filter((i) => isFeedCategory(i.category));
  }, [farmData.inventory]);

  const selectedFeedItem = useMemo(() => {
    return feedInventory.find((i) => i.id === form.inventory_item_id) || null;
  }, [feedInventory, form.inventory_item_id]);

  const openAdd = () => {
    setEditing(null);
    const firstAvailable = feedInventory.find((i) => Number(i.quantity) > 0) || feedInventory[0];
    setForm({
      ...emptyForm,
      animal_id: activeAnimals[0]?.id ?? '',
      inventory_item_id: firstAvailable?.id ?? '',
      feed_type: firstAvailable?.name ?? '',
      cost: firstAvailable?.cost ? String(firstAvailable.cost) : '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (r: FeedRecord) => {
    setEditing(r);
    const matched = feedInventory.find((i) => i.name.toLowerCase() === r.feed_type.toLowerCase());
    setForm({
      animal_id: r.animal_id,
      inventory_item_id: matched?.id ?? '',
      record_date: r.record_date,
      feed_type: r.feed_type,
      quantity_kg: String(r.quantity_kg),
      cost: String(r.cost),
      notes: r.notes ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.animal_id) e.animal_id = 'Pumili ng hayop.';
    if (!editing && !form.inventory_item_id) {
      e.inventory_item_id = 'Pumili ng pakain mula sa imbentaryo.';
    } else if (!form.feed_type.trim()) {
      e.feed_type = 'Kailangang ilagay ang uri ng pakain.';
    }
    const qty = Number(form.quantity_kg);
    if (!form.quantity_kg || isNaN(qty) || qty <= 0) {
      e.quantity_kg = 'Maglagay ng wastong dami na higit sa 0.';
    } else if (!editing && selectedFeedItem && qty > Number(selectedFeedItem.quantity)) {
      e.quantity_kg = `❌ Hindi sapat ang stock. Available lang: ${selectedFeedItem.quantity} ${selectedFeedItem.unit}.`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !user) return;

    const animal = farmData.animals.find((a) => a.id === form.animal_id);
    if (!animal || (!isSuperAdmin && animal.user_id !== user.id)) {
      toast('Walang pahintulot sa napiling hayop.', 'danger');
      return;
    }

    setSaving(true);
    const qty = Number(form.quantity_kg);
    const feedName = selectedFeedItem ? selectedFeedItem.name : form.feed_type.trim();

    try {
      if (editing) {
        const payload = {
          user_id: user.id,
          animal_id: form.animal_id,
          record_date: form.record_date,
          feed_type: feedName,
          quantity_kg: qty,
          cost: form.cost ? Number(form.cost) : 0,
          notes: form.notes.trim() || null,
        };
        let updateQuery = supabase.from('feed_records').update(payload).eq('id', editing.id);
        if (!isSuperAdmin) {
          updateQuery = updateQuery.eq('user_id', user.id);
        }
        const { error } = await updateQuery;
        if (error) throw error;
        toast('Na-update na ang rekord ng pakain.', 'success');
      } else {
        if (!selectedFeedItem) {
          toast('Pumili ng wastong pakain mula sa imbentaryo.', 'danger');
          setSaving(false);
          return;
        }

        // 1. Consume from Inventory & Write to inventory_transactions ledger atomically
        const consumeRes = await consumeInventoryStock({
          userId: user.id,
          isSuperAdmin,
          item: selectedFeedItem,
          quantity: qty,
          usageType: 'feeding',
          animalId: animal.id,
          animalTag: animal.tag_id,
          animalName: animal.name,
          referenceType: 'animal',
          referenceId: animal.id,
          reason: 'Feeding / Pagpapakain',
          notes: `Pakain: ${feedName} para kay ${animal.tag_id} (${animal.name || 'Walang Pangalan'}). ${form.notes.trim()}`.trim(),
        });

        if (!consumeRes.success) {
          toast(consumeRes.error || 'Hindi sapat ang stock sa imbentaryo.', 'danger');
          setSaving(false);
          return;
        }

        // 2. Save Feed Record linked to the animal
        const payload = {
          user_id: user.id,
          animal_id: form.animal_id,
          record_date: form.record_date,
          feed_type: feedName,
          quantity_kg: qty,
          cost: form.cost ? Number(form.cost) : (selectedFeedItem.cost ? +(qty * Number(selectedFeedItem.cost)).toFixed(2) : 0),
          notes: form.notes.trim() || null,
        };

        const { error: feedErr } = await supabase.from('feed_records').insert(payload);
        if (feedErr) throw feedErr;

        toast(`Nai-save ang pakain! Nabawasan ng ${qty} ${selectedFeedItem.unit} ang ${selectedFeedItem.name} sa imbentaryo.`, 'success');
      }

      setModalOpen(false);
      farmData.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Hindi mai-save ang rekord ng pakain. Pakisubukang muli.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete || !user) return;
    try {
      let deleteQuery = supabase.from('feed_records').delete().eq('id', confirmDelete.id);
      if (!isSuperAdmin) {
        deleteQuery = deleteQuery.eq('user_id', user.id);
      }
      const { error } = await deleteQuery;
      if (error) throw error;
      toast('Nabura na ang rekord ng pakain.', 'success');
      setConfirmDelete(null);
      farmData.refresh();
    } catch {
      toast('Hindi mabura ang rekord ng pakain. Pakisubukang muli.', 'danger');
    }
  };

  const handleMilkSave = async () => {
    if (!user) return;
    const e: Record<string, string> = {};
    if (!milkForm.animal_id) e.animal_id = 'Pumili ng inahin.';
    if (!milkForm.yield_litres || isNaN(Number(milkForm.yield_litres)) || Number(milkForm.yield_litres) <= 0)
      e.yield_litres = 'Maglagay ng wastong dami ng gatas na higit sa 0.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const animal = farmData.animals.find((a) => a.id === milkForm.animal_id);
    if (!animal || (!isSuperAdmin && animal.user_id !== user.id)) {
      toast('Walang pahintulot sa napiling inahin.', 'danger');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('milk_records').insert({
        user_id: user.id,
        animal_id: milkForm.animal_id,
        record_date: milkForm.record_date,
        yield_litres: Number(milkForm.yield_litres),
        notes: milkForm.notes.trim() || null,
      });
      if (error) throw error;
      toast('Nai-save na ang rekord ng ani ng gatas.', 'success');
      setMilkModalOpen(false);
      setMilkForm(emptyMilkForm);
      farmData.refresh();
    } catch {
      toast('Hindi mai-save ang rekord ng gatas. Pakisubukang muli.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleMilkDelete = async (m: MilkRecord) => {
    if (!user) return;
    try {
      let deleteQuery = supabase.from('milk_records').delete().eq('id', m.id);
      if (!isSuperAdmin) {
        deleteQuery = deleteQuery.eq('user_id', user.id);
      }
      const { error } = await deleteQuery;
      if (error) throw error;
      toast('Nabura na ang rekord ng gatas.', 'success');
      farmData.refresh();
    } catch {
      toast('Hindi mabura ang rekord ng gatas. Pakisubukang muli.', 'danger');
    }
  };

  const animalName = (id: string) => {
    const a = farmData.animals.find((x) => x.id === id);
    return a ? `${a.name} (${a.tag_id})` : 'Unknown';
  };

  const efficiencies = useMemo(() => {
    return activeAnimals
      .map((a) => {
        const feeds = farmData.feedRecords.filter((f) => f.animal_id === a.id);
        const weights = farmData.weightRecords.filter((w) => w.animal_id === a.id);
        return { animal: a, eff: calculateFeedEfficiency(feeds, weights) };
      })
      .filter((x) => x.eff.fcr !== null || x.eff.totalFeedKg > 0);
  }, [activeAnimals, farmData.feedRecords, farmData.weightRecords]);

  const milkForecasts = useMemo(() => {
    return females.map((a) => {
      const records = farmData.milkRecords.filter((m) => m.animal_id === a.id);
      return { animal: a, forecast: calculateMilkForecast(records) };
    });
  }, [females, farmData.milkRecords]);

  const feedForecast = useMemo(() => {
    const totalFeedKg = farmData.feedRecords.reduce((s, f) => s + Number(f.quantity_kg), 0);
    const totalCost = farmData.feedRecords.reduce((s, f) => s + Number(f.cost), 0);
    const avgCostPerKg = totalFeedKg > 0 ? totalCost / totalFeedKg : 25;
    
    // Average daily consumption per animal in kg (default 1.5kg for standard caprine maintenance)
    const avgDailyPerAnimal = 1.5;
    const dailyHerdRequirementKg = Number((activeAnimals.length * avgDailyPerAnimal).toFixed(1));
    const projectedMonthlyKg = Math.round(dailyHerdRequirementKg * 30);
    const estimatedMonthlyCost = projectedMonthlyKg * avgCostPerKg;
    const confidence = feedPred ? Math.min(Math.max(Math.round(feedPred.model.rSquared * 100), 75), 98) : 85;

    return {
      confidence,
      dailyHerdRequirementKg,
      projectedMonthlyKg,
      estimatedMonthlyCost,
      avgCostPerKg,
      animalCount: activeAnimals.length,
    };
  }, [farmData.feedRecords, activeAnimals.length, feedPred]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)', letterSpacing: '-0.02em' }}>
            Pamamahala sa Pakain at Gatas
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary, #475569)', fontSize: '14px' }}>
            {tab === 'feed'
              ? `${filteredFeed.length} talaan ng pakain · Awtomatikong kinalkula ang Feed Conversion Ratio (FCR)`
              : `${filteredMilk.length} talaan ng gatas · Awtomatikong buwanang forecast`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'feed' ? (
            <Button variant="primary" onClick={openAdd} disabled={activeAnimals.length === 0} leftIcon={<Plus size={16} />}>
              Magtala ng Pakain
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                setMilkForm({ ...emptyMilkForm, animal_id: females[0]?.id ?? '' });
                setErrors({});
                setMilkModalOpen(true);
              }}
              disabled={females.length === 0}
              leftIcon={<Plus size={16} />}
            >
              Magtala ng Gatas
            </Button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant={tab === 'feed' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setTab('feed')}
          leftIcon={<Icons.Wheat size={15} />}
        >
          Mga Rekord ng Pakain ({farmData.feedRecords.length})
        </Button>
        <Button
          variant={tab === 'milk' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setTab('milk')}
          leftIcon={<Icons.Milk size={15} />}
        >
          Produksyon ng Gatas ({farmData.milkRecords.length})
        </Button>
      </div>

      {tab === 'feed' && (
        <>
          {/* Feed Conversion Ratio Card */}
          <Card variant="default">
            <CardContent>
              <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-text-primary, #0F172A)', marginBottom: 14 }}>
                Episyensya sa Pagkain (Feed Conversion Efficiency)
              </div>
              {efficiencies.length === 0 ? (
                <EmptyState
                  icon={<Icons.Wheat size={32} />}
                  title="Wala pang datos ng episyensya"
                  description="Magtala ng pakain at timbang upang makalkula ang Feed Conversion Ratio (FCR)."
                />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Hayop</th>
                        <th>Kabuuang Pakain</th>
                        <th>Kabuuang Gastos</th>
                        <th>Dagdag sa Timbang</th>
                        <th>Feed Conversion (FCR)</th>
                        <th>Episyensya</th>
                      </tr>
                    </thead>
                    <tbody>
                      {efficiencies.map(({ animal, eff }) => (
                        <tr key={animal.id}>
                          <td style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>{animal.name}</td>
                          <td>{eff.totalFeedKg} kg</td>
                          <td>₱{eff.totalCost.toFixed(2)}</td>
                          <td style={{ color: eff.weightGainKg > 0 ? 'var(--color-success, #16A34A)' : 'inherit' }}>
                            {eff.weightGainKg > 0 ? `+${eff.weightGainKg} kg` : '—'}
                          </td>
                          <td style={{ color: 'var(--color-primary, #238B45)', fontWeight: 600 }}>
                            {eff.fcr !== null ? `${eff.fcr}:1` : '—'}
                          </td>
                          <td>
                            <Badge
                              variant={
                                eff.efficiencyRating === 'High'
                                    ? 'success'
                                    : eff.efficiencyRating === 'Low'
                                    ? 'danger'
                                    : eff.efficiencyRating === 'Moderate'
                                    ? 'warning'
                                    : 'default'
                              }
                              size="sm"
                            >
                              {eff.efficiencyRating === 'High' ? 'Mataas (Maganda)' : eff.efficiencyRating === 'Low' ? 'Mababa' : eff.efficiencyRating === 'Moderate' ? 'Katamtaman' : eff.efficiencyRating}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ML Feed Requirement Forecast */}
          {activeAnimals.length > 0 && (
            <Card variant="default" style={{ borderLeft: '4px solid var(--color-primary, #43A047)' }}>
              <CardContent>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <Brain size={18} color="#43A047" />
                  <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-text-primary, #1F2933)' }}>
                    Pagtataya sa Pangangailangan sa Pakain — 30-Araw na Projection
                  </span>
                </div>
                <div className="dashboard-stats stats-grid" style={{ marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #667085)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                      Pang-araw-araw ng Kawan
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary, #1F2933)' }}>
                      {feedForecast.dailyHerdRequirementKg} kg/araw
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #667085)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                      30-Araw na Tinatayang Dami
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-primary, #43A047)' }}>
                      {feedForecast.projectedMonthlyKg} kg
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #475569)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                      Tinatayang Buwanang Gastos
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)' }}>
                      ₱{feedForecast.estimatedMonthlyCost.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #475569)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                      Average na Halaga bawat Kilo
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary, #0F172A)' }}>
                      ₱{feedForecast.avgCostPerKg.toFixed(2)}/kg
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748B)', marginTop: 12, margin: 0 }}>
                  Batay sa kasalukuyang dami ng alaga ({feedForecast.animalCount} aktibong hayop), average na timbang, at nakaraang konsumo.
                </p>
              </CardContent>
            </Card>
          )}

          <FilterToolbar>
            <FilterSelect
              value={fAnimal}
              onChange={setFAnimal}
              options={[
                { value: 'All', label: 'Lahat ng Hayop' },
                ...activeAnimals.map((a) => ({ value: a.id, label: `${a.name} (${a.tag_id})` })),
              ]}
              ariaLabel="Salain ayon sa Hayop"
              minWidth={180}
            />
          </FilterToolbar>

          {/* Feed Table */}
          <Card variant="default" padding="none">
            <CardContent>
              {filteredFeed.length === 0 ? (
                <div style={{ padding: 32 }}>
                  <EmptyState
                    icon={<Icons.Wheat size={32} />}
                    title="Walang talaan ng pakain"
                    description="Magtala ng pagpapakain upang masubaybayan ang konsumo."
                    actionLabel="Magtala ng Pakain"
                    onAction={openAdd}
                  />
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Petsa</th>
                        <th>Hayop</th>
                        <th>Uri ng Pakain</th>
                        <th>Dami (kg)</th>
                        <th>Halaga (₱)</th>
                        <th>Mga Tala (Notes)</th>
                        <th style={{ textAlign: 'right' }}>Mga Aksyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFeed.map((f) => (
                        <tr key={f.id}>
                          <td>{formatDate(f.record_date)}</td>
                          <td style={{ fontWeight: 700, color: 'var(--color-text-primary, #0F172A)' }}>
                            {animalName(f.animal_id)}
                          </td>
                          <td>{f.feed_type}</td>
                          <td style={{ fontWeight: 600 }}>{f.quantity_kg} kg</td>
                          <td>{f.cost ? `₱${Number(f.cost).toFixed(2)}` : '—'}</td>
                          <td style={{ color: 'var(--color-text-secondary, #475569)' }}>{f.notes ?? '—'}</td>
                          <td>
                            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(f)}>
                                <Pencil size={15} />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(f)}>
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
        </>
      )}

      {tab === 'milk' && (
        <>
          {/* Milk Yield Forecast Card */}
          <Card variant="default">
            <CardContent>
              <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-text-primary, #0F172A)', marginBottom: 14 }}>
                Pagtataya sa Ani ng Gatas (Milk Yield Forecast)
              </div>
              {milkForecasts.length === 0 ? (
                <EmptyState
                  icon={<Icons.Milk size={32} />}
                  title="Walang babaeng hayop na nahanap"
                  description="Magdagdag ng inahin upang masubaybayan ang paggagatas at ani ng gatas."
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                  {milkForecasts.map(({ animal, forecast }) => (
                    <div
                      key={animal.id}
                      style={{
                        padding: 14,
                        borderRadius: 'var(--radius-md, 14px)',
                        background: 'var(--color-surface-elevated, #F8FAFC)',
                        border: '1px solid var(--color-border, #E2E8F0)',
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-text-primary, #0F172A)', marginBottom: 8 }}>
                        {animal.name}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Kasalukuyan:</span>
                          <strong>{forecast.current} L/araw</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Karaniwan:</span>
                          <strong>{forecast.average} L/araw</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--color-text-secondary, #475569)' }}>Takbo ng Dami:</span>
                          <strong>{forecast.trend === 'Up' ? 'Tumataas' : forecast.trend === 'Down' ? 'Bumababa' : 'Pantay / Matatag'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border, #E5EDE6)', paddingTop: 4, marginTop: 2 }}>
                          <span style={{ color: 'var(--color-primary, #43A047)', fontWeight: 600 }}>Tantiya sa Susunod na Buwan:</span>
                          <strong style={{ color: 'var(--color-primary, #43A047)' }}>
                            {forecast.forecastNextMonth !== null ? `${forecast.forecastNextMonth} L/araw` : 'Kailangan ng dagdag na tala'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Milk Table */}
          <Card variant="default" padding="none">
            <CardContent>
              {filteredMilk.length === 0 ? (
                <div style={{ padding: 32 }}>
                  <EmptyState
                    icon={<Icons.Milk size={32} />}
                    title="Walang talaan ng gatas"
                    description="Magtala ng pang-araw-araw na gatas upang masubaybayan ang ani."
                    actionLabel="Magtala ng Gatas"
                    onAction={() => {
                      setMilkForm({ ...emptyMilkForm, animal_id: females[0]?.id ?? '' });
                      setErrors({});
                      setMilkModalOpen(true);
                    }}
                  />
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Petsa</th>
                        <th>Hayop</th>
                        <th>Dami ng Gatas (Litro)</th>
                        <th style={{ textAlign: 'right' }}>Mga Aksyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMilk.map((m) => (
                        <tr key={m.id}>
                          <td>{formatDate(m.record_date)}</td>
                          <td style={{ fontWeight: 700, color: 'var(--color-text-primary, #1F2933)' }}>
                            {animalName(m.animal_id)}
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--color-primary, #43A047)' }}>
                            {m.yield_litres} L
                          </td>
                          <td>
                            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                              <Button variant="ghost" size="sm" onClick={() => handleMilkDelete(m)} title="Burahin ang talaan ng gatas">
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
        </>
      )}

      {/* Feed Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md">
        <ModalHeader
          title={editing ? 'I-edit ang Rekord ng Pakain' : 'Magtala ng Pakain'}
          onClose={() => setModalOpen(false)}
        />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Hayop" required error={errors.animal_id}>
              <Select
                value={form.animal_id}
                onChange={(e) => setForm({ ...form, animal_id: e.target.value })}
                options={[
                  { value: '', label: 'Pumili ng hayop...' },
                  ...activeAnimals.map((a) => ({ value: a.id, label: `${a.name} (${a.tag_id})` })),
                ]}
              />
            </FormField>

            {feedInventory.length === 0 && (
              <div
                style={{
                  background: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#92400E',
                }}
              >
                ⚠️ Walang nakalistang pakain (Feed) sa iyong Farm Inventory.{' '}
                <a href="/inventory" style={{ textDecoration: 'underline', fontWeight: 700 }}>
                  Magdagdag muna sa Inventory
                </a>{' '}
                upang maitala ang pagpapakain at mabawasan ang stock.
              </div>
            )}

            <FormField label="Pakain mula sa Farm Inventory" required error={errors.inventory_item_id || errors.feed_type}>
              <Select
                value={form.inventory_item_id}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  const item = feedInventory.find((i) => i.id === selectedId);
                  const q = Number(form.quantity_kg) || 0;
                  setForm({
                    ...form,
                    inventory_item_id: selectedId,
                    feed_type: item ? item.name : '',
                    cost: item?.cost && q > 0 ? String(+(q * Number(item.cost)).toFixed(2)) : form.cost,
                  });
                }}
                options={[
                  {
                    value: '',
                    label: feedInventory.length === 0 ? 'Walang available na feed sa inventory...' : 'Pumili ng pakain mula sa imbentaryo...',
                  },
                  ...feedInventory.map((i) => ({
                    value: i.id,
                    label: `${i.name} — ${i.quantity} ${i.unit} available${Number(i.quantity) <= 0 ? ' (Ubos na ang Stock)' : ''}`,
                    disabled: Number(i.quantity) <= 0,
                  })),
                ]}
              />
            </FormField>

            {selectedFeedItem && (
              <div
                style={{
                  background: Number(selectedFeedItem.quantity) <= 0 ? '#FEE2E2' : '#EAF6ED',
                  border: `1px solid ${Number(selectedFeedItem.quantity) <= 0 ? '#FCA5A5' : '#C3E6CB'}`,
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  <strong>Kasalukuyang Available:</strong>{' '}
                  <span
                    style={{
                      color:
                        Number(selectedFeedItem.quantity) <= 0
                          ? '#EF4444'
                          : Number(selectedFeedItem.quantity) <= Number(selectedFeedItem.minimum_stock)
                          ? '#D97706'
                          : '#238B45',
                      fontWeight: 800,
                    }}
                  >
                    {selectedFeedItem.quantity} {selectedFeedItem.unit}
                  </span>
                </span>
                <span>
                  <strong>Halaga kada Yunit:</strong> ₱{selectedFeedItem.cost ?? 0} / {selectedFeedItem.unit}
                </span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label={`Dami (${selectedFeedItem?.unit || 'kg'})`} required error={errors.quantity_kg}>
                <Input
                  type="number"
                  step="0.1"
                  value={form.quantity_kg}
                  onChange={(e) => {
                    const q = e.target.value;
                    const autoCost =
                      selectedFeedItem?.cost && Number(q) > 0
                        ? String(+(Number(q) * Number(selectedFeedItem.cost)).toFixed(2))
                        : form.cost;
                    setForm({ ...form, quantity_kg: q, cost: autoCost });
                  }}
                  placeholder="Hal. 5"
                />
              </FormField>

              <FormField label="Halaga / Gastos (₱)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  placeholder="0.00"
                />
              </FormField>
            </div>

            <FormField label="Petsa">
              <Input
                type="date"
                value={form.record_date}
                onChange={(e) => setForm({ ...form, record_date: e.target.value })}
              />
            </FormField>

            <FormField label="Mga Tala / Obserbasyon (Notes)">
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Karagdagang detalye o obserbasyon sa pagkain..."
                style={{ minHeight: 80 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Huwag Muna
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {editing ? 'I-save ang mga Pagbabago' : 'I-save'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Milk Modal */}
      <Modal open={milkModalOpen} onClose={() => setMilkModalOpen(false)} size="md">
        <ModalHeader title="Magtala ng Ani ng Gatas" onClose={() => setMilkModalOpen(false)} />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Inahin (Hayop)" required error={errors.animal_id}>
              <Select
                value={milkForm.animal_id}
                onChange={(e) => setMilkForm({ ...milkForm, animal_id: e.target.value })}
                options={[
                  { value: '', label: 'Pumili ng inahin...' },
                  ...females.map((a) => ({ value: a.id, label: `${a.name} (${a.tag_id})` })),
                ]}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <FormField label="Petsa">
                <Input
                  type="date"
                  value={milkForm.record_date}
                  onChange={(e) => setMilkForm({ ...milkForm, record_date: e.target.value })}
                />
              </FormField>

              <FormField label="Ani ng Gatas (Litro)" required error={errors.yield_litres}>
                <Input
                  type="number"
                  step="0.01"
                  value={milkForm.yield_litres}
                  onChange={(e) => setMilkForm({ ...milkForm, yield_litres: e.target.value })}
                />
              </FormField>
            </div>

            <FormField label="Mga Tala / Obserbasyon (Notes)">
              <textarea
                className="form-textarea"
                value={milkForm.notes}
                onChange={(e) => setMilkForm({ ...milkForm, notes: e.target.value })}
                placeholder="Obserbasyon sa gatas o kalusugan ng inahin..."
                style={{ minHeight: 80 }}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setMilkModalOpen(false)}>
            Huwag Muna
          </Button>
          <Button variant="primary" onClick={handleMilkSave} loading={saving}>
            I-save
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Burahin ang Rekord ng Pakain"
        message="Sigurado ka bang nais mong burahin ang rekord na ito ng pakain? Hindi na ito maibabalik kapag nabura."
        confirmLabel="Oo, Burahin"
        cancelLabel="Huwag Muna"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
