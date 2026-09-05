/**
 * ALPASFARM - Farmer-Friendly Terminology & Formatting Helpers
 * Standardized Filipino/Taglish terms for ordinary Filipino goat & sheep farmers.
 * Consistent across Dashboard, Animals, Health, Breeding, Vaccinations, Inventory, and Alerts.
 * Strictly adheres to non-diagnostic veterinary advisory language and non-invasive surface temperature measurement.
 */

// ─── Main Navigation Labels ─────────────────────────────────────────────────
export const NAV_LABELS = {
  dashboard: 'Buod ng Bukid',
  animals: 'Mga Hayop',
  animalManagement: 'Pamamahala ng Hayop',
  health: 'Health Monitoring',
  aiHealthScanner: 'AI Health Scanner',
  breeding: 'Breeding',
  vaccinations: 'Mga Bakuna',
  inventory: 'Farm Inventory',
  alerts: 'Mga Paalala',
  reports: 'Mga Ulat',
  aiAssistant: 'AI Farm Assistant',
  users: 'Mga User',
  settings: 'Mga Setting',
  logout: 'Mag-logout',
  profile: 'Aking Profile',
  more: 'Iba Pa',
};

// ─── Mobile Bottom Navigation (Strict 5 items) ──────────────────────────────
export const MOBILE_NAV_LABELS = {
  dashboard: 'Buod',
  animals: 'Mga Hayop',
  add: '+',
  alerts: 'Mga Paalala',
  more: 'Iba Pa',
};

// ─── Farm & General Dashboard Labels ─────────────────────────────────────────
export const FARM_LABELS = {
  appName: 'ALPASFARM',
  tagline: 'Smart Farm, Healthy Herd - Sistema ng Pamamahala sa Kambing at Tupa',
  dashboardTitle: 'Buod ng Bukid',
  dashboardQuestion: 'Kamusta ang bukid ko ngayon?',
  dashboardSubtitle: 'Pangkalahatang kalagayan at mga gawain sa iyong bukid ngayong araw',
  animalsSection: 'Mga Hayop sa Bukid',
  healthSection: 'Kalagayan ng mga Hayop',
  healthSubtitle: 'Subaybayan ang kalagayan ng bawat kambing at tupa.',
  healthDisclaimer:
    'Ang sistemang ito ay gabay lamang sa maagang pagsusuri (decision support). Hindi ito opisyal na diagnosis ng beterinaryo.',
  breedingSection: 'Breeding',
  vaccinationSection: 'Mga Bakuna',
  inventorySection: 'Farm Inventory',
  alertsSection: 'Mga Paalala',

  // Stat KPI Cards
  cardTotalAnimals: 'Mga Hayop sa Bukid',
  cardGoats: 'Mga Kambing',
  cardSheep: 'Mga Tupa',
  cardHealthy: 'Maayos',
  cardMonitoring: 'Bantayan',
  cardNeedsAttention: 'Kailangan ng Atensyon',
  cardNeedsMedication: 'Kailangan ng Gamot',
  cardPregnant: 'Mga Buntis',
  cardVaccineDueSoon: 'Bakunang Malapit na',
  cardLowStock: 'Mababa ang Stock',
  cardExpiringSoon: 'Malapit nang Mag-expire',
};

/** Format counts into farmer-friendly head count ("42 ulo") */
export function formatHeadCount(count: number): string {
  return `${count} ulo`;
}

/** Format total animal count ("60 kabuuang hayop") */
export function formatTotalHerd(count: number): string {
  return `${count} kabuuang hayop`;
};

// ─── Species & Sex Terminology ──────────────────────────────────────────────
export const SPECIES_LABELS: Record<string, { singular: string; plural: string; bilingual: string }> = {
  Goat: { singular: 'Kambing', plural: 'Mga Kambing', bilingual: 'Kambing (Goat)' },
  Sheep: { singular: 'Tupa', plural: 'Mga Tupa', bilingual: 'Tupa (Sheep)' },
};

export const SEX_LABELS: Record<string, { label: string; short: string; symbol: string; bilingual: string }> = {
  Female: { label: 'Babaeng Hayop', short: 'Babae', symbol: 'F', bilingual: 'Babae (Female)' },
  Male: { label: 'Lalaking Hayop', short: 'Lalaki', symbol: 'M', bilingual: 'Lalaki (Male)' },
};

// ─── Animal Lifecycle Statuses ──────────────────────────────────────────────
export const ANIMAL_STATUS_LABELS: Record<string, { label: string; badge: string; color: string; bg: string; border: string }> = {
  Active: {
    label: 'Kasalukuyan sa Bukid (Active)',
    badge: 'Kasalukuyan sa Bukid',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
  },
  Sold: {
    label: 'Naibenta (Sold)',
    badge: 'Naibenta',
    color: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
  },
  Transferred: {
    label: 'Nailipat (Transferred)',
    badge: 'Nailipat',
    color: '#8B5CF6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.35)',
  },
  Deceased: {
    label: 'Namatay (Deceased)',
    badge: 'Namatay',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
  },
};

// ─── Monthly Comparison Formatter (Never "0+0 this month") ───────────────────
export function formatMonthlyAnimalGrowth(count: number): string {
  if (count <= 0) {
    return 'Walang bagong hayop ngayong buwan';
  }
  if (count === 1) {
    return '+1 bagong hayop ngayong buwan';
  }
  return `+${count} bagong hayop ngayong buwan`;
}

// ─── Health Risk Tiers ──────────────────────────────────────────────────────
export interface HealthTierConfig {
  label: string;
  shortLabel: string;
  badgeText: string;
  color: string;
  bg: string;
  border: string;
  description: string;
}

export const HEALTH_TIERS: Record<'High' | 'Moderate' | 'Low', HealthTierConfig> = {
  High: {
    label: 'Kailangan ng Atensyon / Needs Attention',
    shortLabel: 'Kailangan ng Atensyon',
    badgeText: 'Kailangan ng Atensyon / Needs Attention',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    description: 'Inirerekomendang suriin agad ang hayop o kumonsulta sa beterinaryo.',
  },
  Moderate: {
    label: 'Bantayan / Under Observation',
    shortLabel: 'Bantayan',
    badgeText: 'Bantayan / Under Observation',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    description: 'May napansing senyales na kailangang obserbahan at subaybayan.',
  },
  Low: {
    label: 'Maayos / Healthy',
    shortLabel: 'Maayos',
    badgeText: 'Maayos / Healthy',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    description: 'Masigla at maayos ang pangkalahatang pangangatawan ng hayop.',
  },
};

export const HEALTH_STATUS_BILINGUAL: Record<string, string> = {
  Healthy: 'Maayos / Healthy',
  Normal: 'Maayos / Healthy',
  'Under Observation': 'Bantayan / Under Observation',
  Monitor: 'Bantayan / Under Observation',
  'Needs Attention': 'Nangangailangan ng Atensyon / Needs Attention',
  'High Risk': 'Mataas ang Risk / High Risk',
  Critical: 'Mataas ang Risk / High Risk',
  Sick: 'Mataas ang Risk / High Risk',
};

// ─── Simple Explanations for Health Signs (Replacing Medical Jargon) ─────────
export function simplifyHealthObservation(rawText: string | null | undefined): string {
  if (!rawText || !rawText.trim()) return 'Normal ang hitsura at masigla ang hayop.';
  const lower = rawText.toLowerCase();

  if (lower.includes('respiratory') || lower.includes('breathing') || lower.includes('cough') || lower.includes('hinga')) {
    return 'May napansing kakaiba sa paghinga ng hayop.';
  }
  if (lower.includes('appetite') || lower.includes('pagkain') || lower.includes('reduced feed')) {
    return 'Mas kaunti ang pagkain kaysa dati.';
  }
  if (lower.includes('nasal') || lower.includes('discharge') || lower.includes('sipon')) {
    return 'May lumalabas na sipon o discharge sa ilong.';
  }
  if (lower.includes('dehydration') || lower.includes('kulang sa tubig') || lower.includes('panunuyo')) {
    return 'Posibleng kulang sa tubig ang hayop.';
  }
  if (lower.includes('poor body condition') || lower.includes('emaciat') || lower.includes('payat') || lower.includes('low bcs')) {
    return 'Medyo payat o mababa ang body condition.';
  }
  if (lower.includes('lameness') || lower.includes('pilay') || lower.includes('limp') || lower.includes('paa')) {
    return 'May napansing pilay o hirap sa pagtayo o paglakad.';
  }
  if (lower.includes('bloat') || lower.includes('kabag') || lower.includes('rumen') || lower.includes('tiyan')) {
    return 'May napansing pamamaga o kabag sa kaliwang tagiliran.';
  }
  if (lower.includes('fever') || lower.includes('lagnat') || lower.includes('temperature')) {
    return 'Mataas ang surface temperature ng hayop.';
  }
  if (lower.includes('diarrhea') || lower.includes('pagtatae') || lower.includes('scour')) {
    return 'May napansing basang dumi o pagtatae.';
  }
  if (lower.includes('pale') || lower.includes('putla') || lower.includes('anemia') || lower.includes('famacha')) {
    return 'Medyo maputla ang talukap ng mata (posibleng bulate o anemia).';
  }
  if (lower.includes('letharg') || lower.includes('matamlay') || lower.includes('isolated') || lower.includes('nakabukod')) {
    return 'Matamlay o nakabukod sa kawan.';
  }

  return rawText;
}

// ─── Non-Diagnostic Health Condition Formatter ──────────────────────────────
export function formatFarmerHealthConcern(concern: string): { farmerText: string; actionText: string } {
  const lower = (concern || '').toLowerCase();

  if (lower.includes('pneumonia') || lower.includes('respiratory') || lower.includes('cough') || lower.includes('sipon') || lower.includes('nasal')) {
    return {
      farmerText: 'May napansing kakaiba sa paghinga ng hayop (ubo / sipon / mabilis na paghinga)',
      actionText: 'Ihiwalay muna ang hayop sa tuyong silungan at kumonsulta sa beterinaryo kung magpatuloy.',
    };
  }

  if (lower.includes('anemia') || lower.includes('famacha') || lower.includes('barber pole') || lower.includes('worm') || lower.includes('pale') || lower.includes('mucous')) {
    return {
      farmerText: 'May senyales ng anemia o posibleng bulate (maputlang talukap ng mata)',
      actionText: 'Suriin ang talukap ng mata (FAMACHA) at maghanda ng angkop na pampurga.',
    };
  }

  if (lower.includes('bloat') || lower.includes('kabag') || lower.includes('rumen') || lower.includes('digestive')) {
    return {
      farmerText: 'May napansing pamamaga o kabag sa tiyan (kaliwang tagiliran)',
      actionText: 'Huwag munang pakainin ng basang damo o feeds; lakarin ang hayop at humingi ng payo.',
    };
  }

  if (lower.includes('fever') || lower.includes('lagnat') || lower.includes('temperature') || lower.includes('infection')) {
    return {
      farmerText: 'Mataas ang naitalang surface temperature',
      actionText: 'Ilayo sa matinding sikat ng araw, bigyan ng sariwang tubig, at suriing muli ang temperatura.',
    };
  }

  if (lower.includes('diarrhea') || lower.includes('pagtatae') || lower.includes('enterotoxemia')) {
    return {
      farmerText: 'May napansing pagtatae (posibleng kulang sa tubig)',
      actionText: 'Bigyan ng malinis na tubig na may electrolytes upang maiwasan ang panunuyo at humingi ng payo.',
    };
  }

  if (lower.includes('lame') || lower.includes('pilay') || lower.includes('gait') || lower.includes('foot rot') || lower.includes('kuko') || lower.includes('scald')) {
    return {
      farmerText: 'May napansing pilay o problema sa kuko',
      actionText: 'Linisin ang ilalim ng kuko at suriin kung may sugat, tinik, o dumi.',
    };
  }

  if (lower.includes('ppr') || lower.includes('viral')) {
    return {
      farmerText: 'May napansing posibleng impeksyon o matamlay na kalagayan',
      actionText: 'Agarang ihiwalay (isolate) ang hayop sa ibang kawan at ipagbigay-alam sa beterinaryo.',
    };
  }

  return {
    farmerText: `May napansing posibleng problema sa kalusugan: ${simplifyHealthObservation(concern)}`,
    actionText: 'Obserbahan muna ang hayop at tingnan kung may iba pang sintomas.',
  };
}

// ─── AI Health Scanner Safety & Guidance Labels ─────────────────────────────
export const AI_SCANNER_LABELS = {
  title: 'AI Health Scanner',
  instruction: 'Itutok ang camera sa kambing o tupa.',
  step1: 'Itutok ang camera sa kambing o tupa.',
  step2: 'Hinahanap ang hayop...',
  searching: 'Hinahanap ang hayop...',
  goatDetected: 'Kambing ang nakita.',
  sheepDetected: 'Tupa ang nakita.',
  wrongObject: 'Hindi ito kambing o tupa.',
  noAnimal: 'Pakiharap ang camera sa kambing o tupa.',
  lowConfidence: 'Mahina ang pagkakakita. Lumapit nang kaunti at tiyaking malinaw ang hayop.',
  blurryImage: 'Malabo ang kuha. Subukang lumapit at iwasan ang sobrang liwanag.',

  // Thermal Camera Status (Strictly Non-Invasive Surface Temperature)
  thermalConnected: 'Thermal Camera: Connected',
  thermalDisconnected: 'Thermal Camera: Hindi Nakakonekta',
  thermalMeasuring: 'Kinukuha ang surface temperature...',
  surfaceTemperature: 'Surface Temperature',
  tempNotMeasured: 'Temperature: Hindi nasukat',

  // Non-Diagnostic Advisory Results
  resultTitle: 'Possible Health Concern',
  resultSummaryTagalog: 'May napansing posibleng problema sa kalusugan.',
  observationNotice: 'May ilang senyales na kailangan bantayan.',
  defaultFarmerAdvice: 'Obserbahan muna ang hayop at tingnan kung may iba pang sintomas.',
  disclaimer:
    'Ang resulta ay gabay lamang para sa maagang pagmamasid. Hindi ito opisyal na diagnosis ng beterinaryo.',
  scanAgain: 'Mag-scan Ulit',
  saveResult: 'I-save ang Resulta',
};

// ─── Breeding Terminology ───────────────────────────────────────────────────
export const BREEDING_LABELS = {
  title: 'Breeding',
  subtitle: 'Talaan ng pagpaparami, pagbubuntis, at panganganak sa bukid',
  pregnantList: 'Mga Buntis',
  readyToBreed: 'Handa sa Pagpapalahi',
  hasMatingRecord: 'May Rekord ng Pagtatalik',
  recentKidding: 'Bagong Panganak',
  pregnant: 'Buntis',
  kiddingSoon: 'Posibleng Manganganak sa loob ng 30 araw',
  matingRecord: 'Rekord ng Pagpapalahi',
  expectedKidding: 'Inaasahang Panganganak',
  expectedKiddingShort: 'Inaasahang Panganganak',
  female: 'Babae',
  male: 'Lalaki',
  matingDate: 'Petsa ng Pagtatalik (Mating Date)',
  status: 'Kalagayan sa Pagpapalahi',
  notes: 'Mga Tala',
  saveRecord: 'I-save ang Pagpapalahi',
};

// ─── Vaccination Terminology ────────────────────────────────────────────────
export const VACCINE_LABELS = {
  title: 'Mga Bakuna',
  subtitle: 'Iskedyul ng bakuna at proteksyon ng mga alagang kambing at tupa',
  given: 'Bakunang Naibigay',
  nextDue: 'Susunod na Bakuna',
  dueSoon: 'Bakuna na Malapit nang Due',
  dueNow: 'Bakuna na Due na',
  status: 'Kalagayan ng Bakuna',
  recordVaccineBtn: 'Mag-record ng Bakuna',
  animal: 'Hayop',
  vaccine: 'Pangalan ng Bakuna',
  vaccinationDate: 'Petsa ng Bakuna',
  nextDueDate: 'Petsa ng Susunod na Bakuna',
  veterinarian: 'Beterinaryo o Nagbakuna',
  notes: 'Mga Tala',
  upToDate: 'Up to Date / Updated',
  overdue: 'Due na / Lampas sa Schedule',
  emptyUpcoming: 'Walang bakunang nakatakda sa susunod na 30 araw.',
  emptyOverdue: 'Walang bakuna na due ngayon.',
  emptyRecords: 'Wala pang rekord ng bakuna.',
};

// ─── Farm Inventory Terminology ─────────────────────────────────────────────
export const GENERAL_INVENTORY_LABELS = {
  title: 'Farm Inventory',
  friendlyTitle: 'Mga Gamit at Stock',
  question: 'Anong mayroon at kulang sa bukid?',
  totalItems: 'Kabuuang Gamit',
  lowStock: 'Mababa ang Stock',
  expiringSoon: 'Malapit nang Mag-expire',
  stockValue: 'Halagang Natitira sa Stock',

  // 5 Canonical Categories
  categories: {
    animals: 'Mga Hayop',
    feed: 'Pakain',
    health: 'Gamot at Health Supplies',
    supplies: 'Mga Gamit sa Bukid',
    tools: 'Tools at Equipment',
  },

  // Stock status
  inStock: 'Sapat ang Stock',
  lowStockLabel: 'Mababa na ang stock',
  expiredLabel: 'Expired na',

  // Actions
  addItem: 'Magdagdag ng Item',
  addStock: 'Magdagdag ng Stock',
  recordUsage: 'Mag-record ng Paggamit',
  editItem: 'I-edit',
  viewDetails: 'Tingnan ang Detalye',

  // Transactions
  txStockIn: 'Dagdag Stock',
  txConsumption: 'Nagamit',
  txRemoval: 'Inalis',
  txAdjIn: 'Dagdag Ayos (+)',
  txAdjOut: 'Bawas Ayos (−)',
  txReturn: 'Isinauli',
};

export const INVENTORY_LABELS = GENERAL_INVENTORY_LABELS;

// ─── Alerts & Notifications Terminology (WHAT happened, WHAT needs attention, WHAT to do) ───
export const ALERT_LABELS = {
  title: 'Mga Paalala',
  subtitle: 'Alamin kung ano ang nangyari, ano ang dapat bantayan, at ano ang kailangang gawin.',
  markAllRead: 'I-marka Lahat bilang Nabasa',
  emptyAlerts: 'Walang kailangang aksyunan ngayon.',
  allGood: 'Lahat ay maayos sa bukid.',
};

// ─── Reports Terminology ────────────────────────────────────────────────────
export const REPORT_LABELS = {
  title: 'Mga Ulat',
  subtitle: 'Tingnan, i-download, o i-print ang buod ng impormasyon sa bukid',
  animalReport: 'Ulat sa mga Hayop',
  healthReport: 'Ulat sa Kalusugan',
  breedingReport: 'Ulat sa Pagpapalahi / Breeding',
  weightReport: 'Ulat sa Timbang',
  vaccinationReport: 'Ulat sa Bakuna',
  inventoryReport: 'Ulat sa Gamot at Stock',
  farmSummary: 'Pangkalahatang Buod ng Bukid',
  download: 'I-download',
  print: 'I-print',
  export: 'I-export',
};

// ─── Common Action Verbs ────────────────────────────────────────────────────
export const COMMON_ACTIONS = {
  save: 'I-save',
  edit: 'I-edit',
  delete: 'Burahin',
  cancel: 'Kanselahin',
  back: 'Bumalik',
  viewDetails: 'Tingnan ang Detalye',
  add: 'Magdagdag',
  record: 'Mag-record',
  download: 'I-download',
  print: 'I-print',
  search: 'Maghanap',
  searchPlaceholder: 'Maghanap ng hayop, ID, gamit, o record...',
  all: 'Lahat',
  addAnimal: 'Magdagdag ng Hayop',
  saveAnimal: 'I-save ang Hayop',
};

// ─── Standard Empty States ──────────────────────────────────────────────────
export const EMPTY_STATES = {
  animals: 'Wala pang hayop na nakalagay.',
  health: 'Wala pang health record para sa hayop na ito.',
  vaccinations: 'Walang bakuna na due ngayon.',
  breeding: 'Wala pang rekord ng pagpapalahi.',
  inventory: 'Lahat ng stock ay nasa maayos na dami.',
  alerts: '🎉 Walang kailangang aksyunan ngayon.',
  noData: 'Walang nahanap na record.',
};

// ─── Form Validation & Feedback Messages ───────────────────────────────────
export const VALIDATION_MESSAGES = {
  fetchError: 'May problema sa pagkuha ng data. Subukan ulit.',
  saveError: 'Hindi mai-save ang impormasyon. Pakitingnan ang mga nilagay na detalye.',
  nameOrTagRequired: 'Pakilagay ang pangalan o Tag ID ng hayop.',
  savedSuccess: 'Matagumpay na na-save ang impormasyon.',
  deletedSuccess: 'Matagumpay na nabura ang rekord.',
  updatedSuccess: 'Na-update na ang rekord.',
};

// ─── Confirmation Dialogs ───────────────────────────────────────────────────
export const CONFIRMATION_MESSAGES = {
  deleteAnimalTitle: 'Sigurado ka bang nais mong burahin ang hayop na ito?',
  deleteAnimalDesc: 'Hindi na ito maibabalik kapag nabura.',
  confirmDelete: 'Oo, Burahin',
  cancelDelete: 'Huwag Muna',
};

// ─── Tooltips & Helpful Explanations ────────────────────────────────────────
export const TOOLTIPS_HELP = {
  famacha: 'Pagsusuri sa kulay ng talukap ng mata para malaman kung may anemia o bulate.',
  bcs: 'Pagsusuri kung payat, tama lang, o mataba ang hayop.',
  temperature: 'Surface temperature ng hayop gamit ang thermal sensor o thermometer.',
  kiddingDate: 'Tinatayang petsa kung kailan manganganak ang hayop.',
};

