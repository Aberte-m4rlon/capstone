/**
 * ALPASFARM - Farmer-Friendly Terminology & Formatting Helpers
 * Standardized Filipino/Taglish terms for ordinary Filipino goat & sheep farmers.
 * Consistent across Dashboard, Animals, Health, Breeding, Vaccinations, Inventory, and Alerts.
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
};

// ─── Farm & General Labels ──────────────────────────────────────────────────
export const FARM_LABELS = {
  appName: 'ALPASFARM',
  tagline: 'Smart Farm, Healthy Herd - Sistema ng Pamamahala sa Kambing at Tupa',
  dashboardTitle: 'Buod ng Bukid',
  dashboardSubtitle: 'Pangkalahatang kalagayan at mga gawain sa iyong bukid ngayong araw',
  animalsSection: 'Mga Hayop sa Bukid',
  healthSection: 'Kalagayan ng mga Hayop',
  healthSubtitle: 'Subaybayan ang kalagayan ng bawat kambing at tupa.',
  healthDisclaimer:
    'Ang sistemang ito ay gabay lamang sa maagang pagsusuri (decision support). Hindi ito opisyal na diagnosis ng beterinaryo.',
  breedingSection: 'Breeding Records',
  vaccinationSection: 'Mga Bakuna',
  inventorySection: 'Farm Inventory',
  alertsSection: 'Mga Paalala',
};

// ─── Species & Sex Terminology ──────────────────────────────────────────────
export const SPECIES_LABELS: Record<string, { singular: string; plural: string; bilingual: string }> = {
  Goat: { singular: 'Kambing', plural: 'Mga Kambing', bilingual: 'Goat / Kambing' },
  Sheep: { singular: 'Tupa', plural: 'Mga Tupa', bilingual: 'Sheep / Tupa' },
};

export const SEX_LABELS: Record<string, { label: string; short: string; symbol: string; bilingual: string }> = {
  Female: { label: 'Babaeng Hayop', short: 'Babae', symbol: 'F', bilingual: 'Female / Babae' },
  Male: { label: 'Lalaking Hayop', short: 'Lalaki', symbol: 'M', bilingual: 'Male / Lalaki' },
};

// ─── Animal Lifecycle Statuses ──────────────────────────────────────────────
export const ANIMAL_STATUS_LABELS: Record<string, { label: string; badge: string; color: string; bg: string; border: string }> = {
  Active: {
    label: 'Active / Kasalukuyan sa Bukid',
    badge: 'Active / Kasalukuyan',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
  },
  Sold: {
    label: 'Sold / Naibenta',
    badge: 'Naibenta',
    color: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
  },
  Transferred: {
    label: 'Transferred / Nailipat',
    badge: 'Nailipat',
    color: '#8B5CF6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.35)',
  },
  Deceased: {
    label: 'Deceased / Namatay',
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
    label: 'Mataas ang Risk / High Risk',
    shortLabel: 'High Risk',
    badgeText: 'Mataas ang Risk / High Risk',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    description: 'Nangangailangan ng agarang pagsusuri ng beterinaryo o mabilisang paghiwalay.',
  },
  Moderate: {
    label: 'Bantayan / Under Observation',
    shortLabel: 'Bantayan',
    badgeText: 'Bantayan / Under Observation',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    description: 'May maagang senyales ng karamdaman na dapat obserbahan at subaybayan.',
  },
  Low: {
    label: 'Maayos / Healthy',
    shortLabel: 'Maayos',
    badgeText: 'Maayos / Healthy',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    description: 'Normal ang mga visual indicators at masigla ang pangangatawan.',
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

// ─── Non-Diagnostic Health Condition Formatter ──────────────────────────────
export function formatFarmerHealthConcern(concern: string): { farmerText: string; actionText: string } {
  const lower = (concern || '').toLowerCase();

  if (lower.includes('pneumonia') || lower.includes('respiratory') || lower.includes('cough') || lower.includes('sipon') || lower.includes('nasal')) {
    return {
      farmerText: 'Posibleng Health Problem: Paghinga (ubo / sipon / mabilis na paghinga)',
      actionText: 'Manual Health Check Recommended: Ihiwalay muna ang hayop sa tuyong silungan at kumonsulta sa beterinaryo.',
    };
  }

  if (lower.includes('anemia') || lower.includes('famacha') || lower.includes('barber pole') || lower.includes('worm') || lower.includes('pale') || lower.includes('mucous')) {
    return {
      farmerText: 'Posibleng Health Problem: Bulate o Anemia (maputlang talukap ng mata)',
      actionText: 'Manual Health Check Recommended: Suriin ang talukap ng mata (FAMACHA) at maghanda ng pampurga.',
    };
  }

  if (lower.includes('bloat') || lower.includes('kabag') || lower.includes('rumen') || lower.includes('digestive')) {
    return {
      farmerText: 'Posibleng Health Problem: Kabag o Tiyan (namamagang kaliwang tagiliran)',
      actionText: 'Needs Further Observation: Huwag munang pakainin ng basang feeds; lakarin ang hayop at humingi ng tulong.',
    };
  }

  if (lower.includes('fever') || lower.includes('lagnat') || lower.includes('temperature') || lower.includes('infection')) {
    return {
      farmerText: 'Posibleng Health Problem: Mataas ang temperatura o lagnat',
      actionText: 'Veterinary Assessment Recommended: Ilayo sa matinding init, bigyan ng tubig, at obserbahan ang temperatura.',
    };
  }

  if (lower.includes('diarrhea') || lower.includes('pagtatae') || lower.includes('enterotoxemia')) {
    return {
      farmerText: 'Posibleng Health Problem: Pagtatae / Dehydration Risk',
      actionText: 'Manual Health Check Recommended: Bigyan ng electrolytes upang maiwasan ang panunuyo at humingi ng payo sa gamot.',
    };
  }

  if (lower.includes('lame') || lower.includes('pilay') || lower.includes('gait') || lower.includes('foot rot') || lower.includes('kuko') || lower.includes('scald')) {
    return {
      farmerText: 'Posibleng Health Problem: Pilay o problema sa kuko',
      actionText: 'Manual Health Check Recommended: Linisin ang ilalim ng kuko at suriin kung may sugat o dumi.',
    };
  }

  if (lower.includes('ppr') || lower.includes('viral')) {
    return {
      farmerText: 'Posibleng Health Problem: Sintomas ng viral infection',
      actionText: 'Veterinary Assessment Recommended: Agarang ihiwalay (isolate) ang hayop at ipagbigay-alam sa beterinaryo.',
    };
  }

  return {
    farmerText: `Posibleng Health Problem: ${concern}`,
    actionText: 'Needs Further Observation: Magsagawa ng regular na obserbasyon sa hayop.',
  };
}

// ─── AI Health Scanner Safety Labels ────────────────────────────────────────
export const AI_SCANNER_LABELS = {
  title: 'AI Health Scanner',
  instruction: 'Itutok ang camera sa kambing o tupa.',
  scanning: 'Scanning...',
  searching: 'Hanahanap ang kambing o tupa...',
  goatDetected: 'Kambing detected',
  sheepDetected: 'Tupa detected',
  wrongObject: 'Goat o Sheep lang ang maaaring i-scan.',
  noAnimal: 'Walang hayop na nakita. Itutok ang camera sa kambing o tupa.',
  resultTitle: 'Health Screening Result',
  possibleConcern: 'Possible Health Concern',
  healthStatus: 'Health Status',
  visualFindings: 'Visual Findings',
  recommendedAction: 'Recommended Action',
  confidence: 'Confidence',
  scanAgain: 'Scan Again',
  saveResult: 'Save Result',
  notMeasured: 'Not measured',
  disclaimer:
    'Ang resulta ay gabay lamang para sa maagang pagmamasid. Kumonsulta sa beterinaryo para sa pormal na diagnosis.',
};

// ─── Breeding Terminology ───────────────────────────────────────────────────
export const BREEDING_LABELS = {
  title: 'Breeding Records',
  subtitle: 'Talaan ng pagpaparami, pagbubuntis, at panganganak sa bukid',
  female: 'Female',
  male: 'Male',
  matingDate: 'Mating Date',
  expectedKiddingDate: 'Expected Kidding Date',
  expectedKiddingBilingual: 'Expected Kidding Date (Estimated na panganganak)',
  pregnancyStatus: 'Pregnancy Status',
  breedingStatus: 'Breeding Status',
  pregnant: 'Pregnant / Buntis',
  notPregnant: 'Not Pregnant / Hindi Buntis',
  completed: 'Completed / Tapos na',
  pending: 'Pending / Naghihintay',
  readyToBreed: 'Handa sa Pagpapalahi',
  activeBreeding: 'May Nakatalang Pagpapalahi',
  nearKidding: 'Malapit Nang Manganak',
  recentKidding: 'Bagong Panganak',
  expectedDatePrefix: 'Inaasahang Panganganak',
};

// ─── Vaccination Terminology ────────────────────────────────────────────────
export const VACCINE_LABELS = {
  title: 'Mga Bakuna',
  subtitle: 'Iskedyul ng bakuna at kaligtasan ng mga alagang kambing at tupa',
  recordVaccineBtn: 'Mag-record ng Bakuna',
  animal: 'Animal',
  vaccine: 'Vaccine',
  vaccinationDate: 'Vaccination Date',
  nextDueDate: 'Next Due Date',
  status: 'Status',
  veterinarian: 'Veterinarian',
  notes: 'Notes',
  upToDate: 'Up to Date / Updated',
  dueSoon: 'Due Soon / Malapit na',
  overdue: 'Overdue / Lampas na sa Schedule',
  upcoming: 'Bakunang Paparating',
  overdueTitle: 'Overdue na Bakuna',
  thisMonth: 'Bakunang Naibigay Ngayong Buwan',
  emptyUpcoming: 'Walang bakunang nakatakda sa susunod na 30 araw.',
  emptyOverdue: 'Lahat ng alaga ay updated sa bakuna.',
  emptyRecords: 'Wala pang vaccination records.',
};

// ─── Farm Inventory Terminology ─────────────────────────────────────────────
export const GENERAL_INVENTORY_LABELS = {
  title: 'Farm Inventory',
  englishTitle: 'General Farm Inventory',
  summarySubtitle: 'Buod ng lahat ng mayroon sa bukid.',
  livestockSection: 'Mga Hayop sa Bukid (Livestock Overview)',
  livestockSubtitle: 'Kasalukuyang bilang ng mga alagang kambing at tupa ayon sa lahi, kasarian, edad, at kalusugan',
  stocksSection: 'Farm Stocks & Resources',
  stocksSubtitle: 'Pisikal na supply ng pakain, gamot, bakuna, kagamitan, at mga kasangkapan',
  totalLivestock: 'Kabuuang Hayop',
  goats: 'Mga Kambing',
  sheep: 'Mga Tupa',
  feeds: 'Feed',
  healthSupplies: 'Health Supplies',
  equipment: 'Equipment',
  young: 'Young (< 12 buwan)',
  adult: 'Adult (≥ 12 buwan)',
  pregnant: 'Pregnant (Buntis)',
  healthy: 'Healthy (Maayos)',
  monitoring: 'Under Observation (Bantayan)',
  needsAttention: 'Needs Attention (Atensyon)',
  addItem: 'Magdagdag ng Item',
  addStock: 'Magdagdag ng Stock',
  recordUsage: 'Record Usage',
  editItem: 'I-edit',
  viewDetails: 'Tingnan ang Details',
  inStock: 'In Stock',
  lowStock: 'Mababa na ang Stock',
  expiringSoon: 'Malapit nang Mag-expire',
  expired: 'Expired na',
  outOfStock: 'Out of Stock',
};

export const INVENTORY_LABELS = GENERAL_INVENTORY_LABELS;

// ─── Alerts & Notifications Terminology ─────────────────────────────────────
export const ALERT_LABELS = {
  title: 'Mga Paalala',
  subtitle: 'Mga alerto, paalala sa bakuna, mababang stock, at kalusugan sa bukid',
  normal: 'Normal',
  paalaala: 'Paalaala',
  mahalaga: 'Mahalaga',
  urgent: 'Urgent',
  vaccineDueSoon: 'May bakuna na malapit nang due.',
  lowStockFeed: 'Mababa na ang stock ng feed.',
  itemExpiring: 'May item na malapit nang mag-expire.',
  animalNeedsAttention: 'May hayop na nangangailangan ng atensyon.',
  checkBreeding: 'May breeding record na kailangang i-check.',
  markAllRead: 'I-marka Lahat bilang Nabasa',
  emptyAlerts: 'Wala pang alerts.',
};

// ─── Reports Terminology ────────────────────────────────────────────────────
export const REPORT_LABELS = {
  title: 'Mga Ulat',
  subtitle: 'Pagsusuri at mga ulat sa hayop, kalusugan, bakuna, at imbentaryo',
  animalReport: 'Animal Report',
  healthReport: 'Health Report',
  breedingReport: 'Breeding Report',
  vaccinationReport: 'Vaccination Report',
  inventoryReport: 'Inventory Report',
  farmSummary: 'Farm Summary',
  viewReport: 'Tingnan ang Ulat',
  download: 'I-download',
  print: 'I-print',
  export: 'Export',
};

// ─── Common Action Verbs & Placeholders ──────────────────────────────────────
export const COMMON_ACTIONS = {
  addAnimal: 'Magdagdag ng Hayop',
  viewProfile: 'View Profile',
  edit: 'I-edit',
  viewRecords: 'Tingnan ang Records',
  update: 'I-update',
  save: 'I-save',
  cancel: 'I-cancel',
  delete: 'Burahin',
  search: 'Maghanap',
  filter: 'I-filter',
  export: 'I-export',
  download: 'I-download',
  print: 'I-print',
  all: 'Lahat',
  searchPlaceholder: 'Maghanap ng animal, ID, breed, o item...',
};

// ─── Standard Empty States ──────────────────────────────────────────────────
export const EMPTY_STATES = {
  animals: 'Wala pang animal records.',
  health: 'Wala pang health records.',
  vaccinations: 'Wala pang vaccination records.',
  breeding: 'Wala pang breeding records.',
  inventory: 'Wala pang inventory items.',
  alerts: 'Wala pang alerts.',
};

// ─── Form Validation Messages ───────────────────────────────────────────────
export const VALIDATION_MESSAGES = {
  requiredField: 'Kailangan ang field na ito.',
  checkInfo: 'Pakicheck ang inilagay na impormasyon.',
  savedSuccess: 'Matagumpay na na-save ang record.',
  addedSuccess: 'Matagumpay na naidagdag.',
  updatedSuccess: 'Na-update na ang animal record.',
  vaccineRecorded: 'Na-record na ang vaccination.',
  screeningSaved: 'Na-save na ang health screening.',
  saveError: 'May problema sa pag-save. Pakisubukan ulit.',
  missingInfo: 'May kulang na impormasyon.',
  animalNotFound: 'Animal ID not found.',
};

