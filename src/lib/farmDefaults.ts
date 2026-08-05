// ─── Farm Defaults: Presets for all dropdown/autocomplete fields ──────────────
// Covers goat & sheep breeds, vaccines, feed types, inventory items,
// units, suppliers, veterinarians, and color markings.

// ── Animal Breeds ─────────────────────────────────────────────────────────────

export const GOAT_BREEDS = [
  'Anglo-Nubian', 'Boer', 'Kiko', 'La Mancha', 'Nubian', 'Oberhasli',
  'Saanen', 'Toggenburg', 'Alpine', 'Nigerian Dwarf', 'Pygmy',
  'Angora', 'Cashmere', 'Fainting Goat', 'Spanish', 'Kalahari Red',
  'Savanna', 'Sirohi', 'Beetal', 'Barbari', 'Jamnapari',
  'Black Bengal', 'Osmanabadi', 'Malabari', 'Sannen',
  'Philippine Native Goat', 'Batangas Goat',
];

export const SHEEP_BREEDS = [
  'Merino', 'Suffolk', 'Dorper', 'Hampshire', 'Rambouillet',
  'Corriedale', 'Romney', 'Texel', 'Katahdin', 'Barbados Blackbelly',
  'Dorset', 'Lincoln', 'Border Leicester', 'Jacob', 'Karakul',
  'East Friesian', 'Finn', 'Icelandic', 'Cheviot', 'Columbia',
  'Perendale', 'Southdown', 'Shropshire', 'Oxford',
  'Philippine Native Sheep',
];

export function getBreedsForSpecies(species: string): string[] {
  if (species === 'Goat') return GOAT_BREEDS;
  if (species === 'Sheep') return SHEEP_BREEDS;
  return [...GOAT_BREEDS, ...SHEEP_BREEDS];
}

// ── Vaccines ──────────────────────────────────────────────────────────────────

export const GOAT_SHEEP_VACCINES = [
  // Core vaccines
  'PPR Vaccine (Peste des Petits Ruminants)',
  'FMD Vaccine (Foot and Mouth Disease)',
  'Clostridial / CD&T Vaccine',
  'Brucellosis Vaccine (Rev-1)',
  'Enterotoxemia Vaccine',
  'Tetanus Toxoid',
  'Caseous Lymphadenitis (CLA) Vaccine',
  'Rabies Vaccine',
  'Ovine Johne\'s Disease Vaccine',
  'Contagious Ecthyma (Orf) Vaccine',
  'Bluetongue Vaccine',
  'Caprine Arthritis-Encephalitis (CAE) Vaccine',
  // Philippines-common
  'Hemorrhagic Septicemia (HS) Vaccine',
  'Anthrax Spore Vaccine',
  'Black Quarter (BQ) Vaccine',
  // Deworming (often tracked alongside vaccines)
  'Albendazole (Dewormer)',
  'Ivermectin (Dewormer)',
  'Fenbendazole (Dewormer)',
  'Levamisole (Dewormer)',
];

// ── Feed Types ────────────────────────────────────────────────────────────────

export const FEED_TYPES = [
  // Roughages
  'Napier Grass (Penisetum purpureum)',
  'Guinea Grass',
  'Bermuda Grass',
  'Para Grass',
  'Rhodes Grass',
  'Stylosanthes (Stylo)',
  'Leucaena (Ipil-ipil) Leaves',
  'Mulberry Leaves',
  'Sweet Potato Vines',
  'Kangkong (Water Spinach)',
  'Dried Rice Straw',
  'Corn Stover',
  'Sugarcane Tops',
  'Banana Trunk / Leaves',
  // Concentrates
  'Commercial Goat Pellets',
  'Commercial Sheep Pellets',
  'Rice Bran',
  'Copra Meal',
  'Corn Grits / Ground Corn',
  'Soybean Meal',
  'Wheat Bran',
  'Cassava Meal',
  'Molasses',
  'Fish Meal',
  // Mixed
  'Total Mixed Ration (TMR)',
  'Hay (Mixed)',
  'Silage (Corn)',
  'Silage (Napier)',
  'Mineral Block / Salt Lick',
];

// ── Inventory Item Names ──────────────────────────────────────────────────────

export const INVENTORY_NAMES: Record<string, string[]> = {
  Feed: [
    'Napier Grass', 'Guinea Grass', 'Rice Bran', 'Corn Grits', 'Soybean Meal',
    'Commercial Goat Pellets', 'Commercial Sheep Pellets', 'Molasses',
    'Wheat Bran', 'Copra Meal', 'Mineral Block', 'Salt Lick', 'Hay',
  ],
  Medicine: [
    'Albendazole (Dewormer)', 'Ivermectin (Dewormer)', 'Fenbendazole',
    'Oxytetracycline (Antibiotic)', 'Penicillin', 'Amoxicillin',
    'Vitamin B-Complex', 'Vitamin AD3E', 'Iron Supplement',
    'Calcium Borogluconate', 'Electrolyte Solution', 'Antidiarrheal',
    'Anti-bloat Solution', 'Wound Spray / Antiseptic', 'Iodine Solution',
    'Hydrogen Peroxide', 'Activated Charcoal',
  ],
  Vaccines: [
    'PPR Vaccine', 'FMD Vaccine', 'CD&T Vaccine', 'Brucellosis Vaccine (Rev-1)',
    'Hemorrhagic Septicemia Vaccine', 'Tetanus Toxoid', 'Rabies Vaccine',
    'Black Quarter Vaccine', 'Anthrax Spore Vaccine', 'Orf Vaccine',
  ],
  Supplies: [
    'Syringe (1 mL)', 'Syringe (5 mL)', 'Syringe (10 mL)', 'Syringe (20 mL)',
    'Needle (18G)', 'Needle (20G)', 'Needle (22G)',
    'Ear Tags', 'Ear Tag Applicator', 'Marking Paint / Spray',
    'Halter', 'Rope', 'Hoof Trimming Tools', 'Weighing Scale',
    'Thermometer', 'Stethoscope', 'Gloves (Disposable)', 'Gloves (Latex)',
    'Milk Pail', 'Dipping Tank', 'Feed Trough', 'Water Trough',
  ],
  Equipment: [
    'Weighing Scale', 'QR Code Scanner', 'Feedlot Pen', 'Milking Machine',
    'Water Pump', 'Solar Panel', 'Generator', 'CCTV Camera',
    'Grooming Kit', 'Shearing Machine',
  ],
  Other: ['Disinfectant', 'Lime (Calcium Oxide)', 'Sawdust', 'Bedding Material'],
};

// ── Units ─────────────────────────────────────────────────────────────────────

export const INVENTORY_UNITS = [
  'kg', 'g', 'mg', 'L', 'mL', 'pcs', 'vials', 'bottles', 'boxes',
  'sacks', 'bags', 'rolls', 'pairs', 'sets', 'doses', 'tablets',
  'capsules', 'ampoules', 'strips',
];

// ── Color / Markings ──────────────────────────────────────────────────────────

export const COLOR_MARKINGS = [
  'All White', 'All Black', 'All Brown', 'All Gray', 'All Tan',
  'Black and White', 'Brown and White', 'Black and Brown',
  'White with Black spots', 'White with Brown spots',
  'Brown with White spots', 'Black with White face',
  'Tan with Black stripe', 'Gray with White patches',
  'Reddish Brown', 'Golden / Yellow', 'Cream',
  'Spotted (Multi-color)', 'Piebald', 'Roan',
];

// ── Veterinarian names (user can add their own too) ──────────────────────────

export const COMMON_VETS = [
  'Dr. Santos', 'Dr. Reyes', 'Dr. Cruz', 'Dr. Garcia', 'Dr. Lim',
  'Dr. Mendoza', 'Dr. Torres', 'Dr. Flores', 'Dr. Rivera', 'Dr. Aquino',
  'Municipal Agriculturist', 'Provincial Vet Office',
  'DA-BAI (Bureau of Animal Industry)', 'Private Veterinarian',
];
