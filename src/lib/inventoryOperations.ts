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
 * Filter items appropriate for medication and treatments.
 * Strictly excludes Feed, Equipment, Tools, and Containers.
 */
export function isTreatmentInventoryItem(category?: string | null): boolean {
  if (!category) return false;
  const c = category.trim().toLowerCase();
  // Exclude non-treatment categories strictly
  if (
    c === 'feed' ||
    c === 'equipment' ||
    c === 'tools' ||
    c.includes('pakain') ||
    c.includes('kagamitan') ||
    c.includes('kasangkapan') ||
    c.includes('lalagyan')
  ) {
    return false;
  }
  return (
    c === 'medicine' ||
    c === 'medicines' ||
    c === 'dewormer' ||
    c === 'purga' ||
    c === 'supplement' ||
    c === 'supplements' ||
    c === 'vitamins' ||
    c === 'vitamin' ||
    c === 'vaccine' ||
    c === 'vaccines' ||
    c === 'supplies' ||
    c.includes('gamot') ||
    c.includes('bitamina') ||
    c.includes('suplemento') ||
    c.includes('bakuna') ||
    c.includes('health') ||
    c.includes('med')
  );
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
  const animalDesc = animalTag ? `${animalTag}${animalName ? ` (${animalName})` : ''}` : (animalName || 'Kambing / Tupa');
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

  // 3.1. Insert record into inventory_usage if animal is linked
  let usageId: string | undefined;
  if (animalId) {
    try {
      const { data: usageData } = await supabase.from('inventory_usage').insert({
        user_id: userId,
        inventory_id: item.id,
        animal_id: animalId,
        quantity_used: quantity,
        unit: item.unit,
        usage_date: new Date().toISOString(),
        reason: transactionReason,
        treatment_status: treatmentStatus || null,
        dosage: dosage ? String(dosage) : null,
        frequency: frequency || null,
        next_due_date: endDate || null,
        notes: fullNotes || null,
      }).select('id').maybeSingle();
      if (usageData?.id) usageId = usageData.id;
    } catch (usageErr) {
      console.warn('Non-blocking inventory_usage insert skipped:', usageErr);
    }
  }

  // 4. Low stock / Out of stock trigger notification
  try {
    const minStock = Number(item.minimum_stock) || 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (newStock === 0) {
      await createNotification(
        userId,
        'Inventory',
        `Naubos na ang Stock: ${item.name}`,
        `Ang ${item.name} (${item.category}) ay 0 ${item.unit} na lamang. Mag-restock kaagad upang hindi maantala ang gawain sa bukid.`,
        'Critical',
        '/inventory',
        `inventory_out_${item.id}_${todayStr}`
      );
    } else if (newStock <= minStock) {
      await createNotification(
        userId,
        'Inventory',
        `Mababang Stock: ${item.name}`,
        `Ang natitirang stock ng ${item.name} ay ${newStock} ${item.unit} na lamang (minimum: ${minStock} ${item.unit}).`,
        'Warning',
        '/inventory',
        `inventory_low_${item.id}_${todayStr}`
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

export interface AdministerMedicationParams {
  userId: string;
  isSuperAdmin?: boolean;
  animalId: string;
  animalTag?: string;
  animalName?: string;
  inventoryItem: InventoryItem;
  quantity: number;
  unit: string;
  usageType?: TreatmentUsageType | string;
  status: TreatmentStatus;
  dosage?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
  notes?: string;
  allowExpired?: boolean;
}

export interface AdministerMedicationResult {
  success: boolean;
  previousStock: number;
  newStock: number;
  usageId?: string;
  transactionId?: string;
  healthRecordId?: string;
  error?: string;
}

/**
 * Atomic Administration of Medication & Treatment with Farm Inventory Deduction.
 * Dual-layer transactional safety:
 * 1. Checks animal ownership and ensures animal is active (not sold/archived)
 * 2. Checks inventory item ownership, sufficiency, unit match, and non-expiration
 * 3. Attempts PostgreSQL RPC function for 100% single-transaction atomicity
 * 4. Falls back to client-side atomic compensation rollback if RPC is not present
 * 5. Creates records in inventory_usage, inventory_transactions, and health_records
 * 6. Updates animal's clinical health status
 * 7. Dispatches deduplicated low-stock alerts via In-App, SMS, and Email
 */
export async function administerMedicationTreatment(
  params: AdministerMedicationParams
): Promise<AdministerMedicationResult> {
  const {
    userId,
    isSuperAdmin = false,
    animalId,
    animalTag,
    animalName,
    inventoryItem,
    quantity,
    unit,
    usageType = 'Medication',
    status,
    dosage,
    frequency = 'Once daily',
    startDate = new Date().toISOString().slice(0, 10),
    endDate,
    reason,
    notes = '',
    allowExpired = false,
  } = params;

  // 1. Authentication & Ownership validation
  if (!userId) {
    return {
      success: false,
      previousStock: inventoryItem.quantity,
      newStock: inventoryItem.quantity,
      error: 'Kailangan ng naka-login na user.',
    };
  }

  if (!animalId) {
    return {
      success: false,
      previousStock: inventoryItem.quantity,
      newStock: inventoryItem.quantity,
      error: 'Pumili ng kambing o tupa para sa paggamot.',
    };
  }

  if (!inventoryItem || !inventoryItem.id) {
    return {
      success: false,
      previousStock: 0,
      newStock: 0,
      error: 'Pumili ng gamot mula sa imbentaryo.',
    };
  }

  if (!isSuperAdmin && inventoryItem.user_id && inventoryItem.user_id !== userId) {
    return {
      success: false,
      previousStock: inventoryItem.quantity,
      newStock: inventoryItem.quantity,
      error: 'Walang pahintulot sa gamot na ito mula sa imbentaryo.',
    };
  }

  // 2. Quantity & Stock sufficiency validation
  if (isNaN(quantity) || quantity <= 0) {
    return {
      success: false,
      previousStock: inventoryItem.quantity,
      newStock: inventoryItem.quantity,
      error: 'Maglagay ng wastong dami (dapat mas mataas sa 0).',
    };
  }

  const prevStock = Number(inventoryItem.quantity) || 0;
  if (quantity > prevStock) {
    return {
      success: false,
      previousStock: prevStock,
      newStock: prevStock,
      error: `Hindi sapat ang stock. Mayroon lamang ${prevStock} ${inventoryItem.unit} sa imbentaryo.`,
    };
  }

  // 3. Unit validation
  if (unit && inventoryItem.unit && unit.trim().toLowerCase() !== inventoryItem.unit.trim().toLowerCase()) {
    return {
      success: false,
      previousStock: prevStock,
      newStock: prevStock,
      error: `Hindi tugma ang unit ng gamot (${unit}) at stock (${inventoryItem.unit}).`,
    };
  }

  // 4. Expiration check
  if (!allowExpired && isItemExpired(inventoryItem)) {
    return {
      success: false,
      previousStock: prevStock,
      newStock: prevStock,
      error: `Expired na ang gamot na ito noong ${inventoryItem.expiry_date}. Hindi maaaring gamitin.`,
    };
  }

  // 5. Verify Animal status (Must not be sold or archived)
  try {
    const { data: animalData, error: animalCheckErr } = await supabase
      .from('animals')
      .select('id, user_id, tag_id, name, archived, health_status')
      .eq('id', animalId)
      .maybeSingle();

    if (animalCheckErr || !animalData) {
      return {
        success: false,
        previousStock: prevStock,
        newStock: prevStock,
        error: 'Hindi nahanap ang alaga o walang pahintulot.',
      };
    }

    if (!isSuperAdmin && animalData.user_id !== userId) {
      return {
        success: false,
        previousStock: prevStock,
        newStock: prevStock,
        error: 'Walang pahintulot na gamutin ang alagang ito.',
      };
    }

    if (animalData.archived) {
      return {
        success: false,
        previousStock: prevStock,
        newStock: prevStock,
        error: 'Hindi maaaring bigyan ng gamot ang alaga na naibenta na o naka-archive.',
      };
    }

    // Check animal_sales table to verify animal is not sold
    const { data: saleData } = await supabase
      .from('animal_sales')
      .select('id')
      .eq('animal_id', animalId)
      .limit(1)
      .maybeSingle();

    if (saleData) {
      return {
        success: false,
        previousStock: prevStock,
        newStock: prevStock,
        error: 'Hindi maaaring bigyan ng gamot ang alaga na naibenta na.',
      };
    }
  } catch (checkEx) {
    console.warn('Could not verify animal status via DB:', checkEx);
  }

  // 6. Try PostgreSQL Atomic RPC
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('administer_medication_treatment', {
      p_user_id: userId,
      p_animal_id: animalId,
      p_inventory_id: inventoryItem.id,
      p_quantity: quantity,
      p_unit: inventoryItem.unit,
      p_usage_type: usageType,
      p_status: status,
      p_dosage: dosage || null,
      p_frequency: frequency || null,
      p_start_date: startDate,
      p_end_date: endDate || null,
      p_reason: reason || null,
      p_notes: notes || null,
    });

    if (!rpcErr && rpcData && rpcData.success) {
      // Dispatched successfully via database transaction
      const newStockVal = Number(rpcData.new_stock);
      const minStockVal = Number(rpcData.minimum_stock) || 0;
      const todayStr = new Date().toISOString().slice(0, 10);

      if (rpcData.is_low_stock) {
        try {
          if (newStockVal === 0) {
            await createNotification(
              userId,
              'Inventory',
              `Naubos na ang Stock: ${rpcData.item_name}`,
              `Ang ${rpcData.item_name} ay 0 ${rpcData.unit} na lamang. Mag-restock kaagad upang hindi maantala ang paggamot sa bukid.`,
              'Critical',
              '/inventory',
              `inventory_out_${inventoryItem.id}_${todayStr}`
            );
          } else if (newStockVal <= minStockVal) {
            await createNotification(
              userId,
              'Inventory',
              `Mababang Stock: ${rpcData.item_name}`,
              `Ang natitirang stock ng ${rpcData.item_name} ay ${newStockVal} ${rpcData.unit} na lamang (minimum: ${minStockVal} ${rpcData.unit}).`,
              'Warning',
              '/inventory',
              `inventory_low_${inventoryItem.id}_${todayStr}`
            );
          }
        } catch (e) {
          console.warn('Notification dispatch warning:', e);
        }
      }

      return {
        success: true,
        previousStock: Number(rpcData.previous_stock),
        newStock: newStockVal,
        usageId: rpcData.usage_id,
        healthRecordId: rpcData.health_record_id,
        transactionId: rpcData.transaction_id,
      };
    }

    // If RPC returned a specific business logic failure (e.g. insufficient stock message)
    if (
      rpcErr &&
      !rpcErr.message.includes('function administer_medication_treatment') &&
      !rpcErr.message.includes('could not find') &&
      !rpcErr.message.includes('schema cache') &&
      !rpcErr.message.includes('does not exist') &&
      !rpcErr.message.includes('is_sold')
    ) {
      return {
        success: false,
        previousStock: prevStock,
        newStock: prevStock,
        error: rpcErr.message,
      };
    }
  } catch (rpcEx) {
    console.warn('RPC administer_medication_treatment unavailable or failed, applying client atomic fallback:', rpcEx);
  }

  // 7. Client-Side Atomic Compensation Routine (Fallback if RPC not active in Supabase)
  const newStock = Math.max(0, +(prevStock - quantity).toFixed(2));

  // Step A: Deduct stock from inventory table
  let updateInvQuery = supabase
    .from('inventory')
    .update({ quantity: newStock, updated_at: new Date().toISOString() })
    .eq('id', inventoryItem.id);

  if (!isSuperAdmin) {
    updateInvQuery = updateInvQuery.eq('user_id', userId);
  }

  const { error: invErr } = await updateInvQuery;
  if (invErr) {
    return {
      success: false,
      previousStock: prevStock,
      newStock: prevStock,
      error: `Hindi nabawas ang stock: ${invErr.message}`,
    };
  }

  // Step B: Insert into inventory_usage
  let createdUsageId: string | undefined;
  try {
    const { data: uData, error: uErr } = await supabase
      .from('inventory_usage')
      .insert({
        user_id: userId,
        inventory_id: inventoryItem.id,
        animal_id: animalId,
        quantity_used: quantity,
        unit: inventoryItem.unit,
        usage_date: new Date().toISOString(),
        reason: reason || 'Treatment',
        treatment_status: status,
        dosage: dosage ? `${dosage} ${inventoryItem.unit}` : null,
        frequency: frequency || null,
        next_due_date: endDate || null,
        notes: notes || null,
      })
      .select('id')
      .maybeSingle();

    if (!uErr && uData?.id) createdUsageId = uData.id;
  } catch (err) {
    console.warn('inventory_usage insert warning:', err);
  }

  // Step C: Insert into inventory_transactions ledger
  const animalLabel = animalTag ? `${animalTag}${animalName ? ` (${animalName})` : ''}` : 'Kambing / Tupa';
  const notesDetail = `Para kay: ${animalLabel} | Gamot: ${inventoryItem.name} | Dosis: ${dosage ? `${dosage} ${inventoryItem.unit}` : `${quantity} ${inventoryItem.unit}`} | Dalas: ${frequency} | Katayuan: ${status} | ${notes || ''}`.trim();

  const { data: txData, error: txErr } = await supabase
    .from('inventory_transactions')
    .insert({
      user_id: userId,
      inventory_item_id: inventoryItem.id,
      type: 'CONSUMPTION',
      quantity: quantity,
      unit: inventoryItem.unit,
      reason: `${usageType} — ${status}: ${reason || inventoryItem.name}`,
      notes: notesDetail,
      previous_stock: prevStock,
      new_stock: newStock,
      cost_per_unit: inventoryItem.cost ?? null,
      reference_type: 'animal',
      reference_id: animalId,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (txErr) {
    // ROLLBACK SAFETY: Revert inventory stock
    console.error('Failed to log inventory transaction. Rolling back stock deduction...', txErr);
    await supabase.from('inventory').update({ quantity: prevStock }).eq('id', inventoryItem.id);
    return {
      success: false,
      previousStock: prevStock,
      newStock: prevStock,
      error: `Nabigo ang pagtatala sa inventory ledger. Naibalik ang stock sa ${prevStock} ${inventoryItem.unit}.`,
    };
  }

  // Step D: Insert clinical record into health_records
  const healthRecordPayload = {
    user_id: userId,
    animal_id: animalId,
    record_date: startDate || new Date().toISOString().slice(0, 10),
    reasons: `Gamot / Lunas: ${inventoryItem.name} (${status})`,
    recommendation: `Katayuan ng Gamot: ${status}. Dalas: ${frequency}. Dosis: ${dosage || `${quantity} ${inventoryItem.unit}`}`,
    notes: `Uri: ${usageType} | Gamot: ${inventoryItem.name} | Dami: ${quantity} ${inventoryItem.unit} | Katayuan: ${status} | Simula: ${startDate}${endDate ? ` | Hanggang: ${endDate}` : ''}${reason ? ` | Dahilan: ${reason}` : ''}${notes ? ` | Tala: ${notes}` : ''}`,
    risk_level: status === 'Tapos na ang Gamot' ? 'Low' : 'Moderate',
    risk_score: status === 'Tapos na ang Gamot' ? 5 : 60,
  };

  let createdHealthRecordId: string | undefined;
  const { data: hrData, error: hrErr } = await supabase
    .from('health_records')
    .insert(healthRecordPayload)
    .select('id')
    .single();

  if (hrErr) {
    console.warn('Health record insert warning:', hrErr);
  } else if (hrData?.id) {
    createdHealthRecordId = hrData.id;
  }

  // Step E: Update animal health status in animals table
  try {
    if (status === 'Tapos na ang Gamot') {
      await supabase.from('animals').update({ health_status: 'Healthy' }).eq('id', animalId);
    } else if (status === 'Kailangan ng Gamot' || status === 'Kasalukuyang Ginagamot') {
      await supabase.from('animals').update({ health_status: 'Critical' }).eq('id', animalId);
    }
  } catch (animalUpdErr) {
    console.warn('Animal health status update warning:', animalUpdErr);
  }

  // Step F: Trigger low stock / out of stock notification if applicable
  try {
    const minStock = Number(inventoryItem.minimum_stock) || 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (newStock === 0) {
      await createNotification(
        userId,
        'Inventory',
        `Naubos na ang Stock: ${inventoryItem.name}`,
        `Ang ${inventoryItem.name} (${inventoryItem.category}) ay 0 ${inventoryItem.unit} na lamang. Mag-restock kaagad upang hindi maantala ang gawain sa bukid.`,
        'Critical',
        '/inventory',
        `inventory_out_${inventoryItem.id}_${todayStr}`
      );
    } else if (newStock <= minStock) {
      await createNotification(
        userId,
        'Inventory',
        `Mababang Stock: ${inventoryItem.name}`,
        `Ang natitirang stock ng ${inventoryItem.name} ay ${newStock} ${inventoryItem.unit} na lamang (minimum: ${minStock} ${inventoryItem.unit}).`,
        'Warning',
        '/inventory',
        `inventory_low_${inventoryItem.id}_${todayStr}`
      );
    }
  } catch (notifErr) {
    console.warn('Notification dispatch error:', notifErr);
  }

  return {
    success: true,
    previousStock: prevStock,
    newStock: newStock,
    usageId: createdUsageId,
    transactionId: txData?.id,
    healthRecordId: createdHealthRecordId,
  };
}
