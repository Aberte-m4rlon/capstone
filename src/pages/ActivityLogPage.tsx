import { useMemo, useState } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { formatDate } from '../lib/analytics';
import { Icons } from '../lib/icons';
import { Download, Printer, Filter } from 'lucide-react';

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

const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  Animal:      '#7C3AED',
  Health:      '#EF4444',
  Weight:      '#3B82F6',
  Breeding:    '#EC4899',
  Vaccination: '#10B981',
  Feed:        '#F59E0B',
  Milk:        '#06B6D4',
  Inventory:   '#6B7280',
};

const CATEGORY_ICONS: Record<ActivityCategory, string> = {
  Animal:      'PawPrint',
  Health:      'HeartPulse',
  Weight:      'Scale',
  Breeding:    'Heart',
  Vaccination: 'Syringe',
  Feed:        'Wheat',
  Milk:        'Milk',
  Inventory:   'Package',
};

export function ActivityLogPage() {
  const farmData = useFarmData();
  const [filterCategory, setFilterCategory] = useState<'All' | ActivityCategory>('All');
  const [filterAnimal, setFilterAnimal] = useState('All');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  // ── Build activity log from all records ─────────────────────────────────────
  const allActivities = useMemo((): ActivityEntry[] => {
    const entries: ActivityEntry[] = [];
    const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown';

    // Animals
    farmData.animals.forEach((a) => {
      entries.push({
        id: `animal-${a.id}`,
        date: a.created_at.split('T')[0],
        category: 'Animal',
        action: a.archived ? 'Animal Archived' : 'Animal Added',
        description: `${a.name} (${a.tag_id}) — ${a.species}, ${a.sex}${a.breed ? `, ${a.breed}` : ''}`,
        animal: a.name,
        icon: 'PawPrint',
        color: CATEGORY_COLORS.Animal,
      });
    });

    // Health records
    farmData.healthRecords.forEach((r) => {
      entries.push({
        id: `health-${r.id}`,
        date: r.record_date,
        category: 'Health',
        action: 'Health Check Recorded',
        description: `${animalName(r.animal_id)} — Risk: ${r.risk_level} (${r.risk_score})${r.reasons ? ` · ${r.reasons.split(';')[0].trim()}` : ''}`,
        animal: animalName(r.animal_id),
        icon: 'HeartPulse',
        color: r.risk_level === 'Critical' ? '#EF4444' : r.risk_level === 'High' ? '#F97316' : r.risk_level === 'Moderate' ? '#F59E0B' : '#10B981',
      });
    });

    // Weight records
    farmData.weightRecords.forEach((r) => {
      entries.push({
        id: `weight-${r.id}`,
        date: r.record_date,
        category: 'Weight',
        action: 'Weight Recorded',
        description: `${animalName(r.animal_id)} — ${r.weight_kg} kg${r.weight_change_kg !== null ? ` (${r.weight_change_kg > 0 ? '+' : ''}${r.weight_change_kg} kg change)` : ''}`,
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
        action: 'Breeding Record Added',
        description: `${female}${partner ? ` × ${partner}` : ''} — Status: ${r.status}${r.expected_kidding_date ? ` · Expected kidding: ${formatDate(r.expected_kidding_date)}` : ''}`,
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
        action: 'Vaccination Given',
        description: `${animalName(v.animal_id)} — ${v.vaccine_name}${v.veterinarian ? ` · By: ${v.veterinarian}` : ''}${v.next_due_date ? ` · Next due: ${formatDate(v.next_due_date)}` : ''}`,
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
        action: 'Feed Recorded',
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
        action: 'Milk Yield Recorded',
        description: `${animalName(m.animal_id)} — ${m.yield_litres} litres`,
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
        action: 'Inventory Item Added',
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
    return <div className="loading-center"><div className="spinner" /></div>;
  }

  const CATEGORIES: ActivityCategory[] = ['Animal', 'Health', 'Weight', 'Breeding', 'Vaccination', 'Feed', 'Milk', 'Inventory'];
  const animalNames = [...new Set(allActivities.map((e) => e.animal).filter(Boolean))].sort();

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Activity Log</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {filtered.length} of {allActivities.length} activities · All farm actions in one place
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleDownloadCSV}>
            <Download size={15} /> Download CSV
          </button>
          <button className="btn btn-primary" onClick={handlePrint}>
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {CATEGORIES.map((cat) => {
          const Icon = Icons[CATEGORY_ICONS[cat] as keyof typeof Icons] ?? Icons.Activity;
          return (
            <div
              key={cat}
              onClick={() => setFilterCategory(filterCategory === cat ? 'All' : cat)}
              style={{
                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                background: filterCategory === cat ? `${CATEGORY_COLORS[cat]}15` : 'var(--card)',
                border: `1.5px solid ${filterCategory === cat ? CATEGORY_COLORS[cat] : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <Icon size={14} color={CATEGORY_COLORS[cat]} />
              <span style={{ fontSize: 12, fontWeight: 600, color: filterCategory === cat ? CATEGORY_COLORS[cat] : 'var(--text)' }}>
                {cat}
              </span>
              <span style={{ fontSize: 11, background: 'var(--bg)', borderRadius: 20, padding: '1px 6px', color: 'var(--text-secondary)' }}>
                {categoryCounts[cat] ?? 0}
              </span>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ width: 200 }}
          placeholder="Search activities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select" value={filterAnimal} onChange={(e) => setFilterAnimal(e.target.value)}>
          <option value="All">All Animals</option>
          {animalNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} color="var(--text-secondary)" />
          <input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 140 }} title="From date" />
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>to</span>
          <input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: 140 }} title="To date" />
        </div>
        {(filterCategory !== 'All' || filterAnimal !== 'All' || dateFrom || dateTo || search) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterCategory('All'); setFilterAnimal('All'); setDateFrom(''); setDateTo(''); setSearch(''); }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Activity table */}
      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.Activity size={24} /></div>
            <h4>No activities found</h4>
            <p>Try adjusting your filters or add some farm records.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Action</th>
                  <th>Animal</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const Icon = Icons[e.icon as keyof typeof Icons] ?? Icons.Activity;
                  return (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {formatDate(e.date)}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: `${e.color}15`, color: e.color,
                          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        }}>
                          <Icon size={11} />
                          {e.category}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{e.action}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.animal ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 340 }}>{e.description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
