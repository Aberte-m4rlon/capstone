import { supabase } from './supabase';
import type {
  Animal,
  WeightRecord,
  HealthRecord,
  Vaccination,
  InventoryItem,
  BreedingRecord,
  Settings,
  Notification,
  Priority,
} from '../types';
import {
  inventoryStatus,
  vaccinationStatusFromDue,
  daysUntil,
  calculateGrowth,
  calculateKiddingDate,
  monthsSince,
  assessBreedingReadiness,
} from './analytics';
import {
  trainLogisticRegression,
  predictHealthRisk,
  holtExponentialSmoothing,
  detectAnomaly,
  trainNaiveBayesBreeding,
  predictBreedingSuccess,
  type HealthFeatures,
} from './ml';

const DEFAULT_SETTINGS: Settings = {
  id: '',
  user_id: '',
  farm_name: 'AlpasFarm',
  target_weight_kg: 40,
  gestation_days: 150,
  temp_critical: 40,
  heart_rate_high: 90,
  expiry_warning_days: 15,
  vaccine_due_days: 30,
  breeding_min_age_months: 8,
  breeding_min_weight_kg: 25,
  created_at: '',
  updated_at: '',
};

export interface PriorityItem {
  id: string;
  severity: 'critical' | 'urgent' | 'attention' | 'upcoming' | 'routine';
  icon: string;
  title: string;
  description: string;
  link: string;
}

export interface SmartRecommendation {
  category: string;
  title: string;
  description: string;
  priority: Priority;
  severity_color: 'red' | 'orange' | 'yellow' | 'green' | 'blue';
  link: string;
}

export interface DailyAlert {
  id: string;
  type: 'Health' | 'Vaccination' | 'Breeding' | 'Weight' | 'Inventory';
  title: string;
  description: string;
  priority: Priority;
  dueLabel: string;
  link: string;
}

export function generateDailyAlerts(
  animals: Animal[],
  healthRecords: HealthRecord[],
  weightRecords: WeightRecord[],
  vaccinations: Vaccination[],
  inventory: InventoryItem[],
  breedingRecords: BreedingRecord[],
  settings: Settings = DEFAULT_SETTINGS,
): DailyAlert[] {
  const alerts: DailyAlert[] = [];
  const activeAnimals = animals.filter((a) => !a.archived);

  activeAnimals.forEach((animal) => {
    if (animal.vaccination_status === 'Overdue') {
      alerts.push({
        id: `vacc-overdue-${animal.id}`,
        type: 'Vaccination',
        title: `${animal.name} vaccination is overdue`,
        description: 'Schedule the next vaccination before the risk of illness rises.',
        priority: 'Critical',
        dueLabel: 'Urgent',
        link: '/vaccinations',
      });
    } else if (animal.vaccination_status === 'Due Soon') {
      alerts.push({
        id: `vacc-soon-${animal.id}`,
        type: 'Vaccination',
        title: `${animal.name} vaccination is due soon`,
        description: 'Plan the visit and prepare the required vaccine stock.',
        priority: 'Warning',
        dueLabel: 'This week',
        link: '/vaccinations',
      });
    }

    const animalHealth = healthRecords.filter((h) => h.animal_id === animal.id);
    const latestHealth = animalHealth.sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())[0];
    if (!latestHealth || daysUntil(latestHealth.record_date) < -30) {
      alerts.push({
        id: `health-${animal.id}`,
        type: 'Health',
        title: `${animal.name} needs a health check`,
        description: 'A routine health review will keep early warning signs from being missed.',
        priority: 'Normal',
        dueLabel: 'Within 3 days',
        link: `/animals/${animal.id}`,
      });
    }

    const animalWeights = weightRecords.filter((w) => w.animal_id === animal.id);
    const latestWeight = animalWeights.sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())[0];
    if (!latestWeight || daysUntil(latestWeight.record_date) < -30) {
      alerts.push({
        id: `weight-${animal.id}`,
        type: 'Weight',
        title: `${animal.name} is due for a weigh-in`,
        description: 'Update the body weight to keep growth and feed efficiency accurate.',
        priority: 'Normal',
        dueLabel: 'This week',
        link: '/weights',
      });
    }

    if (animal.breeding_status === 'Pregnant' && animal.expected_kidding_date) {
      const remaining = daysUntil(animal.expected_kidding_date);
      if (remaining >= 0 && remaining <= 30) {
        alerts.push({
          id: `kidding-${animal.id}`,
          type: 'Breeding',
          title: `${animal.name} is due to kid soon`,
          description: `Expected kidding date is ${animal.expected_kidding_date}. Prepare supplies and monitor closely.`,
          priority: remaining <= 7 ? 'Critical' : 'Warning',
          dueLabel: remaining <= 7 ? 'Critical window' : `${remaining} days`,
          link: `/animals/${animal.id}`,
        });
      }
    }
  });

  inventory.forEach((item) => {
    const status = inventoryStatus(item, settings.expiry_warning_days);
    if (status.status === 'Expired' || status.status === 'Expiring Soon' || status.status === 'Low Stock' || status.status === 'Out of Stock') {
      alerts.push({
        id: `inventory-${item.id}`,
        type: 'Inventory',
        title: `${item.name} needs attention`,
        description: `${status.label} — ${item.quantity} ${item.unit} remaining.`,
        priority: status.status === 'Expired' || status.status === 'Out of Stock' ? 'Critical' : 'Warning',
        dueLabel: status.status === 'Expired' ? 'Immediate' : 'Soon',
        link: '/inventory',
      });
    }
  });

  const priorityOrder: Record<Priority, number> = { Critical: 0, Warning: 1, Normal: 2, Success: 3 };
  alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return alerts;
}

export function generateRecommendations(
  animals: Animal[],
  healthRecords: HealthRecord[],
  weightRecords: WeightRecord[],
  vaccinations: Vaccination[],
  inventory: InventoryItem[],
  breedingRecords: BreedingRecord[],
  settings: Settings = DEFAULT_SETTINGS,
): { recommendations: SmartRecommendation[]; priorities: PriorityItem[] } {
  const recs: SmartRecommendation[] = [];
  const priorities: PriorityItem[] = [];
  const activeAnimals = animals.filter((a) => !a.archived);

  // 1. Critical health risk animals
  const criticalAnimals = activeAnimals.filter(
    (a) => a.health_status === 'Critical' || a.health_risk_score >= 80,
  );
  criticalAnimals.forEach((a) => {
    recs.push({
      category: 'Health',
      title: `${a.name} — Critical health risk`,
      description: `Health risk score is ${a.health_risk_score}. Immediate veterinary attention recommended.`,
      priority: 'Critical',
      severity_color: 'red',
      link: `/animals/${a.id}`,
    });
    priorities.push({
      id: `crit-${a.id}`,
      severity: 'critical',
      icon: 'AlertTriangle',
      title: `${a.name} — Critical health risk`,
      description: `Risk score ${a.health_risk_score} — needs immediate attention`,
      link: `/animals/${a.id}`,
    });
  });

  const atRiskAnimals = activeAnimals.filter(
    (a) => a.health_status === 'At Risk' && a.health_risk_score < 80,
  );
  if (atRiskAnimals.length > 0) {
    recs.push({
      category: 'Health',
      title: `${atRiskAnimals.length} ${atRiskAnimals.length === 1 ? 'animal has' : 'animals have'} elevated health risk`,
      description: atRiskAnimals.map((a) => `${a.name} (${a.health_risk_score})`).join(', '),
      priority: 'Warning',
      severity_color: 'orange',
      link: '/health',
    });
  }

  // 2. Overdue & due-soon vaccinations
  const overdueVacc = activeAnimals.filter((a) => a.vaccination_status === 'Overdue');
  const dueSoonVacc = activeAnimals.filter((a) => a.vaccination_status === 'Due Soon');

  if (overdueVacc.length > 0) {
    recs.push({
      category: 'Vaccination',
      title: `${overdueVacc.length} ${overdueVacc.length === 1 ? 'animal is' : 'animals are'} overdue for vaccination`,
      description: overdueVacc.map((a) => a.name).join(', '),
      priority: 'Critical',
      severity_color: 'red',
      link: '/vaccinations',
    });
    priorities.push({
      id: 'vacc-overdue',
      severity: 'urgent',
      icon: 'Syringe',
      title: `${overdueVacc.length} vaccination${overdueVacc.length === 1 ? '' : 's'} overdue`,
      description: overdueVacc.map((a) => a.name).join(', '),
      link: '/vaccinations',
    });
  }
  if (dueSoonVacc.length > 0) {
    recs.push({
      category: 'Vaccination',
      title: `${dueSoonVacc.length} ${dueSoonVacc.length === 1 ? 'animal has' : 'animals have'} vaccinations due soon`,
      description: dueSoonVacc.map((a) => a.name).join(', '),
      priority: 'Warning',
      severity_color: 'yellow',
      link: '/vaccinations',
    });
  }

  // 3. Kidding due soon
  const pregnantAnimals = activeAnimals.filter(
    (a) => a.breeding_status === 'Pregnant' && a.expected_kidding_date,
  );
  pregnantAnimals.forEach((a) => {
    const days = daysUntil(a.expected_kidding_date!);
    if (days >= 0 && days <= 30) {
      const urgency = days <= 3 ? 'critical' : days <= 7 ? 'urgent' : days <= 14 ? 'attention' : 'upcoming';
      recs.push({
        category: 'Breeding',
        title: `${a.name} — Kidding due in ${days} ${days === 1 ? 'day' : 'days'}`,
        description: `Expected kidding date: ${a.expected_kidding_date}`,
        priority: days <= 7 ? 'Critical' : 'Warning',
        severity_color: days <= 7 ? 'red' : 'orange',
        link: `/animals/${a.id}`,
      });
      priorities.push({
        id: `kidding-${a.id}`,
        severity: urgency,
        icon: 'Baby',
        title: `${a.name} expected to kid in ${days} ${days === 1 ? 'day' : 'days'}`,
        description: `Due ${a.expected_kidding_date}`,
        link: `/animals/${a.id}`,
      });
    }
  });

  // 4. Inventory alerts
  const expiredItems = inventory.filter((i) => inventoryStatus(i, settings.expiry_warning_days).status === 'Expired');
  const expiringItems = inventory.filter(
    (i) => inventoryStatus(i, settings.expiry_warning_days).status === 'Expiring Soon',
  );
  const lowStockItems = inventory.filter(
    (i) => inventoryStatus(i, settings.expiry_warning_days).status === 'Low Stock',
  );
  const outOfStock = inventory.filter(
    (i) => inventoryStatus(i, settings.expiry_warning_days).status === 'Out of Stock',
  );

  if (expiredItems.length > 0) {
    recs.push({
      category: 'Inventory',
      title: `${expiredItems.length} ${expiredItems.length === 1 ? 'item has' : 'items have'} expired`,
      description: expiredItems.map((i) => i.name).join(', '),
      priority: 'Critical',
      severity_color: 'red',
      link: '/inventory',
    });
  }
  if (expiringItems.length > 0) {
    recs.push({
      category: 'Inventory',
      title: `${expiringItems.length} ${expiringItems.length === 1 ? 'item expires' : 'items expire'} soon`,
      description: expiringItems.map((i) => `${i.name} (${inventoryStatus(i, settings.expiry_warning_days).label})`).join(', '),
      priority: 'Warning',
      severity_color: 'orange',
      link: '/inventory',
    });
  }
  if (outOfStock.length > 0) {
    recs.push({
      category: 'Inventory',
      title: `${outOfStock.length} ${outOfStock.length === 1 ? 'item is' : 'items are'} out of stock`,
      description: outOfStock.map((i) => i.name).join(', '),
      priority: 'Critical',
      severity_color: 'red',
      link: '/inventory',
    });
    priorities.push({
      id: 'inv-out',
      severity: 'urgent',
      icon: 'PackageX',
      title: `${outOfStock.length} item${outOfStock.length === 1 ? '' : 's'} out of stock`,
      description: outOfStock.map((i) => i.name).join(', '),
      link: '/inventory',
    });
  }
  if (lowStockItems.length > 0) {
    recs.push({
      category: 'Inventory',
      title: `${lowStockItems.length} ${lowStockItems.length === 1 ? 'item is' : 'items are'} below minimum stock`,
      description: lowStockItems.map((i) => i.name).join(', '),
      priority: 'Warning',
      severity_color: 'orange',
      link: '/inventory',
    });
  }

  // 5. No recent weight records
  const animalsNoRecentWeight = activeAnimals.filter((a) => {
    const animalWeights = weightRecords.filter((w) => w.animal_id === a.id);
    if (animalWeights.length === 0) return true;
    const latest = animalWeights.sort(
      (x, y) => new Date(y.record_date).getTime() - new Date(x.record_date).getTime(),
    )[0];
    return daysUntil(latest.record_date) < -30;
  });
  if (animalsNoRecentWeight.length > 0) {
    recs.push({
      category: 'Weight',
      title: `${animalsNoRecentWeight.length} ${animalsNoRecentWeight.length === 1 ? 'animal has' : 'animals have'} no recent weight record`,
      description: 'Record a weigh-in to keep growth tracking accurate.',
      priority: 'Normal',
      severity_color: 'blue',
      link: '/weights',
    });
    priorities.push({
      id: 'weight-routine',
      severity: 'routine',
      icon: 'Scale',
      title: `${animalsNoRecentWeight.length} animal${animalsNoRecentWeight.length === 1 ? '' : 's'} due for weight check`,
      description: 'No weigh-in in over 30 days',
      link: '/weights',
    });
  }

  // 6. No recent health check
  const animalsNoRecentHealth = activeAnimals.filter((a) => {
    const animalHealth = healthRecords.filter((h) => h.animal_id === a.id);
    if (animalHealth.length === 0) return true;
    const latest = animalHealth.sort(
      (x, y) => new Date(y.record_date).getTime() - new Date(x.record_date).getTime(),
    )[0];
    return daysUntil(latest.record_date) < -30;
  });
  if (animalsNoRecentHealth.length > 0) {
    recs.push({
      category: 'Health',
      title: `${animalsNoRecentHealth.length} ${animalsNoRecentHealth.length === 1 ? 'animal has' : 'animals have'} not had a health check recently`,
      description: 'Schedule a routine health check.',
      priority: 'Normal',
      severity_color: 'blue',
      link: '/health',
    });
  }

  // 7. Declining weight
  activeAnimals.forEach((a) => {
    const animalWeights = weightRecords.filter((w) => w.animal_id === a.id);
    const growth = calculateGrowth(animalWeights, settings.target_weight_kg);
    if (growth.trend === 'Declining') {
      recs.push({
        category: 'Weight',
        title: `${a.name}'s weight is declining`,
        description: `Latest trend shows weight loss. Review feed and health.`,
        priority: 'Warning',
        severity_color: 'orange',
        link: `/animals/${a.id}`,
      });
      priorities.push({
        id: `decline-${a.id}`,
        severity: 'attention',
        icon: 'TrendingDown',
        title: `${a.name} has declining weight`,
        description: 'Weight trend is going down',
        link: `/animals/${a.id}`,
      });
    }
  });

  // 8. Breeding readiness
  const femalesReady = activeAnimals.filter((a) => {
    if (a.sex !== 'Female' || a.breeding_status === 'Pregnant') return false;
    const lastMating = breedingRecords
      .filter((b) => b.animal_id === a.id)
      .sort((x, y) => new Date(y.mating_date).getTime() - new Date(x.mating_date).getTime())[0] ?? null;
    return assessBreedingReadiness(a, settings, lastMating).recommendation === 'Ready';
  });
  if (femalesReady.length > 0) {
    recs.push({
      category: 'Breeding',
      title: `${femalesReady.length} ${femalesReady.length === 1 ? 'female may be' : 'females may be'} ready for breeding`,
      description: femalesReady.map((a) => a.name).join(', '),
      priority: 'Normal',
      severity_color: 'green',
      link: '/breeding',
    });
    priorities.push({
      id: 'breeding-ready',
      severity: 'upcoming',
      icon: 'Heart',
      title: `${femalesReady.length} female${femalesReady.length === 1 ? '' : 's'} approaching breeding window`,
      description: 'Healthy and meets breeding criteria',
      link: '/breeding',
    });
  }

  // 9. ML-powered predictions
  // 9a. Train health risk model and predict for animals with current vitals
  if (healthRecords.length >= 3) {
    const trainingRows = healthRecords.map((r) => {
      const animal = animals.find((a) => a.id === r.animal_id);
      const ageMonths = animal?.date_of_birth ? monthsSince(animal.date_of_birth) : 12;
      const recentConcerning = healthRecords.filter(
        (rr) => rr.animal_id === r.animal_id && rr.record_date < r.record_date && rr.risk_score >= 30,
      ).length;
      const features: HealthFeatures = {
        temperature: r.temperature ?? 39.0, heart_rate: r.heart_rate ?? 75,
        appetite_reduced: r.appetite === 'Reduced' ? 1 : 0, appetite_none: r.appetite === 'None' ? 1 : 0,
        activity_low: r.activity_level === 'Low' ? 1 : 0, activity_lethargic: r.activity_level === 'Lethargic' ? 1 : 0,
        cough: r.cough ? 1 : 0, diarrhea: r.diarrhea ? 1 : 0, nasal_discharge: r.nasal_discharge ? 1 : 0,
        eye_abnormal: r.eye_condition !== 'Normal' ? 1 : 0, body_poor: r.body_condition === 'Poor' ? 1 : 0,
        body_fair: r.body_condition === 'Fair' ? 1 : 0, age_months: ageMonths, recent_concerning: recentConcerning,
      };
      return { features, label: r.risk_score >= 50 ? 1 : 0 };
    });
    const mlModel = trainLogisticRegression(trainingRows, { epochs: 300, learningRate: 0.05 });

    if (mlModel.weights.length > 0) {
      activeAnimals.forEach((a) => {
        if (a.current_temperature !== null || a.current_heart_rate !== null) {
          const features: HealthFeatures = {
            temperature: a.current_temperature ?? 39.0, heart_rate: a.current_heart_rate ?? 75,
            appetite_reduced: 0, appetite_none: 0, activity_low: 0, activity_lethargic: 0,
            cough: 0, diarrhea: 0, nasal_discharge: 0, eye_abnormal: 0, body_poor: 0, body_fair: 0,
            age_months: a.date_of_birth ? monthsSince(a.date_of_birth) : 12, recent_concerning: 0,
          };
          const prediction = predictHealthRisk(features, mlModel);
          if (prediction.probability >= 0.7 && a.health_risk_score < 50) {
            recs.push({
              category: 'ML Prediction',
              title: `AI predicts ${a.name} is at elevated risk (${Math.round(prediction.probability * 100)}% probability)`,
              description: `ML model confidence: ${prediction.confidence}%. Top contributing factors: ${prediction.featureImportance.slice(0, 3).map((f) => f.feature).join(', ')}`,
              priority: 'Warning',
              severity_color: 'orange',
              link: `/animals/${a.id}`,
            });
          }
        }
      });
    }
  }

  // 9b. ML anomaly detection
  activeAnimals.forEach((a) => {
    if (a.current_temperature !== null) {
      const temps = healthRecords.filter((r) => r.animal_id === a.id).map((r) => r.temperature).filter((t): t is number => t !== null);
      if (temps.length >= 3) {
        const anomaly = detectAnomaly(a.current_temperature, temps, 'temperature');
        if (anomaly.isAnomaly && anomaly.severity !== 'mild') {
          recs.push({
            category: 'ML Anomaly',
            title: `${a.name}: anomalous temperature detected (z-score: ${anomaly.zScore})`,
            description: anomaly.message,
            priority: anomaly.severity === 'severe' ? 'Critical' : 'Warning',
            severity_color: anomaly.severity === 'severe' ? 'red' : 'orange',
            link: `/animals/${a.id}`,
          });
        }
      }
    }
  });

  // 9c. ML breeding success prediction
  if (breedingRecords.length >= 1) {
    const breedingData = breedingRecords.map((r) => {
      const animal = animals.find((a) => a.id === r.animal_id);
      return {
        ageMonths: animal?.date_of_birth ? monthsSince(animal.date_of_birth) : 12,
        weightKg: Number(animal?.weight_kg) || 30,
        healthStatus: animal?.health_status ?? 'Healthy',
        species: animal?.species ?? 'Goat',
        success: r.status === 'Pregnant' || r.status === 'Kidded',
      };
    });
    const nbModel = trainNaiveBayesBreeding(breedingData);
    activeAnimals.filter((a) => a.sex === 'Female' && a.breeding_status !== 'Pregnant').forEach((a) => {
      const pred = predictBreedingSuccess(
        a.date_of_birth ? monthsSince(a.date_of_birth) : 12,
        Number(a.weight_kg) || 30, a.health_status, a.species, nbModel,
      );
      if (pred.probability >= 0.7) {
        recs.push({
          category: 'ML Breeding',
          title: `AI predicts high breeding success for ${a.name} (${Math.round(pred.probability * 100)}%)`,
          description: pred.recommendation,
          priority: 'Normal',
          severity_color: 'green',
          link: '/breeding',
        });
      }
    });
  }

  // Sort priorities by severity
  const severityOrder: Record<string, number> = { critical: 0, urgent: 1, attention: 2, upcoming: 3, routine: 4 };
  priorities.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const priorityOrder: Record<Priority, number> = { Critical: 0, Warning: 1, Normal: 2, Success: 3 };
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return { recommendations: recs, priorities };
}

export async function createNotification(
  userId: string,
  type: Notification['type'],
  title: string,
  description: string | null,
  priority: Priority,
  link: string | null = null,
): Promise<void> {
  await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    description,
    priority,
    link,
  });
}

export { calculateKiddingDate, vaccinationStatusFromDue, monthsSince };
