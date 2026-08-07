import { useMemo, useState, useEffect, useRef } from 'react';
import { Sparkles, Send, X, Lightbulb, Brain, TrendingUp, AlertCircle, Zap, RefreshCw } from 'lucide-react';
import { useFarmData } from '../lib/useFarmData';
import { useMLInsights, useAnomalyDetection } from '../lib/mlHooks';
import { daysUntil, formatDate } from '../lib/analytics';

interface Msg { id: string; role: 'user' | 'assistant'; content: string; bullets?: string[]; tag?: string; }
interface Props { open: boolean; onClose: () => void; }

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number, d = 1) => n.toFixed(d);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const vet = '\n\n⚕️ Always confirm health decisions with a licensed veterinarian.';

// ── Intent detection ──────────────────────────────────────────────────────────
function detect(q: string) {
  const t = q.toLowerCase();

  // Extract animal name from various patterns
  const animal = (() => {
    const m = t.match(/(?:how is|about|check|status of|show me|sino si|kumusta si|kamusta si|tingnan|profile|ano nangyari|kamusta ang|pakita|para kay|tungkol kay)\s+([a-zA-Z]+)/i)
           || t.match(/([a-zA-Z]+)(?:'s|s'|s)\s+(?:health|weight|status|breeding|milk|vaccine|temperature|temp|heart|condition)/i)
           || t.match(/(?:ano ang kalagayan|kalagayan)\s+(?:ni|ng)\s+([a-zA-Z]+)/i);
    return m ? m[1] : null;
  })();

  // System / FAQ questions
  if (/system|alpasfarm|what.*do|features|functions|ano.*system|paano|how does|what is|explain|kapag|kung|bakit|why|para saan|purpose|gamit|ibig sabihin|define|meaning/.test(t)) return { intent: 'system_faq', animal };

  // Numbers / counts / totals
  if (/how many|ilan|count|total|lahat|all|number of|dami|bilang|magkano|cost|gastos|halaga/.test(t)) return { intent: 'count', animal };

  // Comparison
  if (/compare|versus|vs|paghahambing|mas mabuti|mas maganda|alin|which.*better|difference/.test(t)) return { intent: 'compare', animal };

  // Disease / illness advice
  if (/ppr|foot.*rot|pneumonia|bloat|diarrhea|anemia|worm|parasite|lameness|fever|sakit|karamdaman|lunas|gamot|treat|medicine|antibiotic|deworm/.test(t)) return { intent: 'disease', animal };

  // Nutrition / feeding advice
  if (/what.*feed|what.*eat|best.*feed|nutri|pagkain.*para|feed.*recommend|diet|supplement|mineral|block/.test(t)) return { intent: 'nutrition', animal };

  // What to do / action advice
  if (/what.*do|what should|gawin ko|ano gagawin|paano ko|how.*treat|how.*help|lunas|solusyon|advice|recommend|suggest/.test(t)) return { intent: 'advice', animal };

  // Anomaly
  if (/anomal|unusual|weird|spike|outlier|abnormal|hindi normal|kakaiba|mataas.*temp|mababa.*temp/.test(t)) return { intent: 'anomaly', animal };

  // Cluster
  if (/cluster|group|segment|katulad|similar|grupo|grouped/.test(t)) return { intent: 'cluster', animal };

  // Health risk
  if (/health.*risk|at risk|critical|sick|illness|sakit|risk score|logistic|may sakit|malaki ang risk/.test(t)) return { intent: 'health', animal };

  // Vaccination
  if (/vaccin|shot|immuniz|bakuna|booster|overdue|due.*soon/.test(t)) return { intent: 'vaccination', animal };

  // Breeding
  if (/breed|pregnant|kidding|mating|buntis|nagsilang|anak|birth|gestation|sire|dam/.test(t)) return { intent: 'breeding', animal };

  // Weight / growth
  if (/weight|grow|gain|market|timbang|laki|tubo|heavy|light|target weight/.test(t)) return { intent: 'growth', animal };

  // Milk
  if (/milk|gatas|yield|litro|dairy|production/.test(t)) return { intent: 'milk', animal };

  // Feed / cost
  if (/feed|fodder|kain|pagkain|fcr|efficiency|gastos|cost|spend|spent|bayad/.test(t)) return { intent: 'feed', animal };

  // Inventory
  if (/stock|inventory|supply|gamot|expired|expir|kulang|out of stock|medicines|vaccine.*stock/.test(t)) return { intent: 'inventory', animal };

  // Today's priorities
  if (/today|attention|urgent|priority|what.*need|briefing|update|balita|anong|nangyayari|agenda|listahan/.test(t)) return { intent: 'briefing', animal };

  // Summary
  if (/summary|overview|total|how many|lahat|buod|herd|all animal|farm status/.test(t)) return { intent: 'summary', animal };

  // Specific animal lookup
  if (animal) return { intent: 'animal_lookup', animal };

  return { intent: 'unknown', animal };
}

// ── System FAQ answers ────────────────────────────────────────────────────────
function answerFaq(q: string): { content: string; bullets?: string[] } | null {
  const t = q.toLowerCase();

  if (/anomal/.test(t)) return {
    content: 'Anomaly Detection compares each animal\'s current temperature and heart rate against its own historical records using Z-score + IQR statistics. If the current reading is statistically unusual (Z-score > 2 or outside the IQR bounds) compared to that animal\'s own baseline, it gets flagged.',
    bullets: ['Needs 3+ health records per animal to establish a baseline', 'Compares EACH animal vs its OWN history — not vs other animals', 'Z-score > 2 = Warning, > 3 = Severe', 'Example: If Rosa\'s normal temp is 38.9°C and today it reads 41.5°C → flagged'],
  };

  if (/logistic|health risk.*ai|risk.*model|machine learning|ml/.test(t)) return {
    content: 'The Health Risk AI uses Logistic Regression trained on your health records. It learns which combinations of vitals and symptoms correlate with high risk scores.',
    bullets: ['14 features: temperature, heart rate, respiratory rate, FAMACHA score, mucous membrane, bloat, gait, appetite, cough, diarrhea, and more', '300 epochs of gradient descent training with L2 regularization', 'Outputs: risk probability 0–100%, feature importance, confidence score', 'More health records = better accuracy'],
  };

  if (/famacha/.test(t)) return {
    content: 'FAMACHA is a research-based scoring system for detecting anemia caused by Barber Pole Worm (Haemonchus contortus) — the most common and deadly parasite in goats and sheep.',
    bullets: ['Score 1–2: Red/Pink — Healthy, no treatment needed', 'Score 3: Pink — Borderline, recheck in 2 weeks', 'Score 4: Pink-White — Anemic, deworm immediately', 'Score 5: White — Severely anemic, emergency treatment required', 'Check the inner eyelid (conjunctiva) color of the animal'],
  };

  if (/bloat/.test(t)) return {
    content: 'Bloat Score measures rumen distension (gas buildup in the stomach) on a 0–3 scale.',
    bullets: ['0 = Normal', '1 = Mild bloat — monitor, restrict legume grazing', '2 = Moderate — administer anti-bloat solution', '3 = Severe EMERGENCY — walk the animal, pass stomach tube, call vet immediately', 'Bloat can be fatal within hours if untreated'],
  };

  if (/rumen|rumen sound/.test(t)) return {
    content: 'Rumen sounds indicate digestive health. Normal is 1–3 sounds per minute (Cornell Extension).',
    bullets: ['Normal: 1–3 per minute — healthy digestion', 'Increased: >3/min — possible early bloat or excitement', 'Reduced: <1/min — digestive disturbance, possible illness', 'Absent: 0 — serious — could indicate bloat, shock, or rumen shutdown'],
  };

  if (/polynomial|growth.*forecast|weight.*predict|market.*ready/.test(t)) return {
    content: 'Growth Forecasting uses Polynomial Regression to fit a curve to an animal\'s weight history and project it 90 days forward.',
    bullets: ['Needs 2+ weight records per animal', 'Calculates projected daily gain and confidence interval', 'Predicts the market-ready date when animal reaches target weight (configurable in Settings)', 'R² value shows how well the model fits — higher is better'],
  };

  if (/holt|milk.*forecast|exponential smooth/.test(t)) return {
    content: "Milk Yield Forecasting uses Holt's Exponential Smoothing — a time-series algorithm that weighs recent readings more heavily than older ones.",
    bullets: ['Needs 3+ milk records per female animal', 'Auto-optimizes α (level) and β (trend) parameters via grid search', 'Forecasts next 7 days average yield in litres/day', 'Reports MAPE (Mean Absolute Percentage Error) and confidence %'],
  };

  if (/naive bayes|breeding.*predict|success.*breed/.test(t)) return {
    content: 'Breeding Success Prediction uses Naïve Bayes classifier trained on past breeding outcomes to estimate the probability of successful breeding.',
    bullets: ['Considers: age, weight, health status, and species', 'Laplace smoothing prevents zero-probability issues', '70%+ = High probability → proceed with breeding', '50–70% = Moderate → ensure optimal conditions first', '<50% = Low → address health or maturity issues first'],
  };

  if (/k.?means|cluster|group.*animal/.test(t)) return {
    content: 'Animal Clustering uses K-Means++ algorithm to automatically group your herd into clusters based on similar characteristics.',
    bullets: ['Groups by: weight, age, health risk score, and species', 'Uses 3 clusters (adjusts if fewer animals)', 'K-means++ initialization for better accuracy', 'Labels like "Heavy Healthy", "Light High-Risk" describe each group', 'Useful for batch treatment, feeding schedules, and management decisions'],
  };

  if (/ols|feed.*gain|feed.*weight|fcr|feed conversion/.test(t)) return {
    content: 'Feed-to-Weight-Gain Model uses Ordinary Least Squares (OLS) linear regression to find the relationship between how much feed an animal eats and how much weight it gains.',
    bullets: ['Slope: kg of weight gain per kg of feed consumed', 'R² (R-squared): how strong the correlation is (0–1, higher = better)', 'R²=0.978 means 97.8% of weight variation is explained by feed', 'Used to calculate Feed Conversion Ratio (FCR) and optimize feeding'],
  };

  if (/ppr|peste|virus|contagious/.test(t)) return {
    content: 'PPR (Peste des Petits Ruminants) is a highly contagious and often fatal viral disease in goats and sheep. The system can detect its pattern from symptoms.',
    bullets: ['Classic signs: high fever (>40°C) + nasal/eye discharge + diarrhea + loss of appetite', 'If 4+ of these are present → system flags "Suspected PPR"', 'NO CURE — prevention only through vaccination (PPR Vaccine)', 'REPORT to DA-BAI (Bureau of Animal Industry) immediately if suspected', 'DO NOT move animals — highly contagious'],
  };

  if (/early.*illness|illness.*detect|detect.*disease/.test(t)) return {
    content: 'Early Illness Detection analyzes 7 disease patterns from the health check parameters you record.',
    bullets: ['1. Pneumonia / Respiratory Disease', '2. Anemia / Barber Pole Worm (via FAMACHA score)', '3. Ruminal Bloat (via bloat score + rumen sounds)', '4. High Fever / Systemic Infection', '5. Enterotoxemia / Gastrointestinal Infection', '6. Lameness / Foot Rot (via gait assessment)', '7. ⚠️ PPR - Peste des Petits Ruminants'],
  };

  if (/feature|function|what.*can|what.*do|capability|ano.*kaya/.test(t)) return {
    content: 'AlpasFarm is a complete goat and sheep farm management system with AI-powered insights. Here\'s what it can do:',
    bullets: ['🐐 Animal Management — add, edit, archive animals with QR codes', '🏥 Health Monitoring — 15 clinical parameters + early illness detection', '⚖️ Weight & Growth — track weight, predict market-ready date', '💕 Breeding — pregnancy tracking, kidding date calculator', '💉 Vaccinations — schedule tracking with overdue alerts', '🌾 Feed Management — consumption tracking + efficiency scoring', '🥛 Milk Production — daily yield with 7-day forecast', '📦 Inventory — stock levels with expiry alerts', '🧠 7 ML Models — all running in-browser on your own data', '📊 Analytics & Reports — charts, trends, and downloadable reports', '📋 Activity Log — full history downloadable as CSV'],
  };

  return null;
}

// ── Main reply builder ────────────────────────────────────────────────────────
function buildReply(
  input: string,
  farmData: ReturnType<typeof useFarmData>,
  ml: ReturnType<typeof useMLInsights>,
  anomalies: ReturnType<typeof useAnomalyDetection>,
): { content: string; bullets?: string[]; tag?: string } {

  if (farmData.loading) return { content: 'Loading your farm data… please try again in a moment.' };

  const { intent, animal: animalName } = detect(input);
  const active = farmData.animals.filter((a) => !a.archived);
  const animalName2 = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Unknown';

  // ── System FAQ ──────────────────────────────────────────────────────────────
  if (intent === 'system_faq') {
    const faq = answerFaq(input);
    if (faq) return { ...faq, tag: 'info' };
    return {
      tag: 'info',
      content: 'AlpasFarm is a smart goat and sheep farm management system. I can answer questions about how any feature works — just ask about anomaly detection, health risk AI, FAMACHA scoring, breeding predictions, milk forecasting, growth models, inventory, or any other feature.',
      bullets: ['Try: "How does anomaly detection work?"', 'Try: "What is FAMACHA?"', 'Try: "How does the breeding prediction work?"', 'Try: "What are all the features of this system?"'],
    };
  }

  // ── Animal lookup ───────────────────────────────────────────────────────────
  if (animalName && (intent === 'animal_lookup' || intent === 'health' || intent === 'growth' || intent === 'milk' || intent === 'breeding')) {
    const found = active.find((a) => a.name.toLowerCase().includes(animalName.toLowerCase()));
    if (found) {
      const growth = ml.growthPredictions.find((g) => g.animalId === found.id);
      const milkF  = ml.milkForecasts.find((m) => m.animalId === found.id);
      const breedP = ml.breedingPredictions.find((b) => b.animal.id === found.id);
      const anomaly = anomalies.find((a) => a.animal.id === found.id);
      const lastHealth = farmData.healthRecords.filter((r) => r.animal_id === found.id).sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())[0];

      const bullets: string[] = [
        `Species: ${found.species} · Breed: ${found.breed ?? 'Unknown'} · Sex: ${found.sex}`,
        `Health Status: ${found.health_status} (Risk Score: ${found.health_risk_score}/100)`,
        `Current Vitals: Temp ${found.current_temperature ? found.current_temperature + '°C' : '—'} · HR ${found.current_heart_rate ? found.current_heart_rate + ' BPM' : '—'}`,
        `Weight: ${found.weight_kg ? found.weight_kg + ' kg' : 'Not recorded'}`,
        `Vaccination: ${found.vaccination_status}`,
        `Breeding Status: ${found.breeding_status}`,
      ];

      if (found.expected_kidding_date) {
        const d = daysUntil(found.expected_kidding_date);
        bullets.push(`Expected Kidding: ${formatDate(found.expected_kidding_date)} (${d >= 0 ? d + ' days away' : 'overdue'})`);
      }
      if (growth?.model) {
        bullets.push(`Growth Forecast: ${growth.model.projectedDailyGain > 0 ? '+' : ''}${growth.model.projectedDailyGain} kg/day · R²=${growth.model.rSquared.toFixed(2)}${growth.model.marketReadyDate ? ' · Market-ready: ' + growth.model.marketReadyDate : ''}`);
      }
      if (milkF?.forecast) {
        const avg = (milkF.forecast.forecast.reduce((s, v) => s + v, 0) / milkF.forecast.forecast.length).toFixed(2);
        bullets.push(`Milk Forecast: ~${avg} L/day next 7 days (${milkF.forecast.confidence}% confidence)`);
      }
      if (breedP?.prediction) {
        bullets.push(`Breeding Success Probability: ${pct(breedP.prediction.probability)} — ${breedP.prediction.recommendation}`);
      }
      if (anomaly) {
        const msg = anomaly.tempAnomaly?.isAnomaly ? `⚠️ ANOMALY: ${anomaly.tempAnomaly.message}` : anomaly.hrAnomaly?.isAnomaly ? `⚠️ ANOMALY: ${anomaly.hrAnomaly.message}` : null;
        if (msg) bullets.push(msg);
      }
      if (lastHealth) {
        bullets.push(`Last Health Check: ${formatDate(lastHealth.record_date)} · ${lastHealth.risk_level} risk (${lastHealth.risk_score})`);
        if ((lastHealth as any).detected_conditions) bullets.push(`Detected Conditions: ${(lastHealth as any).detected_conditions}`);
      }

      return { tag: 'insight', content: `Here is the full AI profile for **${found.name}** (${found.tag_id}):`, bullets };
    }
  }

  // ── Count / Numbers ─────────────────────────────────────────────────────────
  if (intent === 'count') {
    const t = input.toLowerCase();
    const goats = active.filter(a => a.species === 'Goat');
    const sheep = active.filter(a => a.species === 'Sheep');
    const females = active.filter(a => a.sex === 'Female');
    const males = active.filter(a => a.sex === 'Male');
    const totalFeedCost = farmData.feedRecords.reduce((s, r) => s + Number(r.cost || 0), 0);
    const totalMilk = farmData.milkRecords.reduce((s, r) => s + Number(r.yield_litres || 0), 0);

    if (/goat/.test(t)) return { tag: 'insight', content: `You have ${goats.length} goat${goats.length !== 1 ? 's' : ''} registered (${goats.filter(a=>a.sex==='Female').length} female, ${goats.filter(a=>a.sex==='Male').length} male).` };
    if (/sheep/.test(t)) return { tag: 'insight', content: `You have ${sheep.length} sheep registered (${sheep.filter(a=>a.sex==='Female').length} female, ${sheep.filter(a=>a.sex==='Male').length} male).` };
    if (/female/.test(t)) return { tag: 'insight', content: `You have ${females.length} female animals (${females.filter(a=>a.species==='Goat').length} goats, ${females.filter(a=>a.species==='Sheep').length} sheep).` };
    if (/male/.test(t)) return { tag: 'insight', content: `You have ${males.length} male animals (${males.filter(a=>a.species==='Goat').length} goats, ${males.filter(a=>a.species==='Sheep').length} sheep).` };
    if (/milk|gatas/.test(t)) return { tag: 'insight', content: `Total milk recorded: ${totalMilk.toFixed(2)} litres across ${farmData.milkRecords.length} records from ${new Set(farmData.milkRecords.map(r=>r.animal_id)).size} animals.` };
    if (/feed|gastos|cost/.test(t)) return { tag: 'insight', content: `Total feed cost recorded: ₱${totalFeedCost.toFixed(2)} across ${farmData.feedRecords.length} feed records.` };
    if (/health/.test(t)) return { tag: 'insight', content: `Total health records: ${farmData.healthRecords.length} across ${new Set(farmData.healthRecords.map(r=>r.animal_id)).size} animals.` };
    if (/vaccine|vaccin/.test(t)) return { tag: 'insight', content: `Total vaccination records: ${farmData.vaccinations.length}.` };
    return {
      tag: 'insight',
      content: `Farm count summary:`,
      bullets: [
        `Total active animals: ${active.length} (${goats.length} goats, ${sheep.length} sheep)`,
        `Female: ${females.length} · Male: ${males.length}`,
        `Pregnant: ${active.filter(a=>a.breeding_status==='Pregnant').length}`,
        `Health records: ${farmData.healthRecords.length} · Weight records: ${farmData.weightRecords.length}`,
        `Total feed cost: ₱${totalFeedCost.toFixed(2)} · Total milk: ${totalMilk.toFixed(2)} L`,
        `Inventory items: ${farmData.inventory.length}`,
      ],
    };
  }

  // ── Disease advice ──────────────────────────────────────────────────────────
  if (intent === 'disease') {
    const t = input.toLowerCase();
    if (/ppr|peste/.test(t)) return {
      tag: 'alert', content: 'PPR (Peste des Petits Ruminants) — highly contagious viral disease:',
      bullets: ['Signs: high fever >40°C, nasal/eye discharge, diarrhea, mouth sores, loss of appetite', 'NO CURE — prevention only through PPR vaccination', 'ISOLATE affected animals immediately', 'Report to DA-BAI (Bureau of Animal Industry) — it is a notifiable disease', 'Do NOT move animals — highly contagious', 'Vaccinate all healthy animals if outbreak detected'],
    };
    if (/pneumonia|respiratory/.test(t)) return {
      tag: 'alert', content: 'Pneumonia in goats/sheep — respiratory disease treatment:',
      bullets: ['Signs: fever >40°C, rapid breathing (>20 breaths/min), cough, nasal discharge, lethargy', 'Treatment: antibiotics (Oxytetracycline or Penicillin) — consult vet for correct dosage', 'Isolate affected animals', 'Ensure proper ventilation in housing', 'Supportive care: vitamin B-complex, electrolytes', vet.trim()],
    };
    if (/bloat/.test(t)) return {
      tag: 'alert', content: 'Bloat treatment by severity:',
      bullets: ['Mild (Score 1): Walk the animal, restrict legume grazing, administer anti-bloat solution (simethicone)', 'Moderate (Score 2): Anti-bloat drench, position animal with head elevated, massage left flank', 'Severe (Score 3) EMERGENCY: Walk immediately, pass stomach tube to release gas, call vet NOW — can be fatal within hours', 'Prevention: avoid lush legume pastures when wet, use ionophore feed additives', vet.trim()],
    };
    if (/worm|parasite|haemonchus|barber.*pole/.test(t)) return {
      tag: 'alert', content: 'Barber Pole Worm (Haemonchus contortus) — most deadly goat/sheep parasite:',
      bullets: ['Detection: FAMACHA score 4–5 (pale/white inner eyelid)', 'Treatment: dewormer (Albendazole, Ivermectin, or Fenbendazole) — rotate to prevent resistance', 'Targeted Selective Treatment (TST): only treat animals with FAMACHA 4–5 to slow resistance', 'Prevention: avoid overgrazing, rotational grazing, strategic deworming', 'Recheck FAMACHA in 2 weeks after treatment', vet.trim()],
    };
    if (/foot.*rot|lameness|hoof/.test(t)) return {
      tag: 'alert', content: 'Foot Rot / Lameness treatment:',
      bullets: ['Signs: foul smell from hoof, swelling between toes, severe limping', 'Treatment: trim hooves, foot bath with zinc sulfate 10% solution (3× per week)', 'Severe cases: antibiotics (Penicillin or Oxytetracycline) — consult vet', 'Isolate affected animals to prevent spread', 'Prevention: regular hoof trimming, dry housing conditions', vet.trim()],
    };
    if (/diarrhea|loose.*stool|enterotox/.test(t)) return {
      tag: 'alert', content: 'Diarrhea / Enterotoxemia treatment:',
      bullets: ['Mild diarrhea: oral electrolyte solution, withhold grain temporarily', 'Enterotoxemia (Overeating Disease): CD&T vaccine is key prevention', 'Signs of enterotoxemia: sudden death or seizures after grain overfeeding', 'Treatment: antitoxin (if available), supportive care, reduce grain drastically', 'Prevention: CD&T vaccination, gradual feed changes', vet.trim()],
    };
    return {
      tag: 'info', content: 'Common goat/sheep diseases I can help with:',
      bullets: ['PPR (Peste des Petits Ruminants)', 'Pneumonia / Respiratory Disease', 'Bloat (Ruminal Tympany)', 'Barber Pole Worm / Anemia (FAMACHA)', 'Foot Rot / Lameness', 'Enterotoxemia / Diarrhea', 'Ask me about any of these specifically!'],
    };
  }

  // ── Nutrition advice ────────────────────────────────────────────────────────
  if (intent === 'nutrition') {
    return {
      tag: 'info', content: 'Feeding recommendations for goats and sheep (Philippine conditions):',
      bullets: [
        'Base feed: Napier grass or Guinea grass — 3–5 kg/day for adults',
        'Protein supplement: Ipil-ipil (Leucaena) leaves — max 30% of diet (remove stems)',
        'Energy supplement: Rice bran, corn grits — 0.3–0.5 kg/day',
        'Pregnant/lactating does: increase by 20–30%, add Corn grits + Copra meal',
        'Growing kids: Commercial goat starter pellets + fresh grass',
        'Always provide: clean fresh water and mineral salt block',
        'Feed Conversion Ratio (FCR) target: 5–8 kg feed per kg weight gain',
        'Avoid: sudden feed changes, moldy feed, excessive legumes (bloat risk)',
      ],
    };
  }

  // ── Action advice ───────────────────────────────────────────────────────────
  if (intent === 'advice') {
    const atRisk = active.filter(a => a.health_status === 'At Risk' || a.health_status === 'Critical');
    const overdue = active.filter(a => a.vaccination_status === 'Overdue');
    const kiddingSoon = active.filter(a => a.breeding_status === 'Pregnant' && a.expected_kidding_date && daysUntil(a.expected_kidding_date) <= 7);
    const declining = farmData.weightRecords;

    const bullets: string[] = [];
    if (atRisk.length > 0) bullets.push(`🔴 URGENT: ${atRisk.map(a=>a.name).join(', ')} need immediate health assessment`);
    if (anomalies.length > 0) bullets.push(`⚡ Check: ${anomalies.map(a=>a.animal.name).join(', ')} have anomalous vitals — record a health check`);
    if (overdue.length > 0) bullets.push(`💉 Schedule vaccinations for: ${overdue.map(a=>a.name).slice(0,3).join(', ')}`);
    if (kiddingSoon.length > 0) bullets.push(`🐣 Prepare kidding pen for: ${kiddingSoon.map(a=>a.name).join(', ')} (due within 7 days)`);
    if (farmData.inventory.filter(i=>Number(i.quantity)<=Number(i.minimum_stock)).length > 0) bullets.push(`📦 Restock low inventory items before they run out`);
    if (ml.healthModel?.canPredict && ml.healthModel.accuracy < 0.7) bullets.push(`🧠 Add more health records to improve AI accuracy (currently ${Math.round(ml.healthModel.accuracy*100)}%)`);
    if (bullets.length === 0) bullets.push('✅ Everything looks good! No urgent actions needed right now.');

    return { tag: 'briefing', content: `Recommended actions based on your current farm data:`, bullets };
  }

  // ── Compare animals ─────────────────────────────────────────────────────────
  if (intent === 'compare') {
    const words = input.toLowerCase().split(/\s+/);
    const found = active.filter(a => words.some(w => w.length > 2 && a.name.toLowerCase().includes(w)));
    if (found.length >= 2) {
      const bullets = found.slice(0, 4).map(a => {
        const growth = ml.growthPredictions.find(g => g.animalId === a.id);
        return `${a.name}: ${a.weight_kg ? a.weight_kg+'kg' : 'no weight'} · ${a.health_status} (${a.health_risk_score}) · ${a.vaccination_status}${growth?.model ? ' · gain '+growth.model.projectedDailyGain+' kg/day' : ''}`;
      });
      return { tag: 'insight', content: `Comparison of ${found.length} animals:`, bullets };
    }
    // Compare by category
    const heaviest = [...active].sort((a,b) => Number(b.weight_kg||0) - Number(a.weight_kg||0)).slice(0,3);
    return {
      tag: 'insight', content: 'Top 3 heaviest animals:',
      bullets: heaviest.map(a => `${a.name}: ${a.weight_kg ? a.weight_kg+' kg' : 'not recorded'} (${a.species}, ${a.sex})`),
    };
  }
  if (intent === 'anomaly') {
    if (anomalies.length === 0) return {
      tag: 'ok',
      content: 'No anomalies detected right now. All animals\' temperature and heart rate readings are within their individual normal ranges based on Z-score and IQR statistical analysis.',
      bullets: ['The system compares each animal\'s current vitals vs its own historical baseline', 'An anomaly is flagged when Z-score > 2 or reading is outside the IQR bounds', 'Add more health records to improve detection sensitivity'],
    };
    const bullets = anomalies.flatMap((a) => {
      const r: string[] = [];
      if (a.tempAnomaly?.isAnomaly) r.push(`${a.animal.name}: ${a.tempAnomaly.message} (severity: ${a.tempAnomaly.severity})`);
      if (a.hrAnomaly?.isAnomaly) r.push(`${a.animal.name}: ${a.hrAnomaly.message} (severity: ${a.hrAnomaly.severity})`);
      return r;
    });
    return { tag: 'alert', content: `⚡ ${anomalies.length} animal${anomalies.length > 1 ? 's' : ''} flagged with statistically unusual vitals (Z-score + IQR analysis):`, bullets };
  }

  // ── Health ──────────────────────────────────────────────────────────────────
  if (intent === 'health') {
    const atRisk = active.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical');
    const model = ml.healthModel;
    const bullets: string[] = [];
    let content = '';
    if (model?.canPredict) content = `Health Risk AI (Logistic Regression) is trained on ${model.trainingSamples} records with ${Math.round(model.accuracy * 100)}% accuracy. `;
    if (atRisk.length === 0) {
      content += 'All active animals are currently Healthy or on Monitor status. No animals are At Risk or Critical.';
    } else {
      content += `${atRisk.length} animal${atRisk.length > 1 ? 's are' : ' is'} flagged:`;
      atRisk.forEach((a) => bullets.push(`${a.name} (${a.tag_id}) — ${a.health_status} · Risk Score: ${a.health_risk_score}/100${a.current_temperature ? ' · Temp: ' + a.current_temperature + '°C' : ''}`));
    }
    if (anomalies.length > 0) content += `\n\nAdditionally, ${anomalies.length} animal${anomalies.length > 1 ? 's have' : ' has'} anomalous vitals detected by statistical analysis.`;
    return { tag: 'insight', content: content + vet, bullets: bullets.length > 0 ? bullets : undefined };
  }

  // ── Vaccination ─────────────────────────────────────────────────────────────
  if (intent === 'vaccination') {
    const overdue = active.filter((a) => a.vaccination_status === 'Overdue');
    const due = active.filter((a) => a.vaccination_status === 'Due Soon');
    const bullets: string[] = [];
    overdue.forEach((a) => bullets.push(`🔴 OVERDUE: ${a.name} (${a.tag_id})${a.next_vaccine_date ? ' — was due ' + formatDate(a.next_vaccine_date) : ''}`));
    due.forEach((a) => bullets.push(`🟡 DUE SOON: ${a.name} (${a.tag_id})${a.next_vaccine_date ? ' — due ' + formatDate(a.next_vaccine_date) + ' (' + daysUntil(a.next_vaccine_date) + ' days)' : ''}`));
    const content = overdue.length + due.length === 0
      ? `✅ All ${active.length} active animals are up to date on vaccinations.`
      : `Vaccination status: ${overdue.length} overdue, ${due.length} due soon out of ${active.length} active animals:`;
    return { tag: overdue.length > 0 ? 'alert' : 'insight', content, bullets: bullets.length > 0 ? bullets : undefined };
  }

  // ── Breeding ────────────────────────────────────────────────────────────────
  if (intent === 'breeding') {
    const pregnant = active.filter((a) => a.breeding_status === 'Pregnant');
    const highProb = ml.breedingPredictions.filter((b) => b.prediction && b.prediction.probability >= 0.65);
    const bullets: string[] = [];
    pregnant.forEach((a) => {
      const d = a.expected_kidding_date ? daysUntil(a.expected_kidding_date) : null;
      bullets.push(`🤰 ${a.name} — Pregnant${d !== null ? ', kidding in ' + d + ' days (' + formatDate(a.expected_kidding_date) + ')' : ''}`);
    });
    highProb.filter((b) => !pregnant.find((p) => p.id === b.animal.id)).slice(0, 4).forEach((b) => {
      bullets.push(`🧠 ${b.animal.name} — Naïve Bayes predicts ${pct(b.prediction!.probability)} breeding success · ${b.prediction!.recommendation}`);
    });
    return {
      tag: 'insight',
      content: `Breeding overview: ${pregnant.length} pregnant, ${active.filter(a => a.breeding_status === 'Ready').length} ready, ${highProb.length} AI-predicted high success rate:`,
      bullets: bullets.length > 0 ? bullets : ['No breeding activity recorded yet.'],
    };
  }

  // ── Growth ──────────────────────────────────────────────────────────────────
  if (intent === 'growth') {
    const models = ml.growthPredictions.filter((g) => g.model);
    if (!models.length) return { tag: 'info', content: 'No growth forecasts yet. I need at least 2 weight records per animal to build polynomial regression models. Go to Weight & Growth → Record Weight.' };
    const bullets = models.slice(0, 8).map((g) => {
      const gain = g.model!.projectedDailyGain;
      return `${g.animalName}: ${gain > 0 ? '+' : ''}${fmt(gain, 3)} kg/day · R²=${g.model!.rSquared.toFixed(2)}${g.model!.marketReadyDate ? ' · Market-ready: ' + g.model!.marketReadyDate : ''}`;
    });
    return { tag: 'insight', content: `Growth forecasts active for ${models.length} animals (polynomial regression, 90-day projection):`, bullets };
  }

  // ── Milk ────────────────────────────────────────────────────────────────────
  if (intent === 'milk') {
    const forecasts = ml.milkForecasts.filter((m) => m.forecast);
    if (!forecasts.length) return { tag: 'info', content: "No milk forecasts yet. I need at least 3 milk records per female animal to run Holt's exponential smoothing. Go to Feed Management → Milk Production tab." };
    const bullets = forecasts.map((m) => {
      const avg = (m.forecast!.forecast.reduce((s, v) => s + v, 0) / m.forecast!.forecast.length).toFixed(2);
      const trend = m.forecast!.trend > 0.01 ? '↑ increasing' : m.forecast!.trend < -0.01 ? '↓ decreasing' : '→ stable';
      return `${m.animalName}: ~${avg} L/day · trend ${trend} · ${m.forecast!.confidence}% confidence (MAPE: ${m.forecast!.mape.toFixed(1)}%)`;
    });
    return { tag: 'insight', content: `Milk yield forecasts (Holt's exponential smoothing, next 7 days) for ${forecasts.length} female${forecasts.length > 1 ? 's' : ''}:`, bullets };
  }

  // ── Feed ────────────────────────────────────────────────────────────────────
  if (intent === 'feed') {
    const feedPred = ml.feedPrediction;
    const total = farmData.feedRecords.reduce((s, r) => s + Number(r.cost || 0), 0);
    if (!feedPred) return { tag: 'info', content: `Total recorded feed cost: ₱${total.toFixed(2)}. No feed-to-weight regression yet — I need paired feed and weight records for at least 2 animals. Add feed records and weight records for the same animals.` };
    const quality = feedPred.rSquared > 0.7 ? 'strong' : feedPred.rSquared > 0.4 ? 'moderate' : 'weak';
    return {
      tag: 'insight',
      content: `Feed-to-Weight OLS Regression results:`,
      bullets: [
        `Slope: ${feedPred.slope} kg weight gain per kg of feed`,
        `R² = ${feedPred.rSquared.toFixed(3)} — ${quality} correlation (${Math.round(feedPred.rSquared * 100)}% of weight variation explained by feed)`,
        `Total recorded feed cost: ₱${total.toFixed(2)}`,
        feedPred.slope > 0 ? `Every 1 kg of feed → ~${feedPred.slope} kg weight gain (FCR = ${(1 / feedPred.slope).toFixed(2)})` : 'No positive feed-to-gain correlation found — review feed quality',
      ],
    };
  }

  // ── Inventory ───────────────────────────────────────────────────────────────
  if (intent === 'inventory') {
    const low = farmData.inventory.filter((i) => Number(i.quantity) <= Number(i.minimum_stock));
    const expired = farmData.inventory.filter((i) => i.expiry_date && new Date(i.expiry_date) < new Date());
    const bullets: string[] = [];
    expired.forEach((i) => bullets.push(`🔴 EXPIRED: ${i.name} (${i.quantity} ${i.unit})`));
    low.forEach((i) => bullets.push(`⚠️ LOW STOCK: ${i.name} — ${i.quantity} ${i.unit} remaining (min: ${i.minimum_stock})`));
    const content = low.length + expired.length === 0
      ? `✅ All ${farmData.inventory.length} inventory items are stocked above minimum levels. No expired items.`
      : `Inventory alert: ${expired.length} expired, ${low.length} low-stock items:`;
    return { tag: low.length > 0 || expired.length > 0 ? 'alert' : 'ok', content, bullets: bullets.length > 0 ? bullets : undefined };
  }

  // ── Cluster ─────────────────────────────────────────────────────────────────
  if (intent === 'cluster') {
    const c = ml.clusters;
    if (!c) return { tag: 'info', content: 'K-means clustering needs at least 3 active animals. Add more animals to enable herd segmentation.' };
    const map: Record<number, string[]> = {};
    c.assignments.forEach((a) => (map[a.cluster] ??= []).push(a.name));
    const bullets = c.clusterLabels.map((label, i) => {
      const members = map[i] ?? [];
      return `${label}: ${members.slice(0, 5).join(', ')}${members.length > 5 ? ` +${members.length - 5} more` : ''} (${members.length} animals)`;
    });
    return { tag: 'insight', content: `K-means++ clustering grouped your ${active.length} active animals into ${c.k} segments by weight, age, health score, and species:`, bullets };
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (intent === 'summary') {
    const healthy = active.filter((a) => a.health_status === 'Healthy').length;
    const atRisk = active.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical').length;
    const pregnant = active.filter((a) => a.breeding_status === 'Pregnant').length;
    const avgW = active.length > 0 ? active.reduce((s, a) => s + (Number(a.weight_kg) || 0), 0) / active.length : 0;
    return {
      tag: 'insight',
      content: `Farm summary for ${active.length} active animals:`,
      bullets: [
        `Health: ${healthy} Healthy, ${active.filter(a => a.health_status === 'Monitor').length} Monitor, ${atRisk} At Risk/Critical`,
        `Average weight: ${fmt(avgW)} kg`,
        `Pregnant: ${pregnant} animals`,
        `Vaccination: ${active.filter(a => a.vaccination_status === 'Up to Date').length} up to date, ${active.filter(a => a.vaccination_status === 'Overdue').length} overdue`,
        `Anomalies detected: ${anomalies.length}`,
        `ML insights active: ${ml.totalInsights}`,
        `Health records: ${farmData.healthRecords.length} · Weight records: ${farmData.weightRecords.length}`,
        `Feed records: ${farmData.feedRecords.length} · Milk records: ${farmData.milkRecords.length}`,
      ],
    };
  }

  // ── Briefing / default ──────────────────────────────────────────────────────
  const atRisk2 = active.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical');
  const overdue2 = active.filter((a) => a.vaccination_status === 'Overdue');
  const low2 = farmData.inventory.filter((i) => Number(i.quantity) <= Number(i.minimum_stock));
  const pregnant2 = active.filter((a) => a.breeding_status === 'Pregnant' && a.expected_kidding_date && daysUntil(a.expected_kidding_date) <= 14);
  const bullets: string[] = [];
  if (atRisk2.length > 0) bullets.push(`🔴 ${atRisk2.length} animal${atRisk2.length > 1 ? 's' : ''} at risk: ${atRisk2.slice(0, 2).map(a => a.name).join(', ')}`);
  if (anomalies.length > 0) bullets.push(`⚡ ${anomalies.length} anomalous vital${anomalies.length > 1 ? 's' : ''}: ${anomalies.slice(0, 2).map(a => a.animal.name).join(', ')}`);
  if (overdue2.length > 0) bullets.push(`💉 ${overdue2.length} overdue vaccination${overdue2.length > 1 ? 's' : ''}`);
  if (pregnant2.length > 0) bullets.push(`🐣 ${pregnant2.length} animal${pregnant2.length > 1 ? 's' : ''} kidding within 14 days`);
  if (low2.length > 0) bullets.push(`📦 ${low2.length} inventory item${low2.length > 1 ? 's' : ''} below minimum stock`);
  if (ml.growthPredictions.filter(g => g.model).length > 0) bullets.push(`📈 ${ml.growthPredictions.filter(g => g.model).length} growth forecasts active`);
  if (ml.healthModel?.canPredict) bullets.push(`🧠 Health AI: ${Math.round(ml.healthModel.accuracy * 100)}% accuracy · ${ml.healthModel.trainingSamples} training samples`);

  const status = atRisk2.length > 0 || anomalies.length > 0 ? 'needs attention' : overdue2.length > 0 || low2.length > 0 ? 'a few things to monitor' : 'all clear';
  return {
    tag: bullets.length > 0 ? 'briefing' : 'ok',
    content: `Farm briefing — ${active.length} active animals, ${status}:`,
    bullets: bullets.length > 0 ? bullets : ['Everything looks good! All animals are healthy, vaccinations are current, and stock levels are adequate.'],
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AIAssistantPanel({ open, onClose }: Props) {
  const farmData = useFarmData();
  const ml = useMLInsights();
  const anomalies = useAnomalyDetection();
  const endRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Msg[]>([{
    id: 'welcome', role: 'assistant', tag: 'briefing',
    content: 'Hi! I\'m your AI Farm Assistant. Ask me anything about your animals, ML models, health risks, or how any feature works.',
  }]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-briefing on open
  useEffect(() => {
    if (open && !farmData.loading && messages.length === 1) {
      const r = buildReply('briefing', farmData, ml, anomalies);
      setMessages(p => [...p, { id: 'b0', role: 'assistant', ...r }]);
    }
  }, [open, farmData.loading]);

  const quickPrompts = useMemo(() => {
    const p: string[] = [];
    if (anomalies.length > 0) p.push(`Show anomalies (${anomalies.length} detected)`);
    if (farmData.animals.some(a => a.health_status === 'At Risk' || a.health_status === 'Critical')) p.push('Which animals are at risk?');
    if (farmData.animals.some(a => a.vaccination_status === 'Overdue')) p.push('Vaccination priorities');
    if (ml.growthPredictions.some(g => g.model?.marketReadyDate)) p.push('Growth & market-ready dates');
    p.push('What should I do today?');
    p.push('How does anomaly detection work?');
    p.push('What to feed my goats?');
    p.push('How many animals do I have?');
    p.push('Signs of PPR disease');
    return p.slice(0, 6);
  }, [anomalies.length, farmData.animals, ml.growthPredictions]);

  const send = (text: string) => {
    const t = text.trim(); if (!t) return;
    setMessages(p => [...p, { id: `u${Date.now()}`, role: 'user', content: t }]);
    setDraft(''); setThinking(true);
    setTimeout(() => {
      const r = buildReply(t, farmData, ml, anomalies);
      setMessages(p => [...p, { id: `a${Date.now()}`, role: 'assistant', ...r }]);
      setThinking(false);
    }, 350);
  };

  if (!open) return null;

  const tagIcon = (tag?: string) => {
    if (tag === 'alert') return <AlertCircle size={11} color="#EF4444" />;
    if (tag === 'insight') return <Brain size={11} color="#7C3AED" />;
    if (tag === 'briefing') return <Zap size={11} color="#F59E0B" />;
    if (tag === 'info') return <Lightbulb size={11} color="#3B82F6" />;
    return null;
  };

  return (
    <div className="ai-assistant-backdrop" onClick={onClose}>
      <div className="ai-assistant-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ai-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="ai-assistant-icon"><Sparkles size={18} /></div>
            <div>
              <div style={{ fontWeight: 800 }}>AI Farm Assistant</div>
              <div className="ai-assistant-subtitle">
                {ml.totalInsights > 0 ? `${ml.totalInsights} ML insights · ${farmData.animals.filter(a=>!a.archived).length} animals` : 'Connected to your farm data'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="ai-close-btn" onClick={() => { const r = buildReply('briefing', farmData, ml, anomalies); setMessages(p => [...p, { id: `b${Date.now()}`, role: 'assistant', ...r }]); }} title="Refresh briefing"><RefreshCw size={14} /></button>
            <button className="ai-close-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        {/* ML status bar */}
        {!farmData.loading && (
          <div style={{ display: 'flex', gap: 8, padding: '6px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {ml.healthModel?.canPredict && <span style={{ fontSize: 11, color: 'var(--text-secondary)', display:'flex', alignItems:'center', gap:3 }}><Brain size={10} color="#7C3AED"/>Health AI {Math.round(ml.healthModel.accuracy*100)}%</span>}
            {anomalies.length > 0 && <span style={{ fontSize: 11, color: '#EF4444', display:'flex', alignItems:'center', gap:3 }}><AlertCircle size={10}/>{anomalies.length} anomal{anomalies.length>1?'ies':'y'}</span>}
            {ml.growthPredictions.filter(g=>g.model).length > 0 && <span style={{ fontSize: 11, color: 'var(--text-secondary)', display:'flex', alignItems:'center', gap:3 }}><TrendingUp size={10} color="#3B82F6"/>{ml.growthPredictions.filter(g=>g.model).length} growth models</span>}
            {ml.clusters && <span style={{ fontSize: 11, color: 'var(--text-secondary)', display:'flex', alignItems:'center', gap:3 }}><Zap size={10} color="#10B981"/>{ml.clusters.k} clusters</span>}
          </div>
        )}

        {/* Body */}
        <div className="ai-assistant-body">
          <div className="ai-suggestions">
            {quickPrompts.map(p => (
              <button key={p} className="ai-suggestion-chip" onClick={() => send(p)}>
                <Lightbulb size={12}/> {p}
              </button>
            ))}
          </div>

          <div className="ai-message-list">
            {messages.map(m => (
              <div key={m.id} className={`ai-message ${m.role}`}>
                {m.role === 'assistant' && m.tag && m.tag !== 'text' && (
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:4, opacity:0.7 }}>
                    {tagIcon(m.tag)}
                    <span style={{ fontSize:10, textTransform:'uppercase', letterSpacing:1 }}>{m.tag}</span>
                  </div>
                )}
                <span style={{ whiteSpace: 'pre-line' }}>{m.content.replace(/\*\*/g, '')}</span>
                {m.bullets && m.bullets.length > 0 && (
                  <ul style={{ margin:'8px 0 0', paddingLeft:0, listStyle:'none' }}>
                    {m.bullets.map((b, i) => (
                      <li key={i} style={{ fontSize:12, marginBottom:5, lineHeight:1.5, paddingLeft:4, borderLeft:'2px solid var(--border)' }}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {thinking && <div className="ai-message assistant"><span style={{ opacity:0.5, fontSize:13 }}>Analysing your farm data…</span></div>}
            <div ref={endRef} />
          </div>
        </div>

        {/* Composer */}
        <form className="ai-composer" onSubmit={e => { e.preventDefault(); send(draft); }}>
          <input
            className="ai-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Ask about any animal, ML model, or feature…"
            disabled={thinking}
          />
          <button className="ai-send-btn" type="submit" disabled={thinking || !draft.trim()}><Send size={16}/></button>
        </form>
      </div>
    </div>
  );
}
