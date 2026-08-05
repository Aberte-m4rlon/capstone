import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type {
  Animal,
  HealthRecord,
  WeightRecord,
  BreedingRecord,
  Vaccination,
  InventoryItem,
  FeedRecord,
  MilkRecord,
  Notification,
  Recommendation,
  Settings,
} from '../types';

interface FarmData {
  animals: Animal[];
  healthRecords: HealthRecord[];
  weightRecords: WeightRecord[];
  breedingRecords: BreedingRecord[];
  vaccinations: Vaccination[];
  inventory: InventoryItem[];
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
  feedRecords: [],
  milkRecords: [],
  notifications: [],
  recommendations: [],
  settings: null,
  loading: true,
  refresh: async () => {},
};

export function useFarmData(): FarmData {
  const { user } = useAuth();
  const [data, setData] = useState<FarmData>(EMPTY);

  const refresh = useCallback(async () => {
    if (!user) {
      setData({ ...EMPTY, loading: false });
      return;
    }
    setData((prev) => ({ ...prev, loading: true }));

    const [
      animalsRes,
      healthRes,
      weightRes,
      breedingRes,
      vaccRes,
      inventoryRes,
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
      feedRecords: (feedRes.data as FeedRecord[]) ?? [],
      milkRecords: (milkRes.data as MilkRecord[]) ?? [],
      notifications: (notifRes.data as Notification[]) ?? [],
      recommendations: (recRes.data as Recommendation[]) ?? [],
      settings: (settingsRes.data as Settings) ?? null,
      loading: false,
      refresh,
    });
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return data;
}
