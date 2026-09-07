import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { FilterToolbar, FilterSelect, FilterSearch, FilterDateRange } from '../components/FilterToolbar';
import { inventoryStatus } from '../lib/analytics';
import { Printer, FileBarChart, Download, PawPrint, HeartPulse, Package, DollarSign } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

type ReportType =
  | 'animal'
  | 'health'
  | 'treatment'
  | 'breeding'
  | 'sales'
  | 'vaccination'
  | 'feed'
  | 'inventory'
  | 'ledger'
  | 'milk'
  | 'performance';

const REPORT_LABELS: Record<ReportType, string> = {
  animal: 'Ulat ng mga Hayop',
  health: 'Ulat sa Kalusugan',
  treatment: 'Ulat sa Gamot at Deworming',
  breeding: 'Ulat sa Pagpapalahi (Breeding)',
  sales: 'Ulat ng Pagbebenta (Animal Sales)',
  vaccination: 'Ulat sa Pagbabakuna',
  feed: 'Ulat sa Pakain',
  inventory: 'Ulat sa Imbentaryo (Balance)',
  ledger: 'Talaan ng Paggalaw ng Imbentaryo (Ledger)',
  milk: 'Ulat sa Produksyon ng Gatas',
  performance: 'Pangkalahatang Buod ng Bukid',
};

export function ReportsPage() {
  const farmData = useFarmData();
  const [reportType, setReportType] = useState<ReportType>('animal');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  const inDateRange = (date: string) => {
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    return true;
  };

  const reportData = useMemo(() => {
    const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Walang Pangalan';

    switch (reportType) {
      case 'animal':
        return activeAnimals
          .filter((a) => !search || (a.name ?? '').toLowerCase().includes(search.toLowerCase()) || a.tag_id.toLowerCase().includes(search.toLowerCase()))
          .map((a) => ({
            tag_id: a.tag_id,
            name: a.name || 'Walang Pangalan',
            species: a.species === 'Goat' ? 'Kambing' : 'Tupa',
            breed: a.breed || '—',
            sex: a.sex === 'Male' ? 'Lalaki' : 'Babae',
            health: a.health_status,
            weight: a.weight_kg ? `${a.weight_kg} kg` : '—',
            status: a.archived ? 'Archived' : 'Active / Kasalukuyan',
          }));
      case 'health':
        return farmData.healthRecords
          .filter((r) => inDateRange(r.record_date))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.record_date, animal: animalName(r.animal_id), temp: r.temperature, hr: r.heart_rate, risk: `${r.risk_level} (${r.risk_score})`, reasons: r.reasons || '—' }));
      case 'treatment':
        return farmData.healthRecords
          .filter((r) => inDateRange(r.record_date))
          .filter((r) => {
            const text = `${r.notes ?? ''} ${r.reasons ?? ''} ${r.recommendation ?? ''}`;
            return (
              text.includes('Gamot') ||
              text.includes('Deworming') ||
              text.includes('Medication') ||
              text.includes('Lunas')
            );
          })
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()) || (r.notes ?? '').toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({
            date: r.record_date,
            animal: animalName(r.animal_id),
            treatment: r.reasons || 'Gamot / Lunas',
            recommendation: r.recommendation || '—',
            notes: r.notes || '—',
          }));
      case 'breeding':
        return farmData.breedingRecords
          .filter((r) => inDateRange(r.mating_date))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.mating_date, animal: animalName(r.animal_id), expected: r.expected_kidding_date, status: r.status, notes: r.notes }));
      case 'sales':
        return (farmData.sales || [])
          .filter((s) => inDateRange(s.sale_date))
          .filter(
            (s) =>
              !search ||
              animalName(s.animal_id).toLowerCase().includes(search.toLowerCase()) ||
              (s.buyer_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
              (s.notes ?? '').toLowerCase().includes(search.toLowerCase())
          )
          .map((s) => {
            const an = farmData.animals.find((a) => a.id === s.animal_id);
            return {
              date: s.sale_date,
              tag_id: an?.tag_id || '—',
              animal: an?.name || 'Walang Pangalan',
              species: an?.species === 'Goat' ? 'Kambing' : an?.species === 'Sheep' ? 'Tupa' : '—',
              sold_weight: `${s.sold_weight} kg`,
              selling_price: `₱${s.selling_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              price_per_kg: s.price_per_kg ? `₱${s.price_per_kg.toFixed(2)}/kg` : '—',
              buyer: s.buyer_name || 'Hindi tinukoy',
              status: s.payment_status,
              amount_received: `₱${(s.amount_received || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              remaining_balance: `₱${(s.remaining_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            };
          });
      case 'vaccination':
        return farmData.vaccinations
          .filter((r) => inDateRange(r.date_given))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()) || r.vaccine_name.toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.date_given, animal: animalName(r.animal_id), vaccine: r.vaccine_name, nextDue: r.next_due_date, vet: r.veterinarian }));
      case 'feed':
        return farmData.feedRecords
          .filter((r) => inDateRange(r.record_date))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.record_date, animal: animalName(r.animal_id), type: r.feed_type, qty: r.quantity_kg, cost: r.cost }));
      case 'inventory':
        return farmData.inventory
          .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.category ?? '').toLowerCase().includes(search.toLowerCase()))
          .map((r) => {
            const txs = farmData.inventoryTransactions.filter((tx) => tx.inventory_item_id === r.id);
            const totalIn = txs.filter((tx) => tx.type === 'STOCK_IN' || tx.type === 'RETURN').reduce((s, tx) => s + (tx.quantity || 0), 0);
            const totalOut = txs.filter((tx) => tx.type === 'CONSUMPTION').reduce((s, tx) => s + (tx.quantity || 0), 0);
            return {
              name: r.name,
              category: r.category,
              current_balance: `${r.quantity} ${r.unit}`,
              total_in: `${totalIn} ${r.unit}`,
              total_consumed: `${totalOut} ${r.unit}`,
              min: r.minimum_stock ? `${r.minimum_stock} ${r.unit}` : '—',
              cost_per_unit: r.cost ? `₱${r.cost}` : '—',
              expiry: r.expiry_date || 'Walang Expiry',
              status: inventoryStatus(r, farmData.settings?.expiry_warning_days ?? 15).label,
            };
          });
      case 'ledger':
        return farmData.inventoryTransactions
          .filter((tx) => !tx.created_at || inDateRange(tx.created_at.split('T')[0]))
          .filter((tx) => {
            const itemName = farmData.inventory.find((i) => i.id === tx.inventory_item_id)?.name ?? 'Kagamitan';
            return !search || itemName.toLowerCase().includes(search.toLowerCase()) || (tx.reason ?? '').toLowerCase().includes(search.toLowerCase()) || (tx.notes ?? '').toLowerCase().includes(search.toLowerCase());
          })
          .map((tx) => {
            const item = farmData.inventory.find((i) => i.id === tx.inventory_item_id);
            const itemName = item?.name ?? 'Kagamitan';
            const unit = tx.unit || item?.unit || '';
            const typeLabel =
              tx.type === 'STOCK_IN'
                ? 'Pasok (Stock In)'
                : tx.type === 'CONSUMPTION'
                ? 'Nagamit (Consumption)'
                : tx.type === 'ADJUSTMENT_IN' || tx.type === 'ADJUSTMENT_OUT'
                ? 'Pagwawasto (Adjustment)'
                : tx.type === 'REMOVAL'
                ? 'Tinatanggal (Removal)'
                : tx.type === 'RETURN'
                ? 'Binalik (Return)'
                : tx.type;
            return {
              date: tx.created_at ? tx.created_at.split('T')[0] : '—',
              item: itemName,
              type: typeLabel,
              qty: `${tx.quantity} ${unit}`,
              previous_stock: `${tx.previous_stock ?? '—'} ${unit}`,
              new_stock: `${tx.new_stock ?? '—'} ${unit}`,
              reason: tx.reason || '—',
              notes: tx.notes || '—',
            };
          });
      case 'milk':
        return farmData.milkRecords
          .filter((r) => inDateRange(r.record_date))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.record_date, animal: animalName(r.animal_id), yield: r.yield_litres, notes: r.notes }));
      case 'performance': {
        const totalAnimals = activeAnimals.length;
        const healthy = activeAnimals.filter((a) => a.health_status === 'Healthy').length;
        const atRisk = activeAnimals.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical').length;
        const pregnant = activeAnimals.filter((a) => a.breeding_status === 'Pregnant').length;
        const avgWeight = activeAnimals.length > 0 ? +(activeAnimals.reduce((s, a) => s + (Number(a.weight_kg) || 0), 0) / activeAnimals.length).toFixed(1) : 0;
        const overdueVacc = activeAnimals.filter((a) => a.vaccination_status === 'Overdue').length;
        const lowStock = farmData.inventory.filter((i) => inventoryStatus(i, farmData.settings?.expiry_warning_days ?? 15).status === 'Low Stock').length;
        return [
          { metric: 'Kabuuang Hayop (Total Animals)', value: totalAnimals },
          { metric: 'Malulusog na Hayop (Healthy)', value: healthy },
          { metric: 'May Panganib sa Kalusugan (At Risk)', value: atRisk },
          { metric: 'Buntis na Hayop (Pregnant)', value: pregnant },
          { metric: 'Katamtamang Timbang / Average Weight (kg)', value: avgWeight },
          { metric: 'Lampas sa Iskedyul ng Bakuna (Overdue)', value: overdueVacc },
          { metric: 'Mababang Stock na Gamit (Low Stock)', value: lowStock },
          { metric: 'Kabuuang Gamit sa Imbentaryo', value: farmData.inventory.length },
        ];
      }
      default:
        return [];
    }
  }, [reportType, dateFrom, dateTo, search, farmData, activeAnimals]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (reportData.length === 0) return;
    const headers = Object.keys(reportData[0] as Record<string, unknown>);
    const rows = reportData.map((r) => headers.map((h) => String((r as Record<string, unknown>)[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportType}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const headers = reportData.length > 0 ? Object.keys(reportData[0] as Record<string, unknown>) : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Mga Ulat</h1>
          <p style={{ color: 'var(--color-text-secondary, #475569)', fontSize: 13, marginTop: 4 }}>
            Pangkalahatang ulat at talaan ng bukid para sa pagsusuri at pag-export
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="secondary"
            onClick={handleExportCSV}
            disabled={reportData.length === 0}
            leftIcon={<Download size={16} />}
          >
            I-download (CSV)
          </Button>
          <Button
            variant="primary"
            onClick={handlePrint}
            disabled={reportData.length === 0}
            leftIcon={<Printer size={16} />}
          >
            I-print
          </Button>
        </div>
      </div>

      {/* 3-Column Summary Cards: Animals | Health | Inventory */}
      <div className="mobile-stats-grid-3" style={{ marginBottom: 16 }}>
        {/* Animals */}
        <div
          onClick={() => setReportType('animal')}
          className="stat-card"
          style={{
            cursor: 'pointer',
            border: reportType === 'animal' ? '2px solid #238B45' : undefined,
          }}
        >
          <div className="alpas-stat-header">
            <span className="stat-card-label" style={{ fontWeight: 700 }}>
              Mga Hayop
            </span>
            <div className="stat-card-icon green" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PawPrint size={15} />
            </div>
          </div>
          <div>
            <div className="stat-card-value">
              {activeAnimals.length}
            </div>
            <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
              Talaan ng hayop
            </div>
          </div>
        </div>

        {/* Health */}
        <div
          onClick={() => setReportType('health')}
          className="stat-card"
          style={{
            cursor: 'pointer',
            border: reportType === 'health' ? '2px solid #238B45' : undefined,
          }}
        >
          <div className="alpas-stat-header">
            <span className="stat-card-label" style={{ fontWeight: 700 }}>
              Kalusugan
            </span>
            <div className="stat-card-icon green" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HeartPulse size={15} />
            </div>
          </div>
          <div>
            <div className="stat-card-value">
              {farmData.healthRecords.length}
            </div>
            <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
              Talaan ng kalusugan
            </div>
          </div>
        </div>

        {/* Inventory */}
        <div
          onClick={() => setReportType('inventory')}
          className="stat-card"
          style={{
            cursor: 'pointer',
            border: reportType === 'inventory' ? '2px solid #238B45' : undefined,
          }}
        >
          <div className="alpas-stat-header">
            <span className="stat-card-label" style={{ fontWeight: 700 }}>
              Imbentaryo
            </span>
            <div className="stat-card-icon green" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={15} />
            </div>
          </div>
          <div>
            <div className="stat-card-value">
              {farmData.inventory.length}
            </div>
            <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
              Talaan ng gamit
            </div>
          </div>
        </div>

        {/* Sales */}
        <div
          onClick={() => setReportType('sales')}
          className="stat-card"
          style={{
            cursor: 'pointer',
            border: reportType === 'sales' ? '2px solid #238B45' : undefined,
          }}
        >
          <div className="alpas-stat-header">
            <span className="stat-card-label" style={{ fontWeight: 700 }}>
              Benta ng Hayop
            </span>
            <div className="stat-card-icon green" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={15} />
            </div>
          </div>
          <div>
            <div className="stat-card-value">
              {(farmData.sales || []).length}
            </div>
            <div className="alpas-stat-footer" style={{ color: 'var(--color-text-muted)' }}>
              Naibentang hayop
            </div>
          </div>
        </div>
      </div>

      <FilterToolbar>
        <FilterSelect
          value={reportType}
          onChange={(val) => setReportType(val as ReportType)}
          options={Object.entries(REPORT_LABELS).map(([k, v]) => ({ value: k, label: v }))}
          ariaLabel="Select Report Type"
          minWidth={200}
        />
        <FilterDateRange
          fromValue={dateFrom}
          toValue={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
        <FilterSearch
          placeholder="Maghanap ng record..."
          value={search}
          onChange={setSearch}
        />
      </FilterToolbar>

      <Card variant="glass" padding="none">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.08))' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{REPORT_LABELS[reportType]}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #475569)', marginTop: 2 }}>{reportData.length} talaan</div>
          </div>
          <FileBarChart size={20} color="var(--color-text-secondary, #475569)" />
        </div>
        {reportData.length === 0 ? (
          <EmptyState
            icon={<FileBarChart size={32} />}
            title="Walang datos para sa ulat na ito"
            description="Subukang baguhin ang mga filter o magdagdag ng mga bagong talaan."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.08))', color: 'var(--color-text-secondary, #475569)' }}>
                  {headers.map((h) => {
                    const colMap: Record<string, string> = {
                      tag_id: 'Animal ID',
                      name: 'Pangalan',
                      species: 'Species',
                      breed: 'Breed',
                      sex: 'Kasarian',
                      health: 'Health Status',
                      weight: 'Timbang',
                      status: 'Status',
                      date: 'Petsa',
                      animal: 'Hayop',
                      temp: 'Temperatura (°C)',
                      hr: 'Heart Rate',
                      risk: 'Risk Level',
                      reasons: 'Dahilan',
                      expected: 'Inaasahang Panganganak',
                      notes: 'Mga Tala',
                      change: 'Pagbabago',
                      gain: 'Arawang Dagdag (kg)',
                      vaccine: 'Pangalan ng Bakuna',
                      nextDue: 'Susunod na Iskedyul',
                      vet: 'Beterinaryo',
                      category: 'Kategorya',
                      qty: 'Dami',
                      unit: 'Yunit',
                      min: 'Min Stock',
                      expiry: 'Expiry Date',
                      type: 'Uri',
                      cost: 'Halaga',
                      yield: 'Dami ng Gatas (L)',
                      metric: 'Sukat / Parameter',
                      value: 'Bilang / Halaga',
                      treatment: 'Gamot / Lunas',
                      recommendation: 'Dalas / Tagubilin',
                      item: 'Kagamitan',
                      previous_stock: 'Dating Stock',
                      new_stock: 'Bagong Stock',
                      current_balance: 'Kasalukuyang Stock',
                      total_in: 'Kabuuang Pumasok',
                      total_consumed: 'Kabuuang Nagamit',
                      cost_per_unit: 'Presyo bawat Yunit',
                      reason: 'Dahilan',
                      sold_weight: 'Timbang Bago Ibenta',
                      selling_price: 'Presyo ng Benta',
                      price_per_kg: 'Presyo / kg',
                      buyer: 'Bumibili',
                      amount_received: 'Halagang Natanggap',
                      remaining_balance: 'Natitirang Balanse',
                    };
                    const colName = colMap[h] || (h.charAt(0).toUpperCase() + h.slice(1));
                    return (
                      <th key={h} style={{ padding: '12px 16px', fontWeight: 600 }}>{colName}</th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.04))' }}>
                    {headers.map((h) => {
                      const val = (row as Record<string, unknown>)[h];
                      return <td key={h} style={{ padding: '12px 16px' }}>{val === null || val === undefined ? '—' : String(val)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
