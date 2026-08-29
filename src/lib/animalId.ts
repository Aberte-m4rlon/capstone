import { supabase } from './supabase';
import type { Animal, Species } from '../types';

/**
 * Returns standardized uppercase prefix based on species.
 */
export function getSpeciesPrefix(species: Species | string): 'GOAT' | 'SHEEP' {
  const norm = String(species || '').trim().toLowerCase();
  if (norm.includes('sheep') || norm.includes('tupa')) {
    return 'SHEEP';
  }
  return 'GOAT';
}

/**
 * Parses numeric suffix from a tag_id string given a target prefix.
 * e.g., "GOAT-001" -> 1, "goat-15" -> 15, "SHEEP-001" -> 1.
 */
export function parseAnimalNumber(tagId: string | null | undefined, targetPrefix: 'GOAT' | 'SHEEP'): number | null {
  if (!tagId || typeof tagId !== 'string') return null;
  const trimmed = tagId.trim();

  // Primary pattern: e.g. GOAT-001, GOAT_001, GOAT001
  const regex = new RegExp(`^${targetPrefix}[-_ ]?0*(\\d+)$`, 'i');
  const match = trimmed.match(regex);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? null : num;
  }

  // Generic fallback if tag starts with number
  const genericMatch = trimmed.match(/^(\d+)$/);
  if (genericMatch && genericMatch[1]) {
    const num = parseInt(genericMatch[1], 10);
    return isNaN(num) ? null : num;
  }

  return null;
}

/**
 * Generates the next available candidate Animal ID based on in-memory animal list.
 * e.g., if highest Goat is GOAT-023, returns "GOAT-024".
 * If no existing animals exist, returns "GOAT-001" (or "SHEEP-001").
 */
export function generateNextAnimalId(
  species: Species | string,
  existingAnimals: Array<{ tag_id?: string | null; species?: string | null }> = []
): string {
  const prefix = getSpeciesPrefix(species);
  let maxNumber = 0;

  const usedNumbers = new Set<number>();

  for (const animal of existingAnimals) {
    if (!animal.tag_id) continue;
    const num = parseAnimalNumber(animal.tag_id, prefix);
    if (num !== null && num > 0) {
      usedNumbers.add(num);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  // Next candidate is maxNumber + 1
  let nextCandidateNum = maxNumber + 1;
  while (usedNumbers.has(nextCandidateNum)) {
    nextCandidateNum++;
  }

  return `${prefix}-${String(nextCandidateNum).padStart(3, '0')}`;
}

/**
 * Queries Supabase to fetch all existing tag_ids and calculate the next unique ID.
 */
export async function fetchNextUniqueAnimalId(
  species: Species | string,
  userId?: string | null
): Promise<string> {
  const prefix = getSpeciesPrefix(species);

  try {
    let query = supabase.from('animals').select('tag_id, species');
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Error fetching animals for ID generation, fallback to defaults:', error.message);
      return `${prefix}-001`;
    }

    const nextId = generateNextAnimalId(species, data || []);
    return nextId;
  } catch (err) {
    console.error('Failed to query next animal ID:', err);
    return `${prefix}-001`;
  }
}

/**
 * Checks whether a specific tag_id is already registered in the database.
 */
export async function isAnimalIdAvailable(
  tagId: string,
  excludeAnimalId?: string | null
): Promise<boolean> {
  if (!tagId || !tagId.trim()) return false;
  try {
    let query = supabase
      .from('animals')
      .select('id')
      .ilike('tag_id', tagId.trim());

    if (excludeAnimalId) {
      query = query.neq('id', excludeAnimalId);
    }

    const { data, error } = await query.limit(1);
    if (error) {
      console.warn('Could not verify animal ID uniqueness:', error.message);
      return true;
    }

    return !data || data.length === 0;
  } catch {
    return true;
  }
}

export interface InsertAnimalOptions {
  maxRetries?: number;
  onAutoIncrement?: (newTagId: string) => void;
}

export interface SaveAnimalResult {
  data: Animal | null;
  error: Error | null;
  finalTagId: string;
  hadConflict: boolean;
}

/**
 * Inserts a new animal with automatic duplicate prevention and race-condition retries.
 * If Supabase returns code 23505 (unique_violation) or duplicate key error,
 * the function increments the numeric suffix and retries seamlessly.
 */
export async function insertAnimalWithUniqueRetry(
  payload: Partial<Animal> & { species: Species },
  options: InsertAnimalOptions = {}
): Promise<SaveAnimalResult> {
  const maxRetries = options.maxRetries ?? 5;
  const prefix = getSpeciesPrefix(payload.species);

  // 1. Fetch current DB state to ensure starting candidate is fresh
  const { data: currentAnimals } = await supabase.from('animals').select('tag_id, species');
  let currentCandidate = payload.tag_id?.trim() || generateNextAnimalId(payload.species, currentAnimals || []);

  let hadConflict = false;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Check if current candidate is available before trying insert
    const isAvailable = await isAnimalIdAvailable(currentCandidate);
    if (!isAvailable) {
      hadConflict = true;
      const num = parseAnimalNumber(currentCandidate, prefix) || 0;
      currentCandidate = `${prefix}-${String(num + 1).padStart(3, '0')}`;
      if (options.onAutoIncrement) options.onAutoIncrement(currentCandidate);
      continue;
    }

    // Attempt insert
    const recordToInsert = {
      ...payload,
      tag_id: currentCandidate,
    };

    const { data, error } = await supabase
      .from('animals')
      .insert(recordToInsert)
      .select()
      .maybeSingle();

    if (!error) {
      return {
        data: data as Animal,
        error: null,
        finalTagId: currentCandidate,
        hadConflict,
      };
    }

    // Check if error is unique violation (23505) or duplicate tag_id
    const isDuplicate =
      error.code === '23505' ||
      error.message?.toLowerCase().includes('duplicate') ||
      error.message?.toLowerCase().includes('unique') ||
      error.message?.toLowerCase().includes('already exists');

    if (isDuplicate) {
      hadConflict = true;
      const num = parseAnimalNumber(currentCandidate, prefix) || 0;
      currentCandidate = `${prefix}-${String(num + 1).padStart(3, '0')}`;
      if (options.onAutoIncrement) options.onAutoIncrement(currentCandidate);
      continue;
    }

    // Other non-duplicate error: return immediately
    return {
      data: null,
      error: new Error(error.message),
      finalTagId: currentCandidate,
      hadConflict,
    };
  }

  return {
    data: null,
    error: new Error('Unable to find an available Animal ID after multiple attempts. Please try again.'),
    finalTagId: currentCandidate,
    hadConflict,
  };
}
