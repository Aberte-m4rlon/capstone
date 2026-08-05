import { useState, useMemo } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { Icons } from '../lib/icons';
import { inventoryStatus, formatDate, calculateGrowth, vaccinationStatusFromDue } from '../lib/analytics';
import { Printer, FileBarChart } from 'lucide-react';

type ReportType = 'health' | 'breeding' | 'weight' | 'vaccination' | 'inventory' | 'feed' | 'milk' | 'performance';

const REPORT_LABELS: Record<ReportType, string> = {
  health: 'Animal Health Report',
  breeding: 'Breeding Report',
  weight: 'Weight Growth Report',
  vaccination: 'Vaccination Report',
  inventory: 'Inventory Report',
  feed: 'Feed Report',
  milk: 'Milk Production Report',
  performance: 'Farm Performance Report',
};

export function ReportsPage() {
  const farmData = useFarmData();
  const [reportType, setReportType] = useState<ReportType>('health');
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
    const animalName = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown';

    switch (reportType) {
      case 'health':
        return farmData.healthRecords
          .filter((r) => inDateRange(r.record_date))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.record_date, animal: animalName(r.animal_id), temp: r.temperature, hr: r.heart_rate, risk: `${r.risk_level} (${r.risk_score})`, reasons: r.reasons }));
      case 'breeding':
        return farmData.breedingRecords
          .filter((r) => inDateRange(r.mating_date))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.mating_date, animal: animalName(r.animal_id), expected: r.expected_kidding_date, status: r.status, notes: r.notes }));
      case 'weight':
        return farmData.weightRecords
          .filter((r) => inDateRange(r.record_date))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.record_date, animal: animalName(r.animal_id), weight: r.weight_kg, change: r.weight_change_kg, gain: r.daily_gain_kg }));
      case 'vaccination':
        return farmData.vaccinations
          .filter((r) => inDateRange(r.date_given))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()) || r.vaccine_name.toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.date_given, animal: animalName(r.animal_id), vaccine: r.vaccine_name, nextDue: r.next_due_date, vet: r.veterinarian }));
      case 'inventory':
        return farmData.inventory
          .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ name: r.name, category: r.category, qty: r.quantity, unit: r.unit, min: r.minimum_stock, expiry: r.expiry_date, status: inventoryStatus(r, farmData.settings?.expiry_warning_days ?? 15).label }));
      case 'feed':
        return farmData.feedRecords
          .filter((r) => inDateRange(r.record_date))
          .filter((r) => !search || animalName(r.animal_id).toLowerCase().includes(search.toLowerCase()))
          .map((r) => ({ date: r.record_date, animal: animalName(r.animal_id), type: r.feed_type, qty: r.quantity_kg, cost: r.cost }));
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
          { metric: 'Total Animals', value: totalAnimals },
          { metric: 'Healthy Animals', value: healthy },
          { metric: 'At Risk Animals', value: atRisk },
          { metric: 'Pregnant Animals', value: pregnant },
          { metric: 'Average Weight (kg)', value: avgWeight },
          { metric: 'Overdue Vaccinations', value: overdueVacc },
          { metric: 'Low Stock Items', value: lowStock },
          { metric: 'Total Inventory Items', value: farmData.inventory.length },
        ];
      }
      default:
        return [];
    }
  }, [reportType, dateFrom, dateTo, search, farmData]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Reports</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Generate and export farm reports</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleExportCSV} disabled={reportData.length === 0}>
            <Icons.Download size={16} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={handlePrint} disabled={reportData.length === 0}>
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-select" value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
          {Object.entries(REPORT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
        <input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
        <input className="form-input" style={{ width: 200 }} placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{REPORT_LABELS[reportType]}</div>
            <div className="card-subtitle">{reportData.length} records</div>
          </div>
          <FileBarChart size={20} color="var(--text-secondary)" />
        </div>
        {reportData.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon"><Icons.FileBarChart size={24} /></div>
            <h4>No data for this report</h4>
            <p>Try adjusting filters or add records.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>{headers.map((h) => <th key={h}>{h.charAt(0).toUpperCase() + h.slice(1)}</th>)}</tr>
              </thead>
              <tbody>
                {reportData.map((row, i) => (
                  <tr key={i}>
                    {headers.map((h) => {
                      const val = (row as Record<string, unknown>)[h];
                      return <td key={h}>{val === null || val === undefined ? '—' : String(val)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
