export type Species = 'Goat' | 'Sheep';
export type Sex = 'Male' | 'Female';
export type HealthStatus = 'Healthy' | 'Monitor' | 'At Risk' | 'Critical';
export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical';
export type BreedingStatus = 'Open' | 'Pregnant' | 'Nursing' | 'Ready' | 'Not Ready' | 'Monitor';
export type VaccinationStatus = 'Up to Date' | 'Due Soon' | 'Overdue' | 'None';
export type InventoryTransactionType =
  | 'STOCK_IN'
  | 'CONSUMPTION'
  | 'REMOVAL'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'RETURN';

export interface InventoryTransaction {
  id: string;
  user_id: string;
  inventory_item_id: string;
  type: InventoryTransactionType;
  quantity: number;
  unit: string;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  previous_stock: number;
  new_stock: number;
  cost_per_unit: number | null;
  created_at: string;
}
export type NotificationType = 'Health' | 'Vaccination' | 'Breeding' | 'Weight' | 'Inventory' | 'System';
export type Priority = 'Critical' | 'Warning' | 'Normal' | 'Success';

export interface Animal {
  id: string;
  user_id: string;
  tag_id: string;
  name: string;
  species: Species;
  breed: string | null;
  sex: Sex;
  date_of_birth: string | null;
  color_markings: string | null;
  photo_url: string | null;
  weight_kg: number | null;
  health_status: HealthStatus;
  health_risk_score: number;
  current_temperature: number | null;
  current_heart_rate: number | null;
  breeding_status: BreedingStatus;
  last_mating_date: string | null;
  expected_kidding_date: string | null;
  last_vaccine_date: string | null;
  next_vaccine_date: string | null;
  vaccination_status: VaccinationStatus;
  archived: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthRecord {
  id: string;
  user_id: string;
  animal_id: string;
  record_date: string;
  temperature: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  rumen_sounds: 'Normal' | 'Reduced' | 'Absent' | 'Increased';
  famacha_score: 1 | 2 | 3 | 4 | 5 | null;
  mucous_membrane: 'Pink' | 'Pale' | 'White' | 'Red' | 'Yellow' | 'Blue';
  bloat_score: 0 | 1 | 2 | 3;
  gait: 'Normal' | 'Slight Limp' | 'Severe Limp' | 'Cannot Walk';
  appetite: 'Normal' | 'Reduced' | 'None';
  activity_level: 'Normal' | 'Low' | 'Lethargic';
  cough: boolean;
  diarrhea: boolean;
  nasal_discharge: boolean;
  eye_condition: 'Normal' | 'Discharge' | 'Cloudy';
  body_condition: 'Good' | 'Fair' | 'Poor';
  risk_score: number;
  risk_level: RiskLevel;
  reasons: string | null;
  recommendation: string | null;
  detected_conditions: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeightRecord {
  id: string;
  user_id: string;
  animal_id: string;
  record_date: string;
  weight_kg: number;
  previous_weight_kg: number | null;
  weight_change_kg: number | null;
  daily_gain_kg: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BreedingRecord {
  id: string;
  user_id: string;
  animal_id: string;
  partner_id: string | null;
  mating_date: string;
  expected_kidding_date: string | null;
  actual_kidding_date: string | null;
  offspring_count: number | null;
  status: 'Planned' | 'Pregnant' | 'Kidded' | 'Failed' | 'Monitor';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vaccination {
  id: string;
  user_id: string;
  animal_id: string;
  vaccine_name: string;
  date_given: string;
  next_due_date: string | null;
  veterinarian: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type InventoryCategory = 'Feed' | 'Medicine' | 'Vaccines' | 'Supplies' | 'Equipment' | 'Other';

export interface InventoryItem {
  id: string;
  user_id: string;
  name: string;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  minimum_stock: number;
  purchase_date: string | null;
  expiry_date: string | null;
  supplier: string | null;
  cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedRecord {
  id: string;
  user_id: string;
  animal_id: string;
  record_date: string;
  feed_type: string;
  quantity_kg: number;
  cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilkRecord {
  id: string;
  user_id: string;
  animal_id: string;
  record_date: string;
  yield_litres: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  description: string | null;
  priority: Priority;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface Recommendation {
  id: string;
  user_id: string;
  category: string;
  title: string;
  description: string | null;
  priority: Priority;
  severity_color: 'red' | 'orange' | 'yellow' | 'green' | 'blue';
  link: string | null;
  dismissed: boolean;
  created_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  farm_name: string;
  target_weight_kg: number;
  gestation_days: number;
  temp_critical: number;
  heart_rate_high: number;
  expiry_warning_days: number;
  vaccine_due_days: number;
  breeding_min_age_months: number;
  breeding_min_weight_kg: number;
  created_at: string;
  updated_at: string;
}
