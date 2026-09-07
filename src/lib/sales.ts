/**
 * sales.ts — Livestock Sales & Pre-Sale Weighing Management for ALPASFARM
 *
 * Handles:
 * - Recording sales with mandatory pre-sale weighing
 * - Tracking total animals sold, money received, weight, and price per kg
 * - Resilient database interaction with user-isolated local fallback
 * - Automatic animal archiving (marked as 'Sold') while preserving all history
 * - Automatic insertion of selling weight into weight_records
 */

import { supabase } from './supabase';
import type { Animal, AnimalSale, PaymentStatus } from '../types';

export interface RecordSaleInput {
  userId: string;
  isSuperAdmin?: boolean;
  animal: Animal;
  soldWeight: number; // Mandatory pre-sale weight
  sellingPrice: number; // Mandatory final price
  buyerName?: string;
  buyerContact?: string;
  paymentStatus: PaymentStatus;
  amountReceived?: number;
  saleDate?: string;
  notes?: string;
  soldBy?: string;
}

const STORAGE_PREFIX = 'alpasfarm_animal_sales_';

function getLocalSalesKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * Retrieve cached sales records from localStorage for a specific user
 */
export function getLocalSales(userId: string): AnimalSale[] {
  try {
    const raw = localStorage.getItem(getLocalSalesKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save sales records to localStorage for a specific user
 */
export function setLocalSales(userId: string, sales: AnimalSale[]): void {
  try {
    localStorage.setItem(getLocalSalesKey(userId), JSON.stringify(sales));
  } catch {
    // Non-fatal if localStorage is restricted
  }
}

/**
 * Fetch sales for user with fallback to localStorage
 */
export async function fetchUserSales(userId: string, isSuperAdmin = false): Promise<AnimalSale[]> {
  try {
    let query = supabase.from('animal_sales').select('*').order('sale_date', { ascending: false });
    if (!isSuperAdmin) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;

    if (!error && data) {
      const records = data as AnimalSale[];
      setLocalSales(userId, records);
      return records;
    }
    // Fallback to local storage if table doesn't exist yet
    return getLocalSales(userId);
  } catch {
    return getLocalSales(userId);
  }
}

/**
 * Calculate price per kilogram for display and analytics
 */
export function calculatePricePerKg(price: number, weightKg: number): number | null {
  if (!weightKg || weightKg <= 0 || !price || price <= 0) return null;
  return Number((price / weightKg).toFixed(2));
}

export interface SalesMetrics {
  totalSold: number;
  totalReceived: number;
  totalRevenue: number;
  totalWeight: number;
  avgPricePerKg: number;
  totalRemainingBalance: number;
  pendingCount: number;
  partialCount: number;
}

/**
 * Calculate summary metrics for the sales dashboard and reports
 */
export function calculateSalesMetrics(sales: AnimalSale[]): SalesMetrics {
  let totalReceived = 0;
  let totalRevenue = 0;
  let totalWeight = 0;
  let totalRemainingBalance = 0;
  let pendingCount = 0;
  let partialCount = 0;

  for (const s of sales) {
    const received = Number(s.amount_received || 0);
    const price = Number(s.selling_price || 0);
    const weight = Number(s.sold_weight || 0);
    const balance = Number(s.remaining_balance || 0);

    totalReceived += received;
    totalRevenue += price;
    totalWeight += weight;
    totalRemainingBalance += balance;

    if (s.payment_status === 'Pending') pendingCount++;
    if (s.payment_status === 'May Kulang') partialCount++;
  }

  const avgPricePerKg = totalWeight > 0 ? Number((totalRevenue / totalWeight).toFixed(2)) : 0;

  return {
    totalSold: sales.length,
    totalReceived,
    totalRevenue,
    totalWeight: Number(totalWeight.toFixed(2)),
    avgPricePerKg,
    totalRemainingBalance,
    pendingCount,
    partialCount,
  };
}

/**
 * Record a new animal sale
 * - Performs pre-sale weight validation
 * - Creates sale record in Supabase / Local storage
 * - Updates animal record to 'Sold' (archived: true, preserving all history)
 * - Records final weight in weight_records table
 */
export async function recordAnimalSale(
  input: RecordSaleInput
): Promise<{ success: boolean; sale?: AnimalSale; error?: string }> {
  const {
    userId,
    isSuperAdmin = false,
    animal,
    soldWeight,
    sellingPrice,
    buyerName,
    buyerContact,
    paymentStatus,
    amountReceived: rawAmountReceived,
    saleDate = new Date().toISOString().split('T')[0],
    notes,
    soldBy,
  } = input;

  if (!animal || !animal.id) {
    return { success: false, error: 'Pumili muna ng hayop na ibebenta.' };
  }

  if (!soldWeight || soldWeight <= 0) {
    return { success: false, error: 'Kailangang timbangin muna ang hayop bago ito maibenta. Ilagay ang wastong timbang (kg).' };
  }

  if (sellingPrice === undefined || sellingPrice === null || sellingPrice <= 0) {
    return { success: false, error: 'Ilagay ang wastong presyo ng pagbebenta (₱).' };
  }

  // Calculate received and balance
  const amountReceived = paymentStatus === 'Bayad na'
    ? sellingPrice
    : rawAmountReceived !== undefined && rawAmountReceived !== null
    ? Math.max(0, rawAmountReceived)
    : 0;

  const remainingBalance = Math.max(0, sellingPrice - amountReceived);
  const pricePerKg = calculatePricePerKg(sellingPrice, soldWeight);

  const saleRecord: AnimalSale = {
    id: crypto.randomUUID(),
    user_id: userId,
    animal_id: animal.id,
    animal_tag_id: animal.tag_id,
    animal_name: animal.name || animal.tag_id,
    species: animal.species,
    sold_weight: soldWeight,
    selling_price: sellingPrice,
    price_per_kg: pricePerKg,
    buyer_name: buyerName?.trim() || null,
    buyer_contact: buyerContact?.trim() || null,
    payment_status: paymentStatus,
    amount_received: amountReceived,
    remaining_balance: remainingBalance,
    sale_date: saleDate,
    notes: notes?.trim() || null,
    sold_by: soldBy || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    // 1. Attempt to insert into Supabase animal_sales
    const { error: saleErr } = await supabase.from('animal_sales').insert([saleRecord]);
    if (saleErr) {
      console.warn('Could not insert to animal_sales in Supabase, using local fallback:', saleErr.message);
    }

    // Always keep local storage cache in sync
    const currentLocal = getLocalSales(userId);
    setLocalSales(userId, [saleRecord, ...currentLocal]);

    // 2. Insert into weight_records table so selling weight is preserved in history
    try {
      await supabase.from('weight_records').insert({
        user_id: userId,
        animal_id: animal.id,
        record_date: saleDate,
        weight_kg: soldWeight,
        previous_weight_kg: animal.weight_kg ?? null,
        weight_change_kg: animal.weight_kg ? Number((soldWeight - animal.weight_kg).toFixed(2)) : null,
        notes: `Timbang bago ibenta (Presyo: ₱${sellingPrice.toLocaleString()}${buyerName ? `, Bumibili: ${buyerName}` : ''})`,
      });
    } catch (wErr) {
      console.warn('Failed to insert final weigh-in:', wErr);
    }

    // 3. Update the Animal record: mark as Sold, archived from active count, preserve latest weight
    const saleNote = `[NABENTA NOONG ${saleDate}] Timbang: ${soldWeight}kg | Presyo: ₱${sellingPrice.toLocaleString()}${
      buyerName ? ` | Bumibili: ${buyerName}` : ''
    }${notes ? ` | Tala: ${notes}` : ''}`;

    const existingNotes = animal.notes ? `${animal.notes}\n${saleNote}` : saleNote;

    let updateQuery = supabase
      .from('animals')
      .update({
        archived: true,
        weight_kg: soldWeight,
        notes: existingNotes,
      })
      .eq('id', animal.id);

    if (!isSuperAdmin) {
      updateQuery = updateQuery.eq('user_id', userId);
    }

    const { error: animalUpdateErr } = await updateQuery;
    if (animalUpdateErr) {
      console.warn('Failed to update animal archived status in Supabase:', animalUpdateErr.message);
    }

    return { success: true, sale: saleRecord };
  } catch (err: any) {
    console.error('Error during sale execution:', err);
    return { success: false, error: err?.message || 'Nagkaroon ng problema sa pag-save ng benta.' };
  }
}
