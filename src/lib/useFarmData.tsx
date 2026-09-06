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
  const { user, profile } = useAuth();
  const [data, setData] = useState<FarmData>(EMPTY);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSuperAdmin = profile?.role === 'super_admin';

  const refresh = useCallback(async () => {
    if (!user) {
      setData({ ...EMPTY, loading: false });
      return;
    }

    try {
      let animalsQ = supabase.from('animals').select('*').order('created_at', { ascending: false });
      let healthQ = supabase.from('health_records').select('*').order('record_date', { ascending: false });
      let weightQ = supabase.from('weight_records').select('*').order('record_date', { ascending: false });
      let breedingQ = supabase.from('breeding_records').select('*').order('mating_date', { ascending: false });
      let vaccQ = supabase.from('vaccinations').select('*').order('date_given', { ascending: false });
      let inventoryQ = supabase.from('inventory').select('*').order('name', { ascending: true });
      let invTxQ = supabase.from('inventory_transactions').select('*').order('created_at', { ascending: false }).limit(500);
      let feedQ = supabase.from('feed_records').select('*').order('record_date', { ascending: false });
      let milkQ = supabase.from('milk_records').select('*').order('record_date', { ascending: false });
      let notifQ = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
      let recQ = supabase.from('recommendations').select('*').order('created_at', { ascending: false }).limit(50);
      let settingsQ = supabase.from('settings').select('*');

      // Strict user data isolation: non-super_admin users only receive their own farm records
      if (!isSuperAdmin) {
        animalsQ = animalsQ.eq('user_id', user.id);
        healthQ = healthQ.eq('user_id', user.id);
        weightQ = weightQ.eq('user_id', user.id);
        breedingQ = breedingQ.eq('user_id', user.id);
        vaccQ = vaccQ.eq('user_id', user.id);
        inventoryQ = inventoryQ.eq('user_id', user.id);
        invTxQ = invTxQ.eq('user_id', user.id);
        feedQ = feedQ.eq('user_id', user.id);
        milkQ = milkQ.eq('user_id', user.id);
        notifQ = notifQ.eq('user_id', user.id);
        recQ = recQ.eq('user_id', user.id);
        settingsQ = settingsQ.eq('user_id', user.id);
      }

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
        animalsQ,
        healthQ,
        weightQ,
        breedingQ,
        vaccQ,
        inventoryQ,
        invTxQ,
        feedQ,
        milkQ,
        notifQ,
        recQ,
        settingsQ.maybeSingle(),
      ]);

      const fallbackSettings: Settings = {
        id: 'default-settings-' + user.id,
        user_id: user.id,
        farm_name: profile?.full_name ? `${profile.full_name}'s Farm` : 'My Farm',
        target_weight_kg: 40,
        gestation_days: 150,
        temp_critical: 40,
        heart_rate_high: 90,
        expiry_warning_days: 15,
        vaccine_due_days: 30,
        breeding_min_age_months: 8,
        breeding_min_weight_kg: 25,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

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
        settings: (settingsRes.data as Settings) ?? fallbackSettings,
        loading: false,
        refresh,
      });
    } catch (err) {
      console.error('Error fetching farm data:', err);
      setData((prev) => ({ ...prev, loading: false }));
    }
  }, [user, isSuperAdmin, profile?.full_name]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime multi-table listener to keep state instantly synced across all tabs / devices
  // Scoped to current user's user_id so changes from other farms are ignored
  useEffect(() => {
    if (!user) return;

    const debouncedRefresh = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        refresh();
      }, 400);
    };

    const filter = isSuperAdmin ? undefined : `user_id=eq.${user.id}`;

    const channel = supabase
      .channel('alpasfarm:live_data:' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'animals', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'health_records', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_records', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'breeding_records', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccinations', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_transactions', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_records', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milk_records', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'camera_health_screenings', filter }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter }, debouncedRefresh)
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, isSuperAdmin, refresh]);

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
