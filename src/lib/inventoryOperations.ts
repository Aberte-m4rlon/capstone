import { supabase } from './supabase';
import { createNotification } from './recommendations';
import { daysUntil } from './analytics';
import type { InventoryItem, InventoryCategory, TreatmentStatus, TreatmentUsageType } from '../types';

export interface ConsumeStockParams {
  userId: string;
  isSuperAdmin?: boolean;
  item: InventoryItem;
  quantity: number;
  usageType: 'feeding' | 'vaccination' | 'medication' | 'deworming' | 'supplement' | 'treatment' | 'other_usage';
  animalId?: string | null;
  animalTag?: string | null;
  animalName?: string | null;
  referenceType?: 'animal' | 'feeding' | 'vaccination' | 'health_record' | 'treatment' | 'other';
  referenceId?: string | null;
  reason?: string;
  notes?: string;
  treatmentStatus?: TreatmentStatus;
  dosage?: string | number;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  allowExpired?: boolean;
}

export interface ConsumeStockResult {
  success: boolean;
  previousStock: number;
  newStock: number;
  transactionId?: string;
  error?: string;
}

/**
 * Normalization helpers for inventory categories across variations
 */
export function isFeedCategory(category?: string | null): boolean {
  if (!category) return false;
  return category.trim().toLowerCase() === 'feed';
}

export function isVaccineCategory(category?: string | null): boolean {
  if (!category) return false;
  const c = category.trim().toLowerCase();
  return c === 'vaccine' || c === 'vaccines';
}

export function isMedicineCategory(category?: string | null): boolean {
  if (!category) return false;
  const c = category.trim().toLowerCase();
  return (
    c === 'medicine' ||
    c === 'medicines' ||
    c === 'dewormer' ||
    c === 'supplement' ||
    c === 'supplements' ||
    c === 'vitamins' ||
    c === 'vitamin'
  );
}

export function isDewormerCategory(category?: string | null): boolean {
  if (!category) return false;
  return category.trim().toLowerCase() === 'dewormer';
}

export function isSupplementCategory(category?: string | null): boolean {
  if (!category) return false;
  const c = category.trim().toLowerCase();
  return c === 'supplement' || c === 'supplements' || c === 'vitamins' || c === 'vitamin';
}

/**
 * Check if an item is expired based on current date
 */
export function isItemExpired(itemOrDate: InventoryItem | string | null | undefined): boolean {
  if (!itemOrDate) return false;
  const expiryDate = typeof itemOrDate === 'string' ? itemOrDate : itemOrDate.expiry_date;
  if (!expiryDate) return false;
  return daysUntil(expiryDate) < 0;
}

/**
 * Validate requested stock consumption against current inventory state
 */
export function validateStockRequest(
  item: InventoryItem,
  requestedQty: number,
  allowExpired: boolean = false
): { valid: boolean; error?: string } {
  if (isNaN(requestedQty) || requestedQty <= 0) {
    return { valid: false, error: 'Maglagay ng wastong dami (dapat mas mataas sa 0).' };
  }

  const currentStock = Number(item.quantity) || 0;
  if (requestedQty > currentStock) {
    return {
      valid: false,
      error: `❌ Hindi sapat ang stock. Available lang: ${currentStock} ${item.unit}.`,
    };
  }

  if (!allowExpired && isItemExpired(item)) {
    return {
      valid: false,
      error: `⚠️ Expired na ang item na ito noong ${item.expiry_date}. Hindi ito maaaring gamitin.`,
    };
  }

  return { valid: true };
}

/**
 * Centralized, atomic & rollback-safe stock consumption routine.
 * 1. Checks user authorization and item ownership
 * 2. Validates availability and rejects overuse (no negative stock)
 * 3. Deducts from inventory table
 * 4. Inserts into inventory_transactions ledger
 * 5. If ledger insert fails, automatically reverts the inventory deduction
 * 6. Dispatches low stock / out of stock notification if minimum threshold is breached
 */
export async function consumeInventoryStock(params: ConsumeStockParams): Promise<ConsumeStockResult> {
  const {
    userId,
    isSuperAdmin = false,
    item,
    quantity,
    usageType,
    animalId = null,
    animalTag = null,
    animalName = null,
    referenceType = 'animal',
    referenceId = null,
    reason,
    notes = '',
    treatmentStatus,
    dosage,
    frequency,
    startDate,
    endDate,
    allowExpired = false,
  } = params;

  if (!userId) {
    return { success: false, previousStock: item.quantity, newStock: item.quantity, error: 'Kailangan ng naka-login na user.' };
  }

  if (!isSuperAdmin && item.user_id && item.user_id !== userId) {
    return {
      success: false,
      previousStock: item.quantity,
      newStock: item.quantity,
      error: 'Walang pahintulot sa item na ito mula sa imbentaryo.',
    };
  }

  // 1. Validate request
  const validation = validateStockRequest(item, quantity, allowExpired);
  if (!validation.valid) {
    return {
      success: false,
      previousStock: item.quantity,
      newStock: item.quantity,
      error: validation.error,
    };
  }

  const prevStock = Number(item.quantity);
  const newStock = Math.max(0, +(prevStock - quantity).toFixed(2));

  // Build clean ledger notes & reason
  const animalDesc = animalTag ? `${animalTag}${animalName ? ` (${animalName})` : ''}` : (animalName || 'Hayop');
  let transactionReason = reason;
  if (!transactionReason) {
    if (usageType === 'feeding') transactionReason = 'Feeding / Pagpapakain';
    else if (usageType === 'vaccination') transactionReason = 'Vaccination / Pagbabakuna';
    else if (usageType === 'deworming') transactionReason = 'Deworming / Pagpurga';
    else if (usageType === 'medication' || usageType === 'treatment') transactionReason = 'Medication / Paggamot';
    else transactionReason = 'Consumption';
  }

  const extraNotesParts: string[] = [];
  if (animalTag || animalName) extraNotesParts.push(`Para kay: ${animalDesc}`);
  if (dosage) extraNotesParts.push(`Dosis: ${dosage} ${item.unit}`);
  if (frequency) extraNotesParts.push(`Dalas: ${frequency}`);
  if (treatmentStatus) extraNotesParts.push(`Status: ${treatmentStatus}`);
  if (startDate) extraNotesParts.push(`Simula: ${startDate}`);
  if (endDate) extraNotesParts.push(`Hanggang: ${endDate}`);
  if (notes.trim()) extraNotesParts.push(notes.trim());

  const fullNotes = extraNotesParts.join(' | ');

  // 2. Perform Stock Deduction
  let invQuery = supabase
    .from('inventory')
    .update({ quantity: newStock, updated_at: new Date().toISOString() })
    .eq('id', item.id);

  if (!isSuperAdmin) {
    invQuery = invQuery.eq('user_id', userId);
  }

  const { error: invErr } = await invQuery;
  if (invErr) {
    return {
      success: false,
      previousStock: prevStock,
      newStock: prevStock,
      error: `Hindi nabawas ang stock sa imbentaryo: ${invErr.message}`,
    };
  }

  // 3. Insert into inventory_transactions
  const transactionPayload = {
    user_id: userId,
    inventory_item_id: item.id,
    type: 'CONSUMPTION',
    quantity: quantity,
    unit: item.unit,
    reason: transactionReason,
    notes: fullNotes,
    previous_stock: prevStock,
    new_stock: newStock,
    cost_per_unit: item.cost ?? null,
    reference_type: referenceType,
    reference_id: referenceId || animalId || null,
    created_at: new Date().toISOString(),
  };

  const { data: txData, error: txErr } = await supabase
    .from('inventory_transactions')
    .insert(transactionPayload)
    .select('id')
    .single();

  if (txErr) {
    // ROLLBACK SAFETY: Revert inventory quantity to prevStock
    console.error('Failed to log inventory transaction. Rolling back stock deduction...', txErr);
    await supabase.from('inventory').update({ quantity: prevStock }).eq('id', item.id);
    return {
      success: false,
      previousStock: prevStock,
      newStock: prevStock,
      error: `Nabigo ang pagtatala sa inventory ledger. Naibalik ang stock sa ${prevStock} ${item.unit}. Error: ${txErr.message}`,
    };
  }

  // 4. Low stock / Out of stock trigger notification
  try {
    const minStock = Number(item.minimum_stock) || 0;
    if (newStock === 0) {
      await createNotification(
        userId,
        'Inventory',
        `Naubos na ang Stock: ${item.name}`,
        `Ang ${item.name} (${item.category}) ay 0 ${item.unit} na lamang. Mag-restock kaagad upang hindi maantala ang gawain sa bukid.`,
        'Critical',
        '/inventory'
      );
    } else if (newStock <= minStock) {
      await createNotification(
        userId,
        'Inventory',
        `Mababang Stock: ${item.name}`,
        `Ang natitirang stock ng ${item.name} ay ${newStock} ${item.unit} na lamang (minimum: ${minStock} ${item.unit}).`,
        'Warning',
        '/inventory'
      );
    }
  } catch (notifErr) {
    console.warn('Could not create low stock notification:', notifErr);
  }

  return {
    success: true,
    previousStock: prevStock,
    newStock: newStock,
    transactionId: txData?.id,
  };
}
