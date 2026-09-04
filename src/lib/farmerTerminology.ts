/**
 * ALPASFARM - Farmer-Friendly Terminology & Formatting Helpers
 * Standardized Filipino/Taglish terms for ordinary Filipino goat & sheep farmers.
 * Consistent across Dashboard, Animals, Health, Breeding, Vaccinations, Inventory, and Alerts.
 */

// ─── Farm & General Labels ──────────────────────────────────────────────────
export const FARM_LABELS = {
  appName: 'ALPASFARM',
  tagline: 'Smart Farm, Healthy Herd - Sistema ng Pamamahala sa Kambing at Tupa',
  dashboardTitle: 'Buod ng Bukid',
  dashboardSubtitle: 'Pangkalahatang kalagayan at mga gawain sa iyong bukid ngayong araw',
  animalsSection: 'Mga Hayop sa Bukid',
  healthSection: 'Kalagayan ng mga Hayop',
  healthSubtitle: 'Pagsusuri at Maagang Babala sa Kalusugan',
  healthDisclaimer:
    'Ang sistemang ito ay isang Pagsusuri at Maagang Babala (Health Screening and Early Warning System). Hindi ito pamalit sa pagsusuri ng isang lisensyadong beterinaryo.',
  breedingSection: 'Pagpaparami at Panganganak',
  vaccinationSection: 'Bakuna at Proteksyon',
  inventorySection: 'Mga Kagamitan at Supplies',
  alertsSection: 'Mga Alerto at Paalala',
};

// ─── Species & Sex Terminology ──────────────────────────────────────────────
export const SPECIES_LABELS: Record<string, { singular: string; plural: string }> = {
  Goat: { singular: 'Kambing', plural: 'Mga Kambing' },
  Sheep: { singular: 'Tupa', plural: 'Mga Tupa' },
};

export const SEX_LABELS: Record<string, { label: string; short: string; symbol: string }> = {
  Female: { label: 'Babaeng Hayop', short: 'Babae', symbol: 'F' },
  Male: { label: 'Lalaking Hayop', short: 'Lalaki', symbol: 'M' },
};

// ─── Monthly Comparison Formatter ───────────────────────────────────────────
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
    label: 'Mataas ang Panganib (Nangangailangan ng Beterinaryo)',
    shortLabel: 'Mataas ang Panganib',
    badgeText: 'Mataas ang Panganib',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    description: 'May malubhang sintomas na nangangailangan ng agarang pansin o pagsusuri ng doktor ng hayop.',
  },
  Moderate: {
    label: 'Bantayan / Nangangailangan ng Atensyon',
    shortLabel: 'Bantayan',
    badgeText: 'Nangangailangan ng Atensyon',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    description: 'May maagang senyales ng karamdaman na dapat obserbahan at subaybayan.',
  },
  Low: {
    label: 'Maayos ang Kalagayan (Malusog)',
    shortLabel: 'Malusog',
    badgeText: 'Maayos ang Kalagayan',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    description: 'Normal ang mga vital signs at masigla ang pangangatawan.',
  },
};

// ─── Non-Diagnostic Health Condition Formatter ──────────────────────────────
export function formatFarmerHealthConcern(concern: string): { farmerText: string; actionText: string } {
  const lower = (concern || '').toLowerCase();

  if (lower.includes('pneumonia') || lower.includes('respiratory') || lower.includes('cough') || lower.includes('sipon') || lower.includes('nasal')) {
    return {
      farmerText: 'Posibleng problema sa paghinga (ubo / sipon / mabilis na paghinga)',
      actionText: 'Ihiwalay muna ang hayop sa tuyong silungan. Bantayan ang lagnat at kumonsulta sa beterinaryo.',
    };
  }

  if (lower.includes('anemia') || lower.includes('famacha') || lower.includes('barber pole') || lower.includes('worm') || lower.includes('pale') || lower.includes('mucous')) {
    return {
      farmerText: 'Posibleng banta ng bulate at anemia (maputlang talukap ng mata)',
      actionText: 'Suriin ang talukap ng mata gamit ang FAMACHA guide. Maghanda ng pampurga ayon sa payo ng beterinaryo.',
    };
  }

  if (lower.includes('bloat') || lower.includes('kabag') || lower.includes('rumen') || lower.includes('digestive')) {
    return {
      farmerText: 'Posibleng kabag o problema sa tiyan (namamagang kaliwang tiyan)',
      actionText: 'Huwag munang pakainin ng basang damo o feeds. Lakarin ang hayop at humingi ng agarang tulong kapag lumala.',
    };
  }

  if (lower.includes('fever') || lower.includes('lagnat') || lower.includes('temperature') || lower.includes('infection')) {
    return {
      farmerText: 'Mataas ang temperatura ng katawan (posibleng lagnat / impeksyon)',
      actionText: 'Ilayo sa mainit na araw, bigyan ng sariwang tubig, at bantayan ang temperatura tuwing 6-12 oras.',
    };
  }

  if (lower.includes('diarrhea') || lower.includes('pagtatae') || lower.includes('enterotoxemia')) {
    return {
      farmerText: 'Pagtatae o sirang tiyan (posibleng dehydration risk)',
      actionText: 'Bigyan ng electrolyte solution upang maiwasan ang dehydration. Bawasan ang concentrates/feeds.',
    };
  }

  if (lower.includes('lame') || lower.includes('pilay') || lower.includes('gait') || lower.includes('foot rot') || lower.includes('kuko') || lower.includes('scald')) {
    return {
      farmerText: 'Pilay o may problema sa kuko / paglakad',
      actionText: 'Suriin ang ilalim ng kuko kung may dumi, sugat, o amoy. Linisin at gamitin ang foot bath kung kinakailangan.',
    };
  }

  if (lower.includes('ppr') || lower.includes('viral')) {
    return {
      farmerText: 'Banta ng malubhang viral na sakit (lagnat, muta, sipon, pagtatae)',
      actionText: 'Agarang ihiwalay (isolate) ang hayop. Ipagbigay-alam sa lokal na opisina ng agrikultura o beterinaryo.',
    };
  }

  return {
    farmerText: `Kailangang suriin: ${concern}`,
    actionText: 'Magsagawa ng regular na pagsusuri sa hayop.',
  };
}

// ─── Breeding Terminology ───────────────────────────────────────────────────
export const BREEDING_LABELS = {
  pregnant: 'Mga Buntis',
  readyToBreed: 'Handa sa Pagpapalahi',
  activeBreeding: 'May Nakatalang Pagpapalahi',
  nearKidding: 'Malapit Nang Manganak',
  recentKidding: 'Bagong Panganak',
  expectedDatePrefix: 'Inaasahang Panganganak',
};

// ─── Vaccination Terminology ────────────────────────────────────────────────
export const VACCINE_LABELS = {
  upcoming: 'Bakunang Paparating',
  overdue: 'Overdue na Bakuna',
  thisMonth: 'Bakunang Naibigay Ngayong Buwan',
  emptyUpcoming: 'Walang bakunang nakatakda sa susunod na 30 araw',
  emptyOverdue: 'Lahat ng alaga ay updated sa bakuna',
};

// ─── Inventory Terminology ──────────────────────────────────────────────────
export const INVENTORY_LABELS = {
  title: 'Mga Kagamitan at Supplies',
  totalItems: 'Kabuuang Gamit',
  lowStock: 'Mababang Stock',
  expiringSoon: 'Malapit Nang Mag-expire',
  expired: 'Expired na Gamit',
  spentThisMonth: 'Gastos sa Bilihin Ngayong Buwan',
  consumedThisMonth: 'Nagamit Ngayong Buwan',
  estimatedValue: 'Tinatayang Halaga ng Natitirang Stock',
};

// ─── General Farm Inventory Terminology ─────────────────────────────────────
export const GENERAL_INVENTORY_LABELS = {
  title: 'Pangkalahatang Imbentaryo ng Bukid',
  englishTitle: 'General Farm Inventory',
  summarySubtitle: 'Buod ng lahat ng mayroon at kasalukuyang pinamamahalaan sa bukid',
  livestockSection: 'Imbentaryo ng mga Hayop (Livestock)',
  livestockSubtitle: 'Kasalukuyang bilang ng mga alagang kambing at tupa ayon sa lahi, kasarian, edad, at kalusugan',
  stocksSection: 'Mga Gamit, Pakain, at Gamot sa Bukid',
  stocksSubtitle: 'Pisikal na supply ng pakain, gamot, bakuna, kagamitan, at mga kasangkapan',
  totalLivestock: 'Kabuuang Hayop',
  goats: 'Mga Kambing',
  sheep: 'Mga Tupa',
  feeds: 'Reserbang Pakain',
  healthSupplies: 'Gamot at Bakuna',
  equipment: 'Kagamitan at Kasangkapan',
  young: 'Bata / Bisiro (< 12 buwan)',
  adult: 'Matanda / May Gulang (≥ 12 buwan)',
  pregnant: 'Buntis / Nagdadalantao',
  healthy: 'Malusog / Maayos ang Kalagayan',
  monitoring: 'Bantayan / May Pagmamanman',
  needsAttention: 'Nangangailangan ng Atensyon / Beterinaryo',
};

