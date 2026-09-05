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
        title: `${animal.name} — Lampas na sa schedule ng bakuna`,
        description: `Lampas na sa takdang petsa ang bakuna ni ${animal.name}. Bantayan ang posibleng sintomas ng sakit at mag-iskedyul agad ng pagbabakuna upang maprotektahan ang kawan.`,
        priority: 'Critical',
        dueLabel: 'Kailangan ng Aksyon',
        link: '/vaccinations',
      });
    } else if (animal.vaccination_status === 'Due Soon') {
      alerts.push({
        id: `vacc-soon-${animal.id}`,
        type: 'Vaccination',
        title: `${animal.name} — Malapit na ang schedule ng bakuna`,
        description: `Nalalapit na ang takdang araw ng bakuna ni ${animal.name}. Ihanda ang gamot sa imbentaryo at planuhin ang pag-inject sa loob ng linggong ito.`,
        priority: 'Warning',
        dueLabel: 'Ngayong Linggo',
        link: '/vaccinations',
      });
    }

    const animalHealth = healthRecords.filter((h) => h.animal_id === animal.id);
    const latestHealth = animalHealth.sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())[0];
    if (!latestHealth || daysUntil(latestHealth.record_date) < -30) {
      alerts.push({
        id: `health-${animal.id}`,
        type: 'Health',
        title: `${animal.name} — Kailangan ng regular na pagsusuri`,
        description: `Matagal nang walang naitalang health check para kay ${animal.name}. Obserbahan ang gana sa pagkain, kilos, at temperatura upang maagapan ang anumang problema.`,
        priority: 'Normal',
        dueLabel: 'Sa loob ng 3 araw',
        link: `/animals/${animal.id}`,
      });
    }

    const animalWeights = weightRecords.filter((w) => w.animal_id === animal.id);
    const latestWeight = animalWeights.sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())[0];
    if (!latestWeight || daysUntil(latestWeight.record_date) < -30) {
      alerts.push({
        id: `weight-${animal.id}`,
        type: 'Weight',
        title: `${animal.name} — Oras na para timbangin muli`,
        description: `Mahigit isang buwan nang hindi natitimbang si ${animal.name}. Timbangin upang matiyak na tama ang dagdag-timbang at maayos ang sustansya ng pakain.`,
        priority: 'Normal',
        dueLabel: 'Ngayong Linggo',
        link: '/weights',
      });
    }

    if (animal.breeding_status === 'Pregnant' && animal.expected_kidding_date) {
      const remaining = daysUntil(animal.expected_kidding_date);
      if (remaining >= 0 && remaining <= 30) {
        alerts.push({
          id: `kidding-${animal.id}`,
          type: 'Breeding',
          title: `${animal.name} — Malapit nang manganak`,
          description: `Inaasahang petsa ng panganganak: ${animal.expected_kidding_date}. Ihanda ang malinis at tuyong kulungan, bantayan ang kilos ng inahin, at maghanda sa panganganak.`,
          priority: remaining <= 7 ? 'Critical' : 'Warning',
          dueLabel: remaining <= 7 ? 'Kritikal na Araw' : `${remaining} araw`,
          link: `/animals/${animal.id}`,
        });
      }
    }
  });

  inventory.forEach((item) => {
    const status = inventoryStatus(item, settings.expiry_warning_days);
    if (status.status === 'Expired') {
      alerts.push({
        id: `inventory-${item.id}`,
        type: 'Inventory',
        title: `${item.name} — Nag-expire na ang stock`,
        description: `Paso o expired na ang gamit na ito. Huwag nang gagamitin sa mga hayop upang maiwasan ang pinsala, at itapon o palitan agad.`,
        priority: 'Critical',
        dueLabel: 'Aksyonan Agad',
        link: '/inventory',
      });
    } else if (status.status === 'Out of Stock') {
      alerts.push({
        id: `inventory-${item.id}`,
        type: 'Inventory',
        title: `${item.name} — Ubos na ang stock`,
        description: `Wala nang natitirang stock sa bodega. Mag-order o magdagdag agad upang hindi maantala ang pag-aalaga sa kawan.`,
        priority: 'Critical',
        dueLabel: 'Aksyonan Agad',
        link: '/inventory',
      });
    } else if (status.status === 'Expiring Soon') {
      alerts.push({
        id: `inventory-${item.id}`,
        type: 'Inventory',
        title: `${item.name} — Malapit nang mag-expire`,
        description: `Malapit nang mapaso ang stock na ito (${item.quantity} ${item.unit} ang natitira). Unahing gamitin o magplano ng bagong stock.`,
        priority: 'Warning',
        dueLabel: 'Malapit na',
        link: '/inventory',
      });
    } else if (status.status === 'Low Stock') {
      alerts.push({
        id: `inventory-${item.id}`,
        type: 'Inventory',
        title: `${item.name} — Mababa na ang stock`,
        description: `Mababa na sa minimum limit ang ${item.name} (${item.quantity} ${item.unit} na lamang). Mag-stock in na bago maubusan.`,
        priority: 'Warning',
        dueLabel: 'Malapit na',
        link: '/inventory',
      });
    }
  });

  const priorityOrder: Record<Priority, number> = { Critical: 0, Warning: 1, Normal: 2, Success: 3 };
  alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[a.priority]);

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
      title: `${a.name} — May napansing posibleng problema sa kalusugan`,
      description: `Mataas ang risk score (${a.health_risk_score}). Ihiwalay pansamantala at ikonsulta agad sa beterinaryo o kawani ng bukid.`,
      priority: 'Critical',
      severity_color: 'red',
      link: `/animals/${a.id}`,
    });
    priorities.push({
      id: `crit-${a.id}`,
      severity: 'critical',
      icon: 'AlertTriangle',
      title: `${a.name} — May posibleng problema sa kalusugan`,
      description: `Risk score: ${a.health_risk_score} — kailangan ng agarang atensyon`,
      link: `/animals/${a.id}`,
    });
  });

  const atRiskAnimals = activeAnimals.filter(
    (a) => a.health_status === 'At Risk' && a.health_risk_score < 80,
  );
  if (atRiskAnimals.length > 0) {
    recs.push({
      category: 'Health',
      title: `${atRiskAnimals.length} hayop ang may binabantayang kalusugan`,
      description: atRiskAnimals.map((a) => `${a.name} (Score: ${a.health_risk_score})`).join(', '),
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
      title: `${overdueVacc.length} hayop ang lampas na sa iskedyul ng bakuna`,
      description: overdueVacc.map((a) => a.name).join(', '),
      priority: 'Critical',
      severity_color: 'red',
      link: '/vaccinations',
    });
    priorities.push({
      id: 'vacc-overdue',
      severity: 'urgent',
      icon: 'Syringe',
      title: `${overdueVacc.length} hayop ang lampas sa bakuna`,
      description: overdueVacc.map((a) => a.name).join(', '),
      link: '/vaccinations',
    });
  }
  if (dueSoonVacc.length > 0) {
    recs.push({
      category: 'Vaccination',
      title: `${dueSoonVacc.length} hayop ang may paparating na iskedyul ng bakuna`,
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
        title: `${a.name} — Manganganak sa loob ng ${days} ${days === 1 ? 'araw' : 'araw'}`,
        description: `Inaasahang petsa ng panganganak: ${a.expected_kidding_date}. Ihanda ang kulungan ng panganganak.`,
        priority: days <= 7 ? 'Critical' : 'Warning',
        severity_color: days <= 7 ? 'red' : 'orange',
        link: `/animals/${a.id}`,
      });
      priorities.push({
        id: `kidding-${a.id}`,
        severity: urgency,
        icon: 'Baby',
        title: `${a.name} — inaasahang manganganak sa ${days} araw`,
        description: `Takda: ${a.expected_kidding_date}`,
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
      title: `${expiredItems.length} gamit ang nag-expire na sa imbentaryo`,
      description: expiredItems.map((i) => i.name).join(', '),
      priority: 'Critical',
      severity_color: 'red',
      link: '/inventory',
    });
  }
  if (expiringItems.length > 0) {
    recs.push({
      category: 'Inventory',
      title: `${expiringItems.length} gamit ang malapit nang mag-expire`,
      description: expiringItems.map((i) => `${i.name} (${inventoryStatus(i, settings.expiry_warning_days).label})`).join(', '),
      priority: 'Warning',
      severity_color: 'orange',
      link: '/inventory',
    });
  }
  if (outOfStock.length > 0) {
    recs.push({
      category: 'Inventory',
      title: `${outOfStock.length} gamit ang ubos na sa imbentaryo`,
      description: outOfStock.map((i) => i.name).join(', '),
      priority: 'Critical',
      severity_color: 'red',
      link: '/inventory',
    });
    priorities.push({
      id: 'inv-out',
      severity: 'urgent',
      icon: 'PackageX',
      title: `${outOfStock.length} gamit ang ubos na sa stock`,
      description: outOfStock.map((i) => i.name).join(', '),
      link: '/inventory',
    });
  }
  if (lowStockItems.length > 0) {
    recs.push({
      category: 'Inventory',
      title: `${lowStockItems.length} gamit ang mababa na ang stock`,
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
      title: `${animalsNoRecentWeight.length} hayop ang kailangang timbangin muli`,
      description: 'Magtala ng bagong timbang upang masubaybayan ang paglaki at dami ng pakain.',
      priority: 'Normal',
      severity_color: 'blue',
      link: '/weights',
    });
    priorities.push({
      id: 'weight-routine',
      severity: 'routine',
      icon: 'Scale',
      title: `${animalsNoRecentWeight.length} hayop ang dapat nang timbangin`,
      description: 'Mahigit 30 araw nang walang bagong timbang',
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
      title: `${animalsNoRecentHealth.length} hayop ang matagal nang walang health check`,
      description: 'Magsagawa ng regular na obserbasyon upang matiyak na malusog ang mga hayop.',
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
        title: `Bumababa ang timbang ni ${a.name}`,
        description: `Bumaba ang timbang sa pinakahuling tala. Suriin ang pakain at obserbahan kung may senyales ng sipon o uod.`,
        priority: 'Warning',
        severity_color: 'orange',
        link: `/animals/${a.id}`,
      });
      priorities.push({
        id: `decline-${a.id}`,
        severity: 'attention',
        icon: 'TrendingDown',
        title: `${a.name} — bumababa ang timbang`,
        description: 'Bumaba ang timbang sa pinakahuling rekord',
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
      title: `${femalesReady.length} inahin ang handa na sa pagpapalahi (breeding)`,
      description: femalesReady.map((a) => a.name).join(', '),
      priority: 'Normal',
      severity_color: 'green',
      link: '/breeding',
    });
    priorities.push({
      id: 'breeding-ready',
      severity: 'upcoming',
      icon: 'Heart',
      title: `${femalesReady.length} inahin ang handa na sa breeding`,
      description: 'Nasa wastong edad at timbang para sa pagpapalahi',
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
              category: 'Kalusugan',
              title: `May napansing posibleng problema sa kalusugan ni ${a.name} (${Math.round(prediction.probability * 100)}% tsansa)`,
              description: `Pangunahing dahilan: ${prediction.featureImportance.slice(0, 3).map((f) => f.feature).join(', ')}. Obserbahan ang hayop o kumonsulta sa beterinaryo.`,
              priority: 'Warning',
              severity_color: 'orange',
              link: `/animals/${a.id}`,
            });
          }
        }
      });
    }
  }

  // 9b. Anomaly detection
  activeAnimals.forEach((a) => {
    if (a.current_temperature !== null) {
      const temps = healthRecords.filter((r) => r.animal_id === a.id).map((r) => r.temperature).filter((t): t is number => t !== null);
      if (temps.length >= 3) {
        const anomaly = detectAnomaly(a.current_temperature, temps, 'temperature');
        if (anomaly.isAnomaly && anomaly.severity !== 'mild') {
          recs.push({
            category: 'Kalusugan',
            title: `${a.name}: may napansing kakaibang temperatura`,
            description: anomaly.message,
            priority: anomaly.severity === 'severe' ? 'Critical' : 'Warning',
            severity_color: anomaly.severity === 'severe' ? 'red' : 'orange',
            link: `/animals/${a.id}`,
          });
        }
      }
    }
  });

  // 9c. Breeding success prediction
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
          category: 'Breeding',
          title: `Mataas ang tsansa ng tagumpay sa pagpapalahi kay ${a.name} (${Math.round(pred.probability * 100)}%)`,
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
