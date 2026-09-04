import { useMemo, useState } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { formatDate } from '../lib/analytics';
import { FilterToolbar, FilterSearch, FilterSelect, FilterDateRange, FilterResetButton } from '../components/FilterToolbar';
import { Download, Printer, Activity, PawPrint, HeartPulse, Scale, Heart, Syringe, Wheat, Milk, Package, type LucideIcon } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

// ── Activity entry types ──────────────────────────────────────────────────────

type ActivityCategory =
  | 'Animal'
  | 'Health'
  | 'Weight'
  | 'Breeding'
  | 'Vaccination'
  | 'Feed'
  | 'Milk'
  | 'Inventory';

interface ActivityEntry {
  id: string;
  date: string;
  category: ActivityCategory;
  action: string;
  description: string;
  animal?: string;
  icon: string;
  color: string;
}

const CATEGORY_TAGLISH: Record<ActivityCategory, string> = {
  Animal:      'Hayop',
  Health:      'Kalusugan',
  Weight:      'Timbang',
  Breeding:    'Breeding',
  Vaccination: 'Bakuna',
  Feed:        'Pakain',
  Milk:        'Gatas',
  Inventory:   'Imbentaryo',
};

const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  Animal:      '#FF7A18',
  Health:      '#FF3B30',
  Weight:      '#FF9F0A',
  Breeding:    '#FF7A18',
  Vaccination: '#FFB340',
  Feed:        '#FF9F0A',
  Milk:        '#FFB340',
  Inventory:   '#D92D20',
};

const CATEGORY_ICON_COMPONENTS: Record<ActivityCategory, LucideIcon> = {
  Animal:      PawPrint,
  Health:      HeartPulse,
  Weight:      Scale,
  Breeding:    Heart,
  Vaccination: Syringe,
  Feed:        Wheat,
  Milk:        Milk,
  Inventory:   Package,
};

export function ActivityLogPage() {
  const farmData = useFarmData();
  const [filterCategory, setFilterCategory] = useState<'All' | ActivityCategory>('All');
  const [filterAnimal, setFilterAnimal] = useState('All');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Build activity log from all records ─────────────────────────────────────
  const allActivities = useMemo((): ActivityEntry[] => {
    const entries: ActivityEntry[] = [];
    const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Hindi Natukoy';

    // Animals
    farmData.animals.forEach((a) => {
      entries.push({
        id: `animal-${a.id}`,
        date: a.created_at.split('T')[0],
        category: 'Animal',
        action: a.archived ? 'Nai-archive ang Hayop' : 'Naidagdag ang Hayop',
        description: `${a.name} (${a.tag_id}) — ${a.species === 'Goat' ? 'Kambing' : 'Tupa'}, ${a.sex === 'Male' ? 'Lalaki' : 'Babae'}${a.breed ? `, ${a.breed}` : ''}`,
        animal: a.name,
        icon: 'PawPrint',
        color: CATEGORY_COLORS.Animal,
      });
    });

    // Health records
    farmData.healthRecords.forEach((r) => {
      const riskLabel = r.risk_level === 'Critical' ? 'Kritikal' : r.risk_level === 'High' ? 'Mataas' : r.risk_level === 'Moderate' ? 'Katamtaman' : 'Mababa';
      entries.push({
        id: `health-${r.id}`,
        date: r.record_date,
        category: 'Health',
        action: 'Naitala ang Pagsusuri sa Kalusugan',
        description: `${animalName(r.animal_id)} — Antas ng Panganib: ${riskLabel} (${r.risk_score})${r.reasons ? ` · ${r.reasons.split(';')[0].trim()}` : ''}`,
        animal: animalName(r.animal_id),
        icon: 'HeartPulse',
        color: r.risk_level === 'Critical' ? '#FF3B30' : r.risk_level === 'High' ? '#FF7A18' : r.risk_level === 'Moderate' ? '#FF9F0A' : '#FFB340',
      });
    });

    // Weight records
    farmData.weightRecords.forEach((r) => {
      entries.push({
        id: `weight-${r.id}`,
        date: r.record_date,
        category: 'Weight',
        action: 'Naitala ang Timbang',
        description: `${animalName(r.animal_id)} — ${r.weight_kg} kg${r.weight_change_kg !== null ? ` (${r.weight_change_kg > 0 ? '+' : ''}${r.weight_change_kg} kg pagbabago)` : ''}`,
        animal: animalName(r.animal_id),
        icon: 'Scale',
        color: CATEGORY_COLORS.Weight,
      });
    });

    // Breeding records
    farmData.breedingRecords.forEach((r) => {
      const female = animalName(r.animal_id);
      const partner = r.partner_id ? animalName(r.partner_id) : null;
      entries.push({
        id: `breeding-${r.id}`,
        date: r.mating_date,
        category: 'Breeding',
        action: 'Naitala ang Breeding',
        description: `${female}${partner ? ` × ${partner}` : ''} — Katayuan: ${r.status}${r.expected_kidding_date ? ` · Tinatayang Panganganak: ${formatDate(r.expected_kidding_date)}` : ''}`,
        animal: female,
        icon: 'Heart',
        color: CATEGORY_COLORS.Breeding,
      });
    });

    // Vaccinations
    farmData.vaccinations.forEach((v) => {
      entries.push({
        id: `vacc-${v.id}`,
        date: v.date_given,
        category: 'Vaccination',
        action: 'Naibigay ang Bakuna',
        description: `${animalName(v.animal_id)} — ${v.vaccine_name}${v.veterinarian ? ` · Nagbigay: ${v.veterinarian}` : ''}${v.next_due_date ? ` · Susunod: ${formatDate(v.next_due_date)}` : ''}`,
        animal: animalName(v.animal_id),
        icon: 'Syringe',
        color: CATEGORY_COLORS.Vaccination,
      });
    });

    // Feed records
    farmData.feedRecords.forEach((f) => {
      entries.push({
        id: `feed-${f.id}`,
        date: f.record_date,
        category: 'Feed',
        action: 'Naitala ang Pakain',
        description: `${animalName(f.animal_id)} — ${f.feed_type}, ${f.quantity_kg} kg${f.cost ? ` · ₱${f.cost}` : ''}`,
        animal: animalName(f.animal_id),
        icon: 'Wheat',
        color: CATEGORY_COLORS.Feed,
      });
    });

    // Milk records
    farmData.milkRecords.forEach((m) => {
      entries.push({
        id: `milk-${m.id}`,
        date: m.record_date,
        category: 'Milk',
        action: 'Naitala ang Gatas',
        description: `${animalName(m.animal_id)} — ${m.yield_litres} litro`,
        animal: animalName(m.animal_id),
        icon: 'Milk',
        color: CATEGORY_COLORS.Milk,
      });
    });

    // Inventory
    farmData.inventory.forEach((i) => {
      entries.push({
        id: `inv-${i.id}`,
        date: i.created_at.split('T')[0],
        category: 'Inventory',
        action: 'Naidagdag sa Imbentaryo',
        description: `${i.name} — ${i.category}, ${i.quantity} ${i.unit}${i.supplier ? ` · Supplier: ${i.supplier}` : ''}`,
        icon: 'Package',
        color: CATEGORY_COLORS.Inventory,
      });
    });

    // Sort by date descending
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [farmData]);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allActivities.filter((e) => {
      if (filterCategory !== 'All' && e.category !== filterCategory) return false;
      if (filterAnimal !== 'All' && e.animal !== filterAnimal) return false;
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo && e.date > dateTo) return false;
      if (search && !e.description.toLowerCase().includes(search.toLowerCase()) &&
          !e.action.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allActivities, filterCategory, filterAnimal, dateFrom, dateTo, search]);

  // ── Summary counts ────────────────────────────────────────────────────────────
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allActivities.forEach((e) => {
      counts[e.category] = (counts[e.category] ?? 0) + 1;
    });
    return counts;
  }, [allActivities]);

  // ── Export CSV ────────────────────────────────────────────────────────────────
  const handleDownloadCSV = () => {
    const headers = ['Date', 'Category', 'Action', 'Animal', 'Description'];
    const rows = filtered.map((e) => [
      e.date,
      e.category,
      e.action,
      e.animal ?? '',
      `"${e.description.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alpasfarm-activity-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Print ────────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const rows = filtered.map((e) => `
      <tr>
        <td>${e.date}</td>
        <td><span style="background:${e.color}20;color:${e.color};padding:2px 8px;border-radius:4px;font-weight:600;font-size:11px">${e.category}</span></td>
        <td>${e.action}</td>
        <td>${e.animal ?? '—'}</td>
        <td>${e.description}</td>
      </tr>`).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>AlpasFarm — Activity Log</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; color: #1F2937; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        p { color: #6B7280; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #F3F4F6; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #E5E7EB; }
        td { padding: 7px 10px; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
        tr:nth-child(even) td { background: #FAFAFA; }
        @media print { body { padding: 0; } }
      </style></head>
      <body>
        <h1>AlpasFarm — Activity Log</h1>
        <p>Generated: ${new Date().toLocaleString()} · Total records: ${filtered.length}</p>
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Action</th><th>Animal</th><th>Description</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>`);
    win.document.close();
    win.print();
  };

  if (farmData.loading) {
    return <LoadingSpinner fullScreen text="Ikinakarga ang talaan ng mga gawain..." />;
  }

  const CATEGORIES: ActivityCategory[] = ['Animal', 'Health', 'Weight', 'Breeding', 'Vaccination', 'Feed', 'Milk', 'Inventory'];
  const animalNames = [...new Set(allActivities.map((e) => e.animal).filter((a): a is string => Boolean(a)))].sort();

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Talaan ng mga Gawain (Activity Log)</h1>
          <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
            {filtered.length} sa {allActivities.length} mga gawain · Lahat ng aktibidad sa bukid sa iisang lugar
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="secondary"
            onClick={handleDownloadCSV}
            leftIcon={<Download size={16} />}
          >
            I-download ang CSV
          </Button>
          <Button
            variant="primary"
            onClick={handlePrint}
            leftIcon={<Printer size={16} />}
          >
            I-print
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {CATEGORIES.map((cat) => {
          const IconComp = CATEGORY_ICON_COMPONENTS[cat] ?? Activity;
          const isSelected = filterCategory === cat;
          return (
            <div
              key={cat}
              onClick={() => setFilterCategory(isSelected ? 'All' : cat)}
              style={{
                padding: '8px 14px',
                borderRadius: 12,
                cursor: 'pointer',
                background: isSelected ? `${CATEGORY_COLORS[cat]}20` : 'var(--color-surface-glass, rgba(255,255,255,0.04))',
                border: `1.5px solid ${isSelected ? CATEGORY_COLORS[cat] : 'var(--border-light, rgba(255,255,255,0.08))'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <IconComp size={14} color={CATEGORY_COLORS[cat]} />
              <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? CATEGORY_COLORS[cat] : 'inherit' }}>
                {CATEGORY_TAGLISH[cat]}
              </span>
              <span style={{ fontSize: 11, background: 'var(--color-surface-elevated, rgba(0,0,0,0.06))', borderRadius: 20, padding: '1px 6px', color: 'var(--color-text-secondary, #475569)' }}>
                {categoryCounts[cat] ?? 0}
              </span>
            </div>
          );
        })}
      </div>

      {/* One-Row Filters */}
      <FilterToolbar>
        <FilterSearch
          placeholder="Maghanap sa talaan ng gawain..."
          value={search}
          onChange={setSearch}
        />
        <FilterSelect
          value={filterAnimal}
          onChange={setFilterAnimal}
          options={[
            { value: 'All', label: 'Lahat ng Hayop' },
            ...animalNames.map((n) => ({ value: n, label: n })),
          ]}
          ariaLabel="Salain ayon sa Hayop"
          minWidth={150}
        />
        <FilterDateRange
          fromValue={dateFrom}
          toValue={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
        {(filterCategory !== 'All' || filterAnimal !== 'All' || dateFrom || dateTo || search) && (
          <FilterResetButton
            onClick={() => {
              setFilterCategory('All');
              setFilterAnimal('All');
              setDateFrom('');
              setDateTo('');
              setSearch('');
            }}
          />
        )}
      </FilterToolbar>

      {/* Activity table */}
      <Card variant="glass" padding="none">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Activity size={32} />}
            title="Walang nahanap na gawain"
            description="Subukang baguhin ang mga filter o magtala ng bagong gawain sa bukid."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.08))', color: 'var(--color-text-secondary, #475569)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Petsa</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Kategorya</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Gawain / Aksyon</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Hayop</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Deskripsyon</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const IconComp = CATEGORY_ICON_COMPONENTS[e.category] ?? Activity;
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.04))' }}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary, #475569)', fontSize: 12 }}>
                        {formatDate(e.date)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: `${e.color}15`,
                          color: e.color,
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                        }}>
                          <IconComp size={11} />
                          {CATEGORY_TAGLISH[e.category]}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13 }}>{e.action}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-secondary, #475569)' }}>{e.animal ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-secondary, #475569)', maxWidth: 340 }}>{e.description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
