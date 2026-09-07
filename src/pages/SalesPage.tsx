import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DollarSign,
  Scale,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  User,
  Phone,
  FileText,
  X,
  ChevronRight,
  TrendingUp,
  Receipt,
  Info,
  Check,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useFarmData } from '../lib/useFarmData';
import {
  calculateSalesMetrics,
  calculatePricePerKg,
  recordAnimalSale,
} from '../lib/sales';
import type { Animal, AnimalSale, PaymentStatus } from '../types';
import toast from 'react-hot-toast';

export function SalesPage() {
  const { user, role } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const { animals, sales, refresh, loading } = useFarmData();
  const location = useLocation();

  // Modal states
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<AnimalSale | null>(null);

  // Form states for selling
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('');
  const [soldWeight, setSoldWeight] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [buyerName, setBuyerName] = useState<string>('');
  const [buyerContact, setBuyerContact] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Bayad na');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [saleDate, setSaleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [formStep, setFormStep] = useState<'input' | 'confirm'>('input');
  const [submitting, setSubmitting] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Check URL query parameter ?action=add to auto-open modal
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'add') {
      setIsSellModalOpen(true);
    }
  }, [location.search]);

  // Active animals available for sale (belonging to current user and not archived)
  const availableAnimals = useMemo(() => {
    return animals.filter((a) => !a.archived);
  }, [animals]);

  // Selected animal object
  const selectedAnimal = useMemo(() => {
    return availableAnimals.find((a) => a.id === selectedAnimalId) || null;
  }, [availableAnimals, selectedAnimalId]);

  // Auto-calculated price per kg
  const calculatedPricePerKg = useMemo(() => {
    const p = parseFloat(sellingPrice);
    const w = parseFloat(soldWeight);
    return calculatePricePerKg(p, w);
  }, [sellingPrice, soldWeight]);

  // Calculated remaining balance in form
  const remainingBalance = useMemo(() => {
    const price = parseFloat(sellingPrice) || 0;
    if (paymentStatus === 'Bayad na') return 0;
    const received = parseFloat(amountReceived) || 0;
    return Math.max(0, price - received);
  }, [sellingPrice, amountReceived, paymentStatus]);

  // User-scoped sales records
  const userSales = useMemo(() => {
    return sales;
  }, [sales]);

  // Summary Metrics
  const metrics = useMemo(() => {
    return calculateSalesMetrics(userSales);
  }, [userSales]);

  // Filtered sales records for the table
  const filteredSales = useMemo(() => {
    return userSales.filter((s) => {
      // Search filter
      const matchesSearch =
        searchQuery === '' ||
        s.animal_tag_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.animal_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.buyer_name && s.buyer_name.toLowerCase().includes(searchQuery.toLowerCase()));

      // Species filter
      const matchesSpecies = speciesFilter === 'all' || s.species === speciesFilter;

      // Payment filter
      const matchesPayment = paymentFilter === 'all' || s.payment_status === paymentFilter;

      return matchesSearch && matchesSpecies && matchesPayment;
    });
  }, [userSales, searchQuery, speciesFilter, paymentFilter]);

  // Reset selling form
  const resetForm = () => {
    setSelectedAnimalId('');
    setSoldWeight('');
    setSellingPrice('');
    setBuyerName('');
    setBuyerContact('');
    setPaymentStatus('Bayad na');
    setAmountReceived('');
    setSaleDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setFormStep('input');
    setSubmitting(false);
  };

  const handleOpenModal = () => {
    resetForm();
    setIsSellModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsSellModalOpen(false);
    resetForm();
  };

  // Pre-validate before moving to confirmation step
  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnimal) {
      toast.error('Pumili muna ng hayop na ibebenta.');
      return;
    }
    const weightNum = parseFloat(soldWeight);
    if (isNaN(weightNum) || weightNum <= 0) {
      toast.error('Kailangang timbangin muna ang hayop bago ito maibenta. Ilagay ang wastong timbang (kg).');
      return;
    }
    const priceNum = parseFloat(sellingPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error('Ilagay ang wastong presyo ng pagbebenta (₱).');
      return;
    }
    setFormStep('confirm');
  };

  // Submit and record sale
  const handleConfirmSale = async () => {
    if (!user || !selectedAnimal) return;
    setSubmitting(true);

    const weightNum = parseFloat(soldWeight);
    const priceNum = parseFloat(sellingPrice);
    const receivedNum = paymentStatus === 'Bayad na'
      ? priceNum
      : parseFloat(amountReceived) || 0;

    const res = await recordAnimalSale({
      userId: user.id,
      isSuperAdmin,
      animal: selectedAnimal,
      soldWeight: weightNum,
      sellingPrice: priceNum,
      buyerName,
      buyerContact,
      paymentStatus,
      amountReceived: receivedNum,
      saleDate,
      notes,
    });

    setSubmitting(false);

    if (res.success) {
      toast.success(`Matagumpay na naibenta ang ${selectedAnimal.tag_id} (${selectedAnimal.name || 'Hayop'})!`);
      handleCloseModal();
      await refresh();
    } else {
      toast.error(res.error || 'Nagkaroon ng problema sa pagtatala ng benta.');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="text-emerald-700" size={28} />
            Benta ng Hayop
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Pamahalaan ang pagbebenta ng mga alagang hayop, kailangang timbang bago ibenta, at kita ng bukid.
          </p>
        </div>
        <button
          onClick={handleOpenModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus size={18} />
          Magbenta ng Hayop
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Total Animals Sold */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Mga Nabentang Hayop</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{metrics.totalSold}</div>
            <div className="text-xs text-gray-500 mt-1">Kabuuang bilang na naibenta</div>
          </div>
        </div>

        {/* Card 2: Total Money Received */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total na Natanggap</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <DollarSign size={18} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-700">
              ₱{metrics.totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-gray-500 mt-1">Aktwal na salaping natanggap</div>
          </div>
        </div>

        {/* Card 3: Total Weight Sold */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Kabuuang Timbang</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <Scale size={18} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{metrics.totalWeight} kg</div>
            <div className="text-xs text-gray-500 mt-1">Timbang bago ibenta</div>
          </div>
        </div>

        {/* Card 4: Average Price per KG */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Average Presyo / Kilo</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <TrendingUp size={18} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              ₱{metrics.avgPricePerKg.toFixed(2)}
              <span className="text-xs font-normal text-gray-500 ml-1">/ kg</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">Average presyo bawat kilo</div>
          </div>
        </div>
      </div>

      {/* Alert Card if there is Remaining Balance */}
      {metrics.totalRemainingBalance > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3 text-amber-900">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-600 shrink-0" size={20} />
            <div>
              <span className="font-semibold text-sm">May mga benta na hindi pa buo ang bayad: </span>
              <span className="text-sm">Kabuuang balanse na dapat kubrahin ay </span>
              <span className="font-bold text-amber-800">
                ₱{metrics.totalRemainingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <button
            onClick={() => setPaymentFilter('May Kulang')}
            className="text-xs font-semibold text-amber-800 underline hover:text-amber-950 shrink-0"
          >
            Tingnan ang may kulang
          </button>
        </div>
      )}

      {/* ── Search & Filter Bar ── */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 md:space-y-0 md:flex md:items-center md:justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Hanapin ayon sa Tag ID, Pangalan, o Bumibili..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Species */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:inline">Uri:</span>
            <select
              value={speciesFilter}
              onChange={(e) => setSpeciesFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Lahat ng Uri</option>
              <option value="Goat">Kambing</option>
              <option value="Sheep">Tupa</option>
            </select>
          </div>

          {/* Payment Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:inline">Bayad:</span>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Lahat ng Status</option>
              <option value="Bayad na">Bayad na</option>
              <option value="May Kulang">May Kulang</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Sales Records Table / List ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="font-semibold text-gray-900 text-sm">
            Kasaysayan ng Pagbebenta ({filteredSales.length})
          </div>
          {filteredSales.length > 0 && (
            <div className="text-xs text-gray-500">
              Kabuuang Halaga: ₱{filteredSales.reduce((sum, s) => sum + s.selling_price, 0).toLocaleString()}
            </div>
          )}
        </div>

        {filteredSales.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400 mb-3">
              <Receipt size={24} />
            </div>
            <h3 className="text-base font-semibold text-gray-800">Walang natagpuang tala ng benta</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
              {searchQuery || speciesFilter !== 'all' || paymentFilter !== 'all'
                ? 'Walang tumutugma sa iyong filter o hinahanap.'
                : 'Wala pang naitalang benta ng alagang hayop sa iyong bukid.'}
            </p>
            {userSales.length === 0 && (
              <button
                onClick={handleOpenModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 text-white text-xs font-medium rounded-lg hover:bg-emerald-800 transition-colors"
              >
                <Plus size={15} />
                Magbenta ng Unang Hayop
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-700">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Hayop</th>
                    <th className="px-4 py-3">Timbang</th>
                    <th className="px-4 py-3">Presyo</th>
                    <th className="px-4 py-3">Presyo/kg</th>
                    <th className="px-4 py-3">Bumibili</th>
                    <th className="px-4 py-3">Petsa</th>
                    <th className="px-4 py-3">Katayuan</th>
                    <th className="px-4 py-3 text-right">Aksyon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{sale.animal_tag_id}</div>
                        <div className="text-xs text-gray-500">
                          {sale.animal_name} • {sale.species === 'Goat' ? 'Kambing' : sale.species === 'Sheep' ? 'Tupa' : sale.species}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {sale.sold_weight} kg
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-800">
                        ₱{sale.selling_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {sale.price_per_kg ? `₱${sale.price_per_kg.toFixed(2)}/kg` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900 font-medium">{sale.buyer_name || 'Hindi tinukoy'}</div>
                        {sale.buyer_contact && (
                          <div className="text-xs text-gray-500">{sale.buyer_contact}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {new Date(sale.sale_date).toLocaleDateString('fil-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {sale.payment_status === 'Bayad na' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            <CheckCircle2 size={12} />
                            Bayad na
                          </span>
                        )}
                        {sale.payment_status === 'May Kulang' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Clock size={12} />
                            Kulang: ₱{sale.remaining_balance.toLocaleString()}
                          </span>
                        )}
                        {sale.payment_status === 'Pending' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                            <AlertCircle size={12} />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedSaleDetail(sale)}
                          className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                        >
                          Tingnan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Card View */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredSales.map((sale) => (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSaleDetail(sale)}
                  className="p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold text-gray-900 text-base">{sale.animal_tag_id}</div>
                      <div className="text-xs text-gray-500">
                        {sale.animal_name} • {sale.species === 'Goat' ? 'Kambing' : 'Tupa'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-800 text-base">
                        ₱{sale.selling_price.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">{sale.sold_weight} kg</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-600 mt-2 pt-2 border-t border-gray-50">
                    <div className="truncate max-w-[180px]">
                      {sale.buyer_name ? `Bumibili: ${sale.buyer_name}` : 'Bumibili: Hindi tinukoy'}
                    </div>
                    <div>
                      {sale.payment_status === 'Bayad na' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800">
                          Bayad na
                        </span>
                      )}
                      {sale.payment_status === 'May Kulang' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
                          Kulang: ₱{sale.remaining_balance.toLocaleString()}
                        </span>
                      )}
                      {sale.payment_status === 'Pending' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-800">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── SELLING MODAL (+ Magbenta ng Hayop) ── */}
      {isSellModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-emerald-800 text-white">
              <div className="flex items-center gap-2">
                <DollarSign size={20} />
                <h3 className="font-semibold text-base">
                  {formStep === 'input' ? 'Magbenta ng Hayop' : 'Kumpirmahin ang Pagbebenta'}
                </h3>
              </div>
              <button
                onClick={handleCloseModal}
                disabled={submitting}
                className="text-white/80 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {formStep === 'input' ? (
                <form id="sellForm" onSubmit={handleProceedToConfirm} className="space-y-4">
                  {/* Step 1: Select Animal */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                      Pumili ng Hayop na Ibebenta <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedAnimalId}
                      onChange={(e) => {
                        setSelectedAnimalId(e.target.value);
                        const a = availableAnimals.find((x) => x.id === e.target.value);
                        if (a && a.weight_kg) {
                          setSoldWeight(String(a.weight_kg));
                        } else {
                          setSoldWeight('');
                        }
                      }}
                      required
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Pumili sa aktibong mga hayop --</option>
                      {availableAnimals.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.tag_id} — {a.name || 'Walang pangalan'} ({a.species === 'Goat' ? 'Kambing' : 'Tupa'})
                          {a.weight_kg ? ` [Dating timbang: ${a.weight_kg}kg]` : ''}
                        </option>
                      ))}
                    </select>
                    {availableAnimals.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        Walang aktibong hayop na magagamit para ibenta sa kasalukuyan.
                      </p>
                    )}
                  </div>

                  {/* Animal Preview Card */}
                  {selectedAnimal && (
                    <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-3 text-xs text-emerald-950 space-y-1">
                      <div className="font-semibold text-emerald-900 text-sm">
                        {selectedAnimal.tag_id} ({selectedAnimal.name || 'Hayop'})
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-gray-600 pt-1">
                        <div>Uri: <span className="font-medium text-gray-800">{selectedAnimal.species}</span></div>
                        <div>Kasarian: <span className="font-medium text-gray-800">{selectedAnimal.sex}</span></div>
                        <div>Breed: <span className="font-medium text-gray-800">{selectedAnimal.breed || 'N/A'}</span></div>
                        <div>Huling Timbang: <span className="font-medium text-gray-800">{selectedAnimal.weight_kg ? `${selectedAnimal.weight_kg} kg` : 'Wala pa'}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Weight Before Sale (MANDATORY) */}
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Scale size={15} className="text-emerald-700" />
                        Timbang Bago Ibenta (kg) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        REQUIRED
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        placeholder="Halimbawa: 45.5"
                        value={soldWeight}
                        onChange={(e) => setSoldWeight(e.target.value)}
                        required
                        className="w-full pl-3 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">
                        kg
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 flex items-center gap-1">
                      <Info size={12} className="text-emerald-700 shrink-0" />
                      Kailangang timbangin muna ang hayop bago ito maibenta.
                    </p>
                  </div>

                  {/* Step 3: Selling Price (MANDATORY) */}
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                        <DollarSign size={15} className="text-emerald-700" />
                        Presyo ng Pagbebenta (₱) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        REQUIRED
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500">
                        ₱
                      </span>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="Halimbawa: 6500"
                        value={sellingPrice}
                        onChange={(e) => {
                          setSellingPrice(e.target.value);
                          if (paymentStatus === 'Bayad na') {
                            setAmountReceived(e.target.value);
                          }
                        }}
                        required
                        className="w-full pl-8 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Step 4: Auto Reference Price per KG */}
                    {calculatedPricePerKg !== null && (
                      <div className="bg-emerald-50 text-emerald-900 p-2.5 rounded-lg text-xs flex items-center justify-between">
                        <span className="text-gray-600 font-medium">Reference kalkulasyon:</span>
                        <span className="font-bold text-emerald-800">
                          ₱{calculatedPricePerKg.toFixed(2)} bawat kilo
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Step 5: Buyer Details (Optional) */}
                  <div className="space-y-3 pt-1">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Impormasyon ng Bumibili (Opsyonal)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Pangalan ng Bumibili</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                          <input
                            type="text"
                            placeholder="Hal. Juan Dela Cruz"
                            value={buyerName}
                            onChange={(e) => setBuyerName(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Contact Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                          <input
                            type="text"
                            placeholder="0917-xxx-xxxx"
                            value={buyerContact}
                            onChange={(e) => setBuyerContact(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 6: Payment Status & Tracking */}
                  <div className="space-y-3 pt-1 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Katayuan ng Bayad
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Bayad na', 'May Kulang', 'Pending'] as PaymentStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            setPaymentStatus(st);
                            if (st === 'Bayad na') {
                              setAmountReceived(sellingPrice);
                            } else if (st === 'Pending') {
                              setAmountReceived('0');
                            }
                          }}
                          className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all ${
                            paymentStatus === st
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-bold'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {paymentStatus === 'May Kulang' && (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Natanggap na Halaga (₱)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Hal. 3000"
                            value={amountReceived}
                            onChange={(e) => setAmountReceived(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Natitirang Balanse</label>
                          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-800">
                            ₱{remainingBalance.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sale Date & Notes */}
                  <div className="space-y-2 pt-1 border-t border-gray-100">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Petsa ng Pagbebenta</label>
                      <input
                        type="date"
                        value={saleDate}
                        onChange={(e) => setSaleDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Karagdagang Tala (Opsyonal)</label>
                      <textarea
                        rows={2}
                        placeholder="Mga tala ukol sa benta..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </form>
              ) : (
                /* Confirmation Screen (Step 7) */
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-950">
                    <h4 className="font-bold text-sm text-emerald-900 mb-3 flex items-center gap-2">
                      <Receipt size={18} />
                      Detalye ng Pagbebenta
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-emerald-100">
                        <span className="text-gray-600">Hayop:</span>
                        <span className="font-bold text-gray-900">
                          {selectedAnimal?.tag_id} ({selectedAnimal?.name || 'Walang pangalan'})
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-emerald-100">
                        <span className="text-gray-600">Uri:</span>
                        <span className="font-semibold text-gray-900">
                          {selectedAnimal?.species === 'Goat' ? 'Kambing' : 'Tupa'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-emerald-100">
                        <span className="text-gray-600">Timbang Bago Ibenta:</span>
                        <span className="font-bold text-gray-900">{soldWeight} kg</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-emerald-100">
                        <span className="text-gray-600">Presyo ng Pagbebenta:</span>
                        <span className="font-bold text-emerald-800 text-sm">
                          ₱{parseFloat(sellingPrice || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {calculatedPricePerKg !== null && (
                        <div className="flex justify-between py-1 border-b border-emerald-100">
                          <span className="text-gray-600">Presyo bawat Kilo:</span>
                          <span className="font-semibold text-gray-900">
                            ₱{calculatedPricePerKg.toFixed(2)}/kg
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 border-b border-emerald-100">
                        <span className="text-gray-600">Bumibili:</span>
                        <span className="font-semibold text-gray-900">
                          {buyerName ? `${buyerName} ${buyerContact ? `(${buyerContact})` : ''}` : 'Hindi tinukoy'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-emerald-100">
                        <span className="text-gray-600">Katayuan ng Bayad:</span>
                        <span className="font-bold text-gray-900">{paymentStatus}</span>
                      </div>
                      {paymentStatus === 'May Kulang' && (
                        <div className="flex justify-between py-1 border-b border-emerald-100 text-amber-800 font-bold">
                          <span>Natitirang Kulang:</span>
                          <span>₱{remainingBalance.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1">
                        <span className="text-gray-600">Petsa:</span>
                        <span className="font-medium text-gray-900">{saleDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Info size={14} className="text-blue-700" />
                      Ano ang mangyayari pagkatapos kumpirmahin:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-blue-800 pl-1 text-[11px]">
                      <li>Awtomatikong mamarkahan ang hayop bilang <strong>'Nabenta'</strong>.</li>
                      <li>Aalisin ito sa aktibong bilang ng mga alaga sa bukid.</li>
                      <li>Itatabi ang timbang na ito sa kasaysayan ng timbang ng hayop.</li>
                      <li>Ligtas na mananatili ang lahat ng medikal at breeding records nito.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50">
              {formStep === 'input' ? (
                <>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Kanselahin
                  </button>
                  <button
                    type="submit"
                    form="sellForm"
                    disabled={!selectedAnimalId || availableAnimals.length === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Ipatuloy sa Kumpirmasyon
                    <ArrowRight size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setFormStep('input')}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Bumalik
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirmSale}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Itinatala...' : 'Kumpirmahin at I-save ang Benta'}
                    <Check size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SALE DETAIL MODAL (Receipt view) ── */}
      {selectedSaleDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-emerald-800 text-white">
              <div className="flex items-center gap-2">
                <Receipt size={18} />
                <h3 className="font-semibold text-sm">Resibo ng Pagbebenta</h3>
              </div>
              <button
                onClick={() => setSelectedSaleDetail(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-center pb-3 border-b border-gray-100">
                <div className="text-xs uppercase tracking-wider text-gray-500">Halaga ng Benta</div>
                <div className="text-3xl font-extrabold text-emerald-800 mt-1">
                  ₱{selectedSaleDetail.selling_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  {selectedSaleDetail.payment_status}
                </div>
              </div>

              <div className="space-y-2.5 text-xs text-gray-700">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Tag ID:</span>
                  <span className="font-bold text-gray-900">{selectedSaleDetail.animal_tag_id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Pangalan ng Hayop:</span>
                  <span className="font-semibold text-gray-900">{selectedSaleDetail.animal_name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Uri:</span>
                  <span className="font-medium text-gray-900">
                    {selectedSaleDetail.species === 'Goat' ? 'Kambing' : 'Tupa'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Timbang Bago Ibenta:</span>
                  <span className="font-bold text-gray-900">{selectedSaleDetail.sold_weight} kg</span>
                </div>
                {selectedSaleDetail.price_per_kg && (
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Presyo bawat Kilo:</span>
                    <span className="font-semibold text-gray-900">₱{selectedSaleDetail.price_per_kg.toFixed(2)}/kg</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Bumibili:</span>
                  <span className="font-semibold text-gray-900">
                    {selectedSaleDetail.buyer_name || 'Hindi tinukoy'}
                  </span>
                </div>
                {selectedSaleDetail.buyer_contact && (
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Contact Number:</span>
                    <span className="font-medium text-gray-900">{selectedSaleDetail.buyer_contact}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Halagang Natanggap:</span>
                  <span className="font-bold text-emerald-800">
                    ₱{selectedSaleDetail.amount_received.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {selectedSaleDetail.remaining_balance > 0 && (
                  <div className="flex justify-between py-1 border-b border-gray-100 text-amber-800 font-bold">
                    <span>Natitirang Balanse:</span>
                    <span>₱{selectedSaleDetail.remaining_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Petsa ng Benta:</span>
                  <span className="font-medium text-gray-900">{selectedSaleDetail.sale_date}</span>
                </div>
                {selectedSaleDetail.notes && (
                  <div className="pt-1">
                    <span className="text-gray-500 block mb-0.5">Mga Tala:</span>
                    <div className="bg-gray-50 p-2 rounded text-gray-800 text-[11px] whitespace-pre-wrap">
                      {selectedSaleDetail.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedSaleDetail(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-semibold transition-colors"
              >
                Isara
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default SalesPage;
