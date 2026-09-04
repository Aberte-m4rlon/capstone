import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type {
  Animal,
  HealthRecord,
  WeightRecord,
  BreedingRecord,
  Vaccination,
  InventoryItem,
  InventoryTransaction,
  FeedRecord,
  MilkRecord,
  Notification,
  Recommendation,
  Settings,
} from '../types';

export interface FarmData {
  animals: Animal[];
  healthRecords: HealthRecord[];
  weightRecords: WeightRecord[];
  breedingRecords: BreedingRecord[];
  vaccinations: Vaccination[];
  inventory: InventoryItem[];
  inventoryTransactions: InventoryTransaction[];
  feedRecords: FeedRecord[];
  milkRecords: MilkRecord[];
  notifications: Notification[];
  recommendations: Recommendation[];
  settings: Settings | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY: FarmData = {
  animals: [],
  healthRecords: [],
  weightRecords: [],
  breedingRecords: [],
  vaccinations: [],
  inventory: [],
  inventoryTransactions: [],
  feedRecords: [],
  milkRecords: [],
  notifications: [],
  recommendations: [],
  settings: null,
  loading: true,
  refresh: async () => {},
};

const FarmDataContext = createContext<FarmData>(EMPTY);

export function FarmDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<FarmData>(EMPTY);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setData({ ...EMPTY, loading: false });
      return;
    }

    try {
      const [
        animalsRes,
        healthRes,
        weightRes,
        breedingRes,
        vaccRes,
        inventoryRes,
        invTxRes,
        feedRes,
        milkRes,
        notifRes,
        recRes,
        settingsRes,
      ] = await Promise.all([
        supabase.from('animals').select('*').order('created_at', { ascending: false }),
        supabase.from('health_records').select('*').order('record_date', { ascending: false }),
        supabase.from('weight_records').select('*').order('record_date', { ascending: false }),
        supabase.from('breeding_records').select('*').order('mating_date', { ascending: false }),
        supabase.from('vaccinations').select('*').order('date_given', { ascending: false }),
        supabase.from('inventory').select('*').order('name', { ascending: true }),
        supabase.from('inventory_transactions').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('feed_records').select('*').order('record_date', { ascending: false }),
        supabase.from('milk_records').select('*').order('record_date', { ascending: false }),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('recommendations').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('settings').select('*').maybeSingle(),
      ]);

      setData({
        animals: (animalsRes.data as Animal[]) ?? [],
        healthRecords: (healthRes.data as HealthRecord[]) ?? [],
        weightRecords: (weightRes.data as WeightRecord[]) ?? [],
        breedingRecords: (breedingRes.data as BreedingRecord[]) ?? [],
        vaccinations: (vaccRes.data as Vaccination[]) ?? [],
        inventory: (inventoryRes.data as InventoryItem[]) ?? [],
        inventoryTransactions: (invTxRes.data as InventoryTransaction[]) ?? [],
        feedRecords: (feedRes.data as FeedRecord[]) ?? [],
        milkRecords: (milkRes.data as MilkRecord[]) ?? [],
        notifications: (notifRes.data as Notification[]) ?? [],
        recommendations: (recRes.data as Recommendation[]) ?? [],
        settings: (settingsRes.data as Settings) ?? null,
        loading: false,
        refresh,
      });
    } catch (err) {
      console.error('Error fetching farm data:', err);
      setData((prev) => ({ ...prev, loading: false }));
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime multi-table listener to keep state instantly synced across all tabs / devices
  useEffect(() => {
    if (!user) return;

    const debouncedRefresh = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        refresh();
      }, 400);
    };

    const channel = supabase
      .channel('alpasfarm:live_data:' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'animals' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'health_records' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'breeding_records' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccinations' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_transactions' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'camera_health_screenings' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  return (
    <FarmDataContext.Provider value={data}>
      {children}
    </FarmDataContext.Provider>
  );
}

/**
 * Access the shared farm data context.
 * Guarantees single source of truth across all pages and modules.
 */
export function useFarmData(): FarmData {
  const context = useContext(FarmDataContext);
  if (context === undefined || context === null) {
    throw new Error('useFarmData must be used within a FarmDataProvider');
  }
  return context;
}
