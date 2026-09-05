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
const vet = '\n\n[Paalala] Laging kumpirmahin ang mga desisyon sa kalusugan sa isang lisensiyadong beterinaryo.';
const bilingual = (en: string, tl: string) => tl;
const GESTATION_DAYS = 150;

function estimateKiddingDate(matingDate: string) {
  const date = new Date(matingDate);
  date.setDate(date.getDate() + GESTATION_DAYS);
  return date.toISOString().slice(0, 10);
}

function pregnancyResponseForAnimal(animal: ReturnType<typeof useFarmData>['animals'][number] | undefined) {
  if (!animal) {
    return {
      tag: 'info',
      content: 'Walang naka-rehistro na hayop na tumugma sa pangalang iyon. Subukang gamitin ang eksaktong pangalan o tag ID.',
    };
  }

  const bullets: string[] = [];
  if (animal.last_mating_date) bullets.push(`Huling mating date: ${formatDate(animal.last_mating_date)} (naitala)`);
  if (animal.expected_kidding_date) bullets.push(`Inaasahang kidding date: ${formatDate(animal.expected_kidding_date)} (${daysUntil(animal.expected_kidding_date)} araw ang layo)`);
  if (!animal.last_mating_date && !animal.expected_kidding_date) {
    bullets.push('Walang mating o expected kidding date na naitala para sa hayop na ito. Kung walang record, hindi eksaktong malalaman kung kailan nagsimula ang pagbubuntis.');
  }
  if (animal.last_mating_date && !animal.expected_kidding_date) {
    bullets.push(`Tinatayang kidding date: ${formatDate(estimateKiddingDate(animal.last_mating_date))} (batay sa ${GESTATION_DAYS}-araw na gestation)`);
  }

  return {
    tag: 'insight',
    content: `Pregnancy status ng ${animal.name}:`,
    bullets,
  };
}

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

  // Pregnancy / conception date questions
  if (/exact|exactong|conception|consepsyon|due date|kidding date|petsa ng.*buntis|paano.*malalaman.*buntis|paano.*malalaman.*buntis|kung kailan.*buntis|paano.*tutukoy.*buntis/.test(t)) return { intent: 'pregnancy_date', animal };

  // System / FAQ questions
  if (/system|alpasfarm|what.*do|features|functions|ano.*system|ano ang|paano|how does|what is|explain|kapag|kung|bakit|why|para saan|purpose|gamit|ibig sabihin|define|meaning|sino|saan/.test(t)) return { intent: 'system_faq', animal };

  // Numbers / counts / totals
  if (/how many|ilan|ilang|count|total|lahat|all|number of|dami|bilang|magkano|cost|gastos|halaga/.test(t)) return { intent: 'count', animal };

  // Comparison
  if (/compare|versus|vs|paghahambing|mas mabuti|mas maganda|alin|which.*better|difference|kanino|kung alin/.test(t)) return { intent: 'compare', animal };

  // Disease / illness advice
  if (/ppr|foot.*rot|pneumonia|bloat|diarrhea|anemia|worm|parasite|lameness|fever|sakit|karamdaman|lunas|gamot|treat|medicine|antibiotic|deworm/.test(t)) return { intent: 'disease', animal };

  // Nutrition / feeding advice
  if (/what.*feed|what.*eat|best.*feed|nutri|pagkain.*para|feed.*recommend|diet|supplement|mineral|block/.test(t)) return { intent: 'nutrition', animal };

  // What to do / action advice
  if (/what.*do|what should|gawin ko|ano gagawin|paano ko|how.*treat|how.*help|lunas|solusyon|advice|recommend|suggest/.test(t)) return { intent: 'advice', animal };

  // Anomaly
  if (/anomal|unusual|weird|spike|outlier|abnormal|hindi normal|kakaiba|mataas.*temp|mababa.*temp|baka may sakit|di normal/.test(t)) return { intent: 'anomaly', animal };

  // Cluster
  if (/cluster|group|segment|katulad|similar|grupo|grouped/.test(t)) return { intent: 'cluster', animal };

  // Camera Screening / Visual Health Scanner
  if (/camera|scanner|scan|larawan|litrato|photo|computer vision|visual health|hindi kambing|non-target|goat detector/.test(t)) return { intent: 'camera_screening', animal };

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

  // General how / paano questions that are not count queries
  if (/^(how|paano)\b/.test(t) && !/(how many|how much|how old|how long|ilan|magkano|many|much)/.test(t)) return { intent: 'system_faq', animal };

  // Specific animal lookup
  if (animal) return { intent: 'animal_lookup', animal };

  return { intent: 'unknown', animal };
}

// ── System FAQ answers ────────────────────────────────────────────────────────
function answerFaq(q: string): { content: string; bullets?: string[] } | null {
  const t = q.toLowerCase();

  if (/anomal/.test(t)) return {
    content: 'Ang Anomaly Detection ay inihahambing ang kasalukuyang temperatura at heart rate ng bawat hayop sa kanyang sariling historikal na rekord gamit ang Z-score at IQR. Kapag ang sukat ay statistically unusual (Z-score > 2 o lampas sa IQR bounds) kumpara sa sariling baseline ng hayop, ito ay nai-flag.',
    bullets: ['Kailangang may 3+ health records bawat hayop para makabuo ng baseline', 'Inihahambing ang bawat hayop sa sariling kasaysayan — hindi sa ibang hayop', 'Z-score > 2 = Babala, > 3 = Malubha', 'Halimbawa: Kung normal na temp ni Rosa ay 38.9°C at ngayong araw ay 41.5°C → nai-flag'],
  };

  if (/logistic|health risk.*ai|risk.*model|machine learning|ml/.test(t)) return {
    content: 'Ang Health Risk AI ay gumagamit ng Logistic Regression na tinuruan sa iyong health records. Natutukoy nito ang kombinasyon ng vitals at sintomas na may kaugnayan sa mataas na risk score.',
    bullets: ['14 na senyales: temperatura, heart rate, bilis ng paghinga, FAMACHA score, mucous membrane, bloat, lakad, gana sa pagkain, ubo, pagtatae, at iba pa', 'Pagsusuri batay sa mga naitalang health records sa bukid', 'Naglalabas ng antas ng risk (0–100%), mga importanteng senyales, at katiyakan ng pagsusuri', 'Mas maraming health records = mas maaasahang gabay sa pagsusuri'],
  };

  if (/famacha/.test(t)) return {
    content: 'Ang FAMACHA ay research-based na scoring system para madetect ang anemia dahil sa Barber Pole Worm (Haemonchus contortus) — ang pinakakaraniwan at pinakamapanganib na parasite sa kambing at tupa.',
    bullets: ['Score 1–2: Pula/Rosas — Malusog, hindi kailangan ng gamutan', 'Score 3: Rosas — Masusing suriin muli sa loob ng 2 linggo', 'Score 4: Rosas-Puti — Anemic, deworm agad', 'Score 5: Puti — Seryosong anemic, kailangan ng emergency treatment', 'Suriin ang kulay ng loob ng pilikmata (conjunctiva) ng hayop'],
  };

  if (/bloat/.test(t)) return {
    content: 'Ang Bloat Score ay sumusukat sa pag-uunat ng rumen (pag-ipon ng gas sa tiyan) sa isang 0–3 na scale.',
    bullets: ['0 = Normal', '1 = Banayad na bloat — bantayan at bawasan ang legume grazing', '2 = Katamtamang bloat — magbigay ng anti-bloat solution', '3 = Malubha EMERGENCY — ilakad agad ang hayop, ipasok ang stomach tube, tawagan ang vet kaagad', 'Maaari itong maging mapanganib at maging sanhi ng kamatayan sa loob ng ilang oras kung hindi mabilis na malunasan'],
  };

  if (/rumen|rumen sound/.test(t)) return {
    content: 'Ang tunog ng rumen ay senyas ng kalusugan ng pagtunaw. Normal ay 1–3 tunog bawat minuto.',
    bullets: ['Normal: 1–3 bawat minuto — malusog ang digestion', 'Tumaas: >3/min — maaaring maagang bloat o sobrang eksayted', 'Bumaba: <1/min — problema sa pagtunaw, posibleng may sakit', 'Wala: 0 — seryoso, maaaring senyales ng bloat, shock, o rumen shutdown'],
  };

  if (/polynomial|growth.*forecast|weight.*predict|market.*ready/.test(t)) return {
    content: 'Ang Growth Forecasting ay gumagamit ng Polynomial Regression para i-fit ang kurba sa weight history ng hayop at i-project ito 90 araw pasulong.',
    bullets: ['Kailangan ng 2+ weight records bawat hayop', 'Kinakalkula ang projected daily gain at confidence interval', 'Tinataya ang market-ready date kapag naabot ang target weight (maaaring baguhin sa Settings)', 'Ang R² value ay nagpapakita kung gaano kahusay ang fit — mas mataas ay mas maganda'],
  };

  if (/holt|milk.*forecast|exponential smooth/.test(t)) return {
    content: 'Ang Milk Yield Forecasting ay gumagamit ng Holt\'s Exponential Smoothing — isang time-series algorithm na mas binibigyang timbang ang mga bagong readings kaysa sa matatanda.',
    bullets: ['Kailangan ng 3+ milk records bawat babaeng hayop', 'Auto-optimize ang α (level) at β (trend) parameters sa pamamagitan ng grid search', 'Ina-forecast ang average na yield sa susunod na 7 araw sa litres/day', 'Nag-uulat ng MAPE (Mean Absolute Percentage Error) at confidence %'],
  };

  if (/naive bayes|breeding.*predict|success.*breed/.test(t)) return {
    content: 'Ang Breeding Success Prediction ay gumagamit ng Naïve Bayes classifier na tinuruan sa nakaraang breeding outcomes para tantiyahin ang posibilidad ng matagumpay na breeding.',
    bullets: ['Kinokonsidera ang edad, timbang, kalusugan, at species', 'Ang Laplace smoothing ay pumipigil sa zero-probability issues', '70%+ = Mataas na posibilidad — maaari nang ipagpatuloy ang breeding', '50–70% = Katamtaman — siguraduhing maayos ang kondisyon bago ituloy', '<50% = Mababa — ayusin muna ang kalusugan o maturity bago subukan muli'],
  };

  if (/k.?means|cluster|group.*animal/.test(t)) return {
    content: 'Ang Animal Clustering ay gumagamit ng K-Means++ algorithm para awtomatikong paghatiin ang iyong herd sa mga grupo base sa magkakatulad na katangian.',
    bullets: ['Pinaghahambing ang weight, age, health risk score, at species', 'Gumagamit ng 3 clusters (ina-adjust kapag kaunti ang hayop)', 'K-means++ initialization para sa mas mahusay na accuracy', 'Mga label tulad ng "Heavy Healthy" o "Light High-Risk" ang naglalarawan ng bawat grupo', 'Magagamit para sa batch treatment, feeding schedule, at management decisions'],
  };

  if (/ols|feed.*gain|feed.*weight|fcr|feed conversion/.test(t)) return {
    content: 'Ang Feed-to-Weight-Gain Model ay gumagamit ng Ordinary Least Squares (OLS) linear regression para tukuyin ang relasyon ng feed consumption at weight gain.',
    bullets: ['Slope: kg weight gain kada kg feed', 'R² (R-squared): lakas ng correlation (0–1, mas mataas = mas maganda)', 'R²=0.978 ay nangangahulugang 97.8% ng weight variation ay naipapaliwanag ng feed', 'Ginagamit para kalkulahin ang Feed Conversion Ratio (FCR) at i-optimize ang pag-feed'],
  };

  if (/ppr|peste|virus|contagious/.test(t)) return {
    content: 'Ang PPR (Peste des Petits Ruminants) ay isang napakahawa at madalas nakamamatay na viral disease sa kambing at tupa. Nakikita ng system ang pattern nito mula sa sintomas.',
    bullets: ['Palatandaan: mataas na lagnat >40°C, dumudugo ng ilong/mata, pagtatae, pagbaba ng gana sa pagkain', 'Kung 4+ ay present → nai-flag bilang "Suspected PPR"', 'WALANG GAMOT — tanging bakuna ang pag-iwas (PPR Vaccine)', 'I-report agad sa DA-BAI (Bureau of Animal Industry) kapag pinaghihinalaan', 'Huwag ilipat ang mga hayop — napakahawa'],
  };

  if (/early.*illness|illness.*detect|detect.*disease/.test(t)) return {
    content: 'Ang Early Illness Detection ay sumusuri ng 7 pattern ng sakit mula sa health check parameters na iyong nirerekord.',
    bullets: ['1. Pneumonia / Respiratory Disease', '2. Anemia / Barber Pole Worm (sa pamamagitan ng FAMACHA score)', '3. Ruminal Bloat (bloat score + rumen sounds)', '4. High Fever / Systemic Infection', '5. Enterotoxemia / Gastrointestinal Infection', '6. Lameness / Foot Rot (gait assessment)', '7. PPR - Peste des Petits Ruminants'],
  };

  if (/camera|scanner|scan|computer vision|visual health|litrato|larawan|goat detector|hindi kambing/.test(t)) return {
    content: 'Ang AI Livestock Health Scanner ay gumagamit ng MobileNetV2 Computer Vision at Google Cloud Run ML Server para sa mabilisang visual health screening ng mga kambing at tupa.',
    bullets: [
      '2-Second Live Auto-Scanning: Awtomatikong dine-detect ang hayop at ini-screen sa loob ng 2 segundo',
      'Multi-Species Support: Eksklusibong sinusuportahan ang Kambing (Goat) at Tupa (Sheep)',
      'Non-Target Protection: Kapag hindi kambing o tupa (hal. aso, tao, pusa, bagay), may lalabas na Red Warning at hindi ito tatanggapin',
      'Visual Indicator Analysis: Sinusuri ang postura, coat condition, mata/mukha, at mga palatandaan ng panghihina o sakit',
      'Direct Health History Integration: Maaaring i-save ang screening result diretso sa health log ng hayop',
      'Mahalaga: Ang camera screening ay preliminary assessment lamang at hindi pamalit sa pagsusuri ng lisensyadong beterinaryo',
    ],
  };

  if (/feature|function|what.*can|what.*do|capability|ano.*kaya/.test(t)) return {
    content: bilingual(
      'AlpasFarm is a complete goat and sheep farm management system with AI-powered insights. Here\'s what it can do:',
      'Ang AlpasFarm ay kumpletong sistema para sa pamamahala ng mga kambing at tupa na may AI-powered insights. Narito ang kaya nitong gawin:'
    ),
    bullets: [
      'Pamamahala ng Hayop — magdagdag, mag-edit, i-archive ang hayop gamit ang QR code',
      'AI Livestock Health Scanner — 2-sec real-time camera & upload visual screening gamit ang Computer Vision',
      'Pagmamanman ng Kalusugan — 15 clinical parameters + maagang pagtuklas ng sakit',
      'Timbang at Paglaki — subaybayan ang timbang, tantiyahin ang petsa ng pagiging handa sa merkado',
      'Breeding — pagsubaybay sa pagbubuntis, calculator ng petsa ng pagsilang',
      'Bakuna — pagsubaybay ng iskedyul na may overdue alerts',
      'Pamamahala ng Feed — pagsubaybay ng konsumo + efficiency scoring',
      'Produksyon ng Gatas — araw-araw na ani na may forecast sa loob ng 7 araw',
      'Imbentaryo — stock levels na may expiry alerts',
      '8 ML & Statistical Models — Logistic Regression, Polynomial, Holt, Naive Bayes, K-Means++, OLS, Anomaly Detection, at MobileNetV2 Vision Scanner',
      'Analytics at Ulat — charts, trends, at downloadable na ulat',
      'Activity Log — buong kasaysayan na maaaring i-download bilang CSV',
    ],
  };

  if (/more intelligent|smarter|improve.*ai|mas matalino|gawing mas matalino|100%/.test(t)) return {
    content: bilingual(
      'The AI becomes more accurate and helpful as you add more farm records and use the system consistently.',
      'Mas nagiging tumpak at kapaki-pakinabang ang AI habang nagdadagdag ka ng mas maraming rekord sa farm at regular mo itong ginagamit.'
    ),
    bullets: ['Mag-upload o mag-scan gamit ang AI Health Scanner para sa visual checks', 'Magdagdag ng health checks para mapabuti ang health risk prediction', 'I-record ang timbang at feed data para mapabuti ang growth at feed-efficiency models', 'Gamitin ang milk records para sa mas mahusay na milk yield forecasting', 'I-log ang breeding/mating events para matantiya ng assistant ang eksaktong kidding dates', 'Mas maraming data = mas mahusay na AI recommendations at alerts'],
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

  if (farmData.loading) return {
    content: bilingual(
      'Loading your farm data… please try again in a moment.',
      'Ina-aayos ang iyong farm data… subukan muli sa ilang sandali.'
    ),
  };

  const { intent, animal: animalName } = detect(input);
  const active = farmData.animals.filter((a) => !a.archived);
  const animalName2 = (id: string) => farmData.animals.find((a) => a.id === id)?.name ?? 'Hindi kilala';

  // ── System FAQ ──────────────────────────────────────────────────────────────
  if (intent === 'system_faq') {
    const faq = answerFaq(input);
    if (faq) return { ...faq, tag: 'info' };
    return {
      tag: 'info',
      content: bilingual(
        'AlpasFarm is a smart goat and sheep farm management system. I can answer questions about how any feature works — just ask about anomaly detection, health risk AI, FAMACHA scoring, breeding predictions, milk forecasting, growth models, inventory, or any other feature.',
        'Ang AlpasFarm ay matalinong sistema para sa pamamahala ng kambing at tupa. Maaari akong sumagot kung paano gumagana ang anumang feature — magtanong tungkol sa anomaly detection, health risk AI, FAMACHA scoring, breeding prediction, milk forecasting, growth models, inventory, o iba pang feature.'
      ),
      bullets: ['Subukan: "Paano gumagana ang anomaly detection?"', 'Subukan: "Ano ang FAMACHA?"', 'Subukan: "Paano gumagana ang breeding prediction?"', 'Subukan: "Ano ang lahat ng features ng system na ito?"'],
    };
  }

  // ── Camera Health Screening ───────────────────────────────────────────────────
  if (intent === 'camera_screening') {
    const faq = answerFaq('camera');
    if (faq) return { ...faq, tag: 'insight' };
  }

  if (intent === 'pregnancy_date') {
    const target = animalName ? active.find((a) => a.name.toLowerCase().includes(animalName.toLowerCase())) : undefined;
    if (animalName && !target) {
      return {
        tag: 'info',
        content: `Walang naka-rehistro na hayop na tumugma sa pangalang "${animalName}". Subukang gamitin ang eksaktong pangalan o tag ID.`,
      };
    }

    if (target) {
      return pregnancyResponseForAnimal(target);
    }

    const pregnant = active.filter((a) => a.breeding_status === 'Pregnant');
    if (pregnant.length === 0) {
      return {
        tag: 'info',
        content: 'Walang kasalukuyang buntis na hayop sa record. Kung hindi naitala ang mating/pregnancy event, hindi mo malalaman ang eksaktong petsa ng pagbubuntis.',
      };
    }

    return {
      tag: 'insight',
      content: 'Mga kasalukuyang buntis na hayop at kanilang inaasahang kidding dates:',
      bullets: pregnant.map((a) => {
        const mating = a.last_mating_date ? `Mating: ${formatDate(a.last_mating_date)} · ` : '';
        const expected = a.expected_kidding_date ? `${formatDate(a.expected_kidding_date)} (${daysUntil(a.expected_kidding_date)} araw ang layo)` : 'Hindi naitala ang inaasahang kidding date';
        return `${a.name}: ${mating}${expected}`;
      }),
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
        `Espesye: ${found.species} · Lahi: ${found.breed ?? 'Hindi alam'} · Kasarian: ${found.sex}`,
        `Kalagayan ng Kalusugan: ${found.health_status} (Risk Score: ${found.health_risk_score}/100)`,
        `Kasalukuyang Vitals: Temp ${found.current_temperature ? found.current_temperature + '°C' : '—'} · HR ${found.current_heart_rate ? found.current_heart_rate + ' BPM' : '—'}`,
        `Timbang: ${found.weight_kg ? found.weight_kg + ' kg' : 'Hindi naitala'}`,
        `Bakcuna: ${found.vaccination_status}`,
        `Kalagayan ng Breeding: ${found.breeding_status}`,
      ];

      if (found.expected_kidding_date) {
        const d = daysUntil(found.expected_kidding_date);
        bullets.push(`Inaasahang Kidding: ${formatDate(found.expected_kidding_date)} (${d >= 0 ? d + ' araw ang layo' : 'overdue'})`);
      }
      if (growth?.model) {
        bullets.push(`Tinatayang paglaki: ${growth.model.projectedDailyGain > 0 ? '+' : ''}${growth.model.projectedDailyGain} kg/day · R²=${growth.model.rSquared.toFixed(2)}${growth.model.marketReadyDate ? ' · Handa sa merkado: ' + growth.model.marketReadyDate : ''}`);
      }
      if (milkF?.forecast) {
        const avg = (milkF.forecast.forecast.reduce((s, v) => s + v, 0) / milkF.forecast.forecast.length).toFixed(2);
        bullets.push(`Tinatayang gatas: ~${avg} L/day sa susunod na 7 araw (${milkF.forecast.confidence}% kumpiyansa)`);
      }
      if (breedP?.prediction) {
        bullets.push(`Probabilidad ng matagumpay na breeding: ${pct(breedP.prediction.probability)} — ${breedP.prediction.recommendation}`);
      }
      if (anomaly) {
        const msg = anomaly.tempAnomaly?.isAnomaly ? `[ANOMALYA] ${anomaly.tempAnomaly.message}` : anomaly.hrAnomaly?.isAnomaly ? `[ANOMALYA] ${anomaly.hrAnomaly.message}` : null;
        if (msg) bullets.push(msg);
      }
      if (lastHealth) {
        bullets.push(`Huling health check: ${formatDate(lastHealth.record_date)} · ${lastHealth.risk_level} risk (${lastHealth.risk_score})`);
        if ((lastHealth as any).detected_conditions) bullets.push(`Natukoy na kundisyon: ${(lastHealth as any).detected_conditions}`);
      }

      return {
        tag: 'insight',
        content: bilingual(
          `Here is the full AI profile for **${found.name}** (${found.tag_id}):`,
          `Narito ang buong AI profile para kay **${found.name}** (${found.tag_id}):`
        ),
        bullets,
      };
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

    if (/goat/.test(t)) return { tag: 'insight', content: `Mayroon kang ${goats.length} kambing na nakarehistro (${goats.filter(a=>a.sex==='Female').length} babae, ${goats.filter(a=>a.sex==='Male').length} lalaki).` };
    if (/sheep/.test(t)) return { tag: 'insight', content: `Mayroon kang ${sheep.length} tupa na nakarehistro (${sheep.filter(a=>a.sex==='Female').length} babae, ${sheep.filter(a=>a.sex==='Male').length} lalaki).` };
    if (/female/.test(t)) return { tag: 'insight', content: `Mayroon kang ${females.length} babaeng hayop (${females.filter(a=>a.species==='Goat').length} kambing, ${females.filter(a=>a.species==='Sheep').length} tupa).` };
    if (/male/.test(t)) return { tag: 'insight', content: `Mayroon kang ${males.length} lalaking hayop (${males.filter(a=>a.species==='Goat').length} kambing, ${males.filter(a=>a.species==='Sheep').length} tupa).` };
    if (/milk|gatas/.test(t)) return { tag: 'insight', content: `Kabuuang naka-record na gatas: ${totalMilk.toFixed(2)} litro mula sa ${farmData.milkRecords.length} record ng ${new Set(farmData.milkRecords.map(r=>r.animal_id)).size} hayop.` };
    if (/feed|gastos|cost/.test(t)) return { tag: 'insight', content: `Kabuuang gastos sa feed: ₱${totalFeedCost.toFixed(2)} mula sa ${farmData.feedRecords.length} feed records.` };
    if (/health/.test(t)) return { tag: 'insight', content: `Kabuuang health records: ${farmData.healthRecords.length} mula sa ${new Set(farmData.healthRecords.map(r=>r.animal_id)).size} hayop.` };
    if (/vaccine|vaccin/.test(t)) return { tag: 'insight', content: `Kabuuang bakuna records: ${farmData.vaccinations.length}.` };
    return {
      tag: 'insight',
      content: `Buod ng bilang ng farm:`,
      bullets: [
        `Kabuuang aktibong hayop: ${active.length} (${goats.length} kambing, ${sheep.length} tupa)`,
        `Babae: ${females.length} · Lalaki: ${males.length}`,
        `Buntis: ${active.filter(a=>a.breeding_status==='Pregnant').length}`,
        `Health records: ${farmData.healthRecords.length} · Weight records: ${farmData.weightRecords.length}`,
        `Kabuuang gastos sa feed: ₱${totalFeedCost.toFixed(2)} · Kabuuang gatas: ${totalMilk.toFixed(2)} L`,
        `Inventory items: ${farmData.inventory.length}`,
      ],
    };
  }

  // ── Disease advice ──────────────────────────────────────────────────────────
  if (intent === 'disease') {
    const t = input.toLowerCase();
    if (/ppr|peste/.test(t)) return {
      tag: 'alert', content: 'PPR (Peste des Petits Ruminants) — napakakahawang viral disease:',
      bullets: ['Palatandaan: mataas na lagnat >40°C, discharge sa ilong/mata, pagtatae, sugat sa bibig, pagbaba ng gana sa pagkain', 'WALANG GAMOT — ang pag-iwas gamit ang PPR vaccination lamang ang mabisang hakbang', 'ISA-ISO ang apektadong hayop agad', 'I-report sa DA-BAI (Bureau of Animal Industry) — notifiable disease ito', 'Huwag ilipat ang hayop — napakahawa', 'Bakunaan ang malulusog na hayop kapag may outbreak'],
    };
    if (/pneumonia|respiratory/.test(t)) return {
      tag: 'alert', content: 'Pneumonia sa kambing/tupa — paggamot sa respiratory disease:',
      bullets: ['Palatandaan: lagnat >40°C, mabilis na paghinga (>20 breaths/min), ubo, discharge sa ilong, pagod', 'Gamutin ng antibiotics (Oxytetracycline o Penicillin) — kumonsulta sa vet para sa tamang dosage', 'Isa-iso ang apektadong hayop', 'Siguraduhing maayos ang bentilasyon sa kulungan', 'Suportang pangalaga: vitamin B-complex, electrolytes', vet.trim()],
    };
    if (/bloat/.test(t)) return {
      tag: 'alert', content: 'Paggamot sa bloat ayon sa tindi:',
      bullets: ['Banayad (Score 1): Ilakad ang hayop, bawasan ang legume grazing, magbigay ng anti-bloat solution (simethicone)', 'Katamtaman (Score 2): Anti-bloat drench, itaas ang ulo ng hayop, i-massage ang kaliwang flang', 'Malubha (Score 3) EMERGENCY: Ilakad kaagad, ipasok ang stomach tube para palabasin ang gas, tawagan ang vet NGAYON — maaaring ikamatay sa loob ng oras', 'Pag-iwas: iwasan ang malapot na legume pastures kapag basa, gumamit ng ionophore feed additives', vet.trim()],
    };
    if (/worm|parasite|haemonchus|barber.*pole/.test(t)) return {
      tag: 'alert', content: 'Barber Pole Worm (Haemonchus contortus) — pinaka-matatag na parasite sa kambing at tupa:',
      bullets: ['Pagtukoy: FAMACHA score 4–5 (maputla/puting conjunctiva)', 'Gamutin ng dewormer (Albendazole, Ivermectin, o Fenbendazole) — i-rotate para iwasan ang resistance', 'Targeted Selective Treatment (TST): gamutin lamang ang hayop na may FAMACHA 4–5 upang pabagalin ang resistance', 'Pag-iwas: iwasan ang overgrazing, gamitin ang rotational grazing, strategic deworming', 'Recheck ang FAMACHA sa loob ng 2 linggo pagkatapos ng paggamot', vet.trim()],
    };
    if (/foot.*rot|lameness|hoof/.test(t)) return {
      tag: 'alert', content: 'Paggamot sa Foot Rot / Lameness:',
      bullets: ['Palatandaan: masamang amoy mula sa kuko, pamamaga sa pagitan ng mga daliri, matinding pagkaputol-putol ng paglakad', 'Gamutin: gupitin ang kuko, foot bath gamit ang 10% zinc sulfate solution (3× kada linggo)', 'Malalang kaso: antibiotics (Penicillin o Oxytetracycline) — kumonsulta sa vet', 'Isa-iso ang apektadong hayop upang maiwasan ang pagkalat', 'Pag-iwas: regular na trimming ng kuko, tuyo at malinis na kulungan', vet.trim()],
    };
    if (/diarrhea|loose.*stool|enterotox/.test(t)) return {
      tag: 'alert', content: 'Paggamot sa diarrhea / enterotoxemia:',
      bullets: ['Banayad na pagtatae: oral electrolyte solution, pansamantalang hawakan ang grain', 'Enterotoxemia (Overeating Disease): CD&T vaccine ang susi para maiwasan', 'Palatandaan ng enterotoxemia: biglaang kamatayan o seizures pagkatapos ng sobrang grain', 'Gamutin: antitoxin (kung available), supportive care, bawasan nang malaki ang grain', 'Pag-iwas: CD&T vaccination, dahan-dahang pagbabago ng feed', vet.trim()],
    };
    return {
      tag: 'info', content: 'Mga karaniwang sakit sa kambing/tupa na maaari kong tulungan:',
      bullets: ['PPR (Peste des Petits Ruminants)', 'Pneumonia / Respiratory Disease', 'Bloat (Ruminal Tympany)', 'Barber Pole Worm / Anemia (FAMACHA)', 'Foot Rot / Lameness', 'Enterotoxemia / Diarrhea', 'Magtanong tungkol sa alinman sa mga ito nang partikular!'],
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
    if (atRisk.length > 0) bullets.push(`[URGENT] ${atRisk.map(a=>a.name).join(', ')} kailangan ng agarang pagsusuri sa kalusugan`);
    if (anomalies.length > 0) bullets.push(`Suriin: ${anomalies.map(a=>a.animal.name).join(', ')} may anomalous na vitals — mag-record ng health check`);
    if (overdue.length > 0) bullets.push(`Mag-schedule ng bakuna para sa: ${overdue.map(a=>a.name).slice(0,3).join(', ')}`);
    if (kiddingSoon.length > 0) bullets.push(`Ihanda ang kidding pen para sa: ${kiddingSoon.map(a=>a.name).join(', ')} (darating sa loob ng 7 araw)`);
    if (farmData.inventory.filter(i=>Number(i.quantity)<=Number(i.minimum_stock)).length > 0) bullets.push(`Mag-restock ng mababang inventory bago maubos`);
    if (ml.healthModel?.canPredict && ml.healthModel.accuracy < 0.7) bullets.push(`Magdagdag ng health records para mapabuti ang AI accuracy (kasalukuyang ${Math.round(ml.healthModel.accuracy*100)}%)`);
    if (bullets.length === 0) bullets.push('Ayos ang lahat! Walang agarang kailangang aksyon sa ngayon.');

    return { tag: 'briefing', content: 'Inirekomendang aksyon base sa iyong kasalukuyang farm data:', bullets };
  }

  // ── Compare animals ─────────────────────────────────────────────────────────
  if (intent === 'compare') {
    const words = input.toLowerCase().split(/\s+/);
    const found = active.filter(a => words.some(w => w.length > 2 && a.name.toLowerCase().includes(w)));
    if (found.length >= 2) {
      const bullets = found.slice(0, 4).map(a => {
        const growth = ml.growthPredictions.find(g => g.animalId === a.id);
        return `${a.name}: ${a.weight_kg ? a.weight_kg+'kg' : 'walang timbang'} · ${a.health_status} (${a.health_risk_score}) · ${a.vaccination_status}${growth?.model ? ' · tumataas ng '+growth.model.projectedDailyGain+' kg/day' : ''}`;
      });
      return { tag: 'insight', content: `Paghahambing ng ${found.length} hayop:`, bullets };
    }
    // Compare by category
    const heaviest = [...active].sort((a,b) => Number(b.weight_kg||0) - Number(a.weight_kg||0)).slice(0,3);
    return {
      tag: 'insight', content: 'Top 3 pinakamabigat na hayop:',
      bullets: heaviest.map(a => `${a.name}: ${a.weight_kg ? a.weight_kg+' kg' : 'hindi naitala'} (${a.species}, ${a.sex})`),
    };
  }
  if (intent === 'anomaly') {
    if (anomalies.length === 0) return {
      tag: 'ok',
      content: 'Walang anomalya na natukoy ngayon. Ang temperatura at heart rate ng lahat ng hayop ay nasa kanilang sariling normal na saklaw batay sa Z-score at IQR analysis.',
      bullets: ['Inihahambing ng sistema ang kasalukuyang vitals ng bawat hayop sa sariling historikal nitong baseline', 'Na-flag ang anomaly kapag Z-score > 2 o ang sukat ay nasa labas ng IQR bounds', 'Magdagdag ng higit pang health records para tumaas ang sensitivity ng detection'],
    };
    const bullets = anomalies.flatMap((a) => {
      const r: string[] = [];
      if (a.tempAnomaly?.isAnomaly) r.push(`${a.animal.name}: ${a.tempAnomaly.message} (severity: ${a.tempAnomaly.severity})`);
      if (a.hrAnomaly?.isAnomaly) r.push(`${a.animal.name}: ${a.hrAnomaly.message} (severity: ${a.hrAnomaly.severity})`);
      return r;
    });
    return { tag: 'alert', content: `${anomalies.length} hayop ang nai-flag na may kakaibang vitals batay sa Z-score at IQR analysis:`, bullets };
  }

  // ── Health ──────────────────────────────────────────────────────────────────
  if (intent === 'health') {
    const atRisk = active.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical');
    const model = ml.healthModel;
    const bullets: string[] = [];
    let content = '';
    if (model?.canPredict) content = `Ang Health Risk AI (Logistic Regression) ay tinuruan sa ${model.trainingSamples} records na may ${Math.round(model.accuracy * 100)}% accuracy. `;
    if (atRisk.length === 0) {
      content += 'Ang lahat ng aktibong hayop ay kasalukuyang Healthy o Monitor status. Walang hayop na At Risk o Critical.';
    } else {
      content += `${atRisk.length} hayop ang nai-flag:`;
      atRisk.forEach((a) => bullets.push(`${a.name} (${a.tag_id}) — ${a.health_status} · Risk Score: ${a.health_risk_score}/100${a.current_temperature ? ' · Temp: ' + a.current_temperature + '°C' : ''}`));
    }
    if (anomalies.length > 0) content += `\n\nBukod pa rito, ${anomalies.length} hayop ang may anomalous vitals na natukoy ng statistical analysis.`;
    return { tag: 'insight', content: content + vet, bullets: bullets.length > 0 ? bullets : undefined };
  }

  // ── Vaccination ─────────────────────────────────────────────────────────────
  if (intent === 'vaccination') {
    const overdue = active.filter((a) => a.vaccination_status === 'Overdue');
    const due = active.filter((a) => a.vaccination_status === 'Due Soon');
    const bullets: string[] = [];
    overdue.forEach((a) => bullets.push(`[OVERDUE] ${a.name} (${a.tag_id})${a.next_vaccine_date ? ' — was due ' + formatDate(a.next_vaccine_date) : ''}`));
    due.forEach((a) => bullets.push(`[DUE SOON] ${a.name} (${a.tag_id})${a.next_vaccine_date ? ' — due ' + formatDate(a.next_vaccine_date) + ' (' + daysUntil(a.next_vaccine_date) + ' days)' : ''}`));
    const content = overdue.length + due.length === 0
      ? `Lahat ng ${active.length} aktibong hayop ay up to date na sa bakuna.`
      : `Status ng bakuna: ${overdue.length} overdue, ${due.length} due soon mula sa ${active.length} aktibong hayop:`;
    return { tag: overdue.length > 0 ? 'alert' : 'insight', content, bullets: bullets.length > 0 ? bullets : undefined };
  }

  // ── Breeding ────────────────────────────────────────────────────────────────
  if (intent === 'breeding') {
    const pregnant = active.filter((a) => a.breeding_status === 'Pregnant');
    const highProb = ml.breedingPredictions.filter((b) => b.prediction && b.prediction.probability >= 0.65);
    const bullets: string[] = [];
    pregnant.forEach((a) => {
      const d = a.expected_kidding_date ? daysUntil(a.expected_kidding_date) : null;
      bullets.push(`${a.name} — Pregnant${d !== null ? ', kidding in ' + d + ' days (' + formatDate(a.expected_kidding_date) + ')' : ''}`);
    });
    highProb.filter((b) => !pregnant.find((p) => p.id === b.animal.id)).slice(0, 4).forEach((b) => {
      bullets.push(`${b.animal.name} — Naïve Bayes predicts ${pct(b.prediction!.probability)} breeding success · ${b.prediction!.recommendation}`);
    });
    return {
      tag: 'insight',
      content: `Pangkalahatang breeding: ${pregnant.length} buntis, ${active.filter(a => a.breeding_status === 'Ready').length} handa, ${highProb.length} may mataas na AI-predicted success rate:`,
      bullets: bullets.length > 0 ? bullets : ['Wala pang naka-record na breeding activity.'],
    };
  }

  // ── Growth ──────────────────────────────────────────────────────────────────
  if (intent === 'growth') {
    const models = ml.growthPredictions.filter((g) => g.model);
    if (!models.length) return { tag: 'info', content: 'Wala pang growth forecasts. Kailangan ko ng hindi bababa sa 2 weight records bawat hayop para makabuo ng polynomial regression models. Pumunta sa Weight & Growth → Record Weight.' };
    const bullets = models.slice(0, 8).map((g) => {
      const gain = g.model!.projectedDailyGain;
      return `${g.animalName}: ${gain > 0 ? '+' : ''}${fmt(gain, 3)} kg/day · R²=${g.model!.rSquared.toFixed(2)}${g.model!.marketReadyDate ? ' · Handa sa merkado: ' + g.model!.marketReadyDate : ''}`;
    });
    return { tag: 'insight', content: `Mayroong ${models.length} aktibong growth forecast para sa mga hayop (polynomial regression, 90-day projection):`, bullets };
  }

  // ── Milk ────────────────────────────────────────────────────────────────────
  if (intent === 'milk') {
    const forecasts = ml.milkForecasts.filter((m) => m.forecast);
    if (!forecasts.length) return { tag: 'info', content: 'Wala pang milk forecasts. Kailangan ko ng hindi bababa sa 3 milk records bawat babaeng hayop upang patakbuhin ang Holt\'s exponential smoothing. Pumunta sa Feed Management → Milk Production tab.' };
    const bullets = forecasts.map((m) => {
      const avg = (m.forecast!.forecast.reduce((s, v) => s + v, 0) / m.forecast!.forecast.length).toFixed(2);
      const trend = m.forecast!.trend > 0.01 ? '↑ tumataas' : m.forecast!.trend < -0.01 ? '↓ bumababa' : '→ matatag';
      return `${m.animalName}: ~${avg} L/day · trend ${trend} · ${m.forecast!.confidence}% confidence (MAPE: ${m.forecast!.mape.toFixed(1)}%)`;
    });
    return { tag: 'insight', content: `Forecast ng milk yield (Holt's exponential smoothing, susunod na 7 araw) para sa ${forecasts.length} babaeng hayop${forecasts.length > 1 ? 's' : ''}:`, bullets };
  }

  // ── Feed ────────────────────────────────────────────────────────────────────
  if (intent === 'feed') {
    const feedPred = ml.feedPrediction;
    const total = farmData.feedRecords.reduce((s, r) => s + Number(r.cost || 0), 0);
    if (!feedPred) return { tag: 'info', content: `Kabuuang na-record na gastos sa feed: ₱${total.toFixed(2)}. Wala pang feed-to-weight regression — kailangan ko ng pares ng feed at weight records para sa hindi bababa sa 2 hayop. Magdagdag ng parehong feed records at weight records para sa parehong mga hayop.` };
    const quality = feedPred.rSquared > 0.7 ? 'strong' : feedPred.rSquared > 0.4 ? 'moderate' : 'weak';
    return {
      tag: 'insight',
      content: 'Resulta ng Feed-to-Weight OLS Regression:',
      bullets: [
        `Slope: ${feedPred.slope} kg weight gain kada kg ng feed`,
        `R² = ${feedPred.rSquared.toFixed(3)} — ${quality} correlation (${Math.round(feedPred.rSquared * 100)}% ng pagbabago sa timbang ay naipapaliwanag ng feed)`,
        `Kabuuang na-record na gastos sa feed: ₱${total.toFixed(2)}`,
        feedPred.slope > 0 ? `Bawat 1 kg ng feed → ~${feedPred.slope} kg weight gain (FCR = ${(1 / feedPred.slope).toFixed(2)})` : 'Walang positibong feed-to-gain correlation na nakita — suriin ang kalidad ng feed',
      ],
    };
  }

  // ── Inventory ───────────────────────────────────────────────────────────────
  if (intent === 'inventory') {
    const low = farmData.inventory.filter((i) => Number(i.quantity) <= Number(i.minimum_stock));
    const expired = farmData.inventory.filter((i) => i.expiry_date && new Date(i.expiry_date) < new Date());
    const bullets: string[] = [];
    expired.forEach((i) => bullets.push(`[LAPAS NA PETSA] ${i.name} (${i.quantity} ${i.unit})`));
    low.forEach((i) => bullets.push(`[MABABANG STOCK] ${i.name} — ${i.quantity} ${i.unit} natira (min: ${i.minimum_stock})`));
    const content = low.length + expired.length === 0
      ? `Lahat ng ${farmData.inventory.length} inventory items ay nasa tamang stock at walang expired na item.`
      : `Alert sa imbentaryo: ${expired.length} expired, ${low.length} mababang stock na item:`;
    return { tag: low.length > 0 || expired.length > 0 ? 'alert' : 'ok', content, bullets: bullets.length > 0 ? bullets : undefined };
  }

  // ── Cluster ─────────────────────────────────────────────────────────────────
  if (intent === 'cluster') {
    const c = ml.clusters;
    if (!c) return { tag: 'info', content: 'Kailangan ng hindi bababa sa 3 aktibong hayop para sa K-means clustering. Magdagdag ng higit pang hayop para ma-enable ang herd segmentation.' };
    const map: Record<number, string[]> = {};
    c.assignments.forEach((a) => (map[a.cluster] ??= []).push(a.name));
    const bullets = c.clusterLabels.map((label, i) => {
      const members = map[i] ?? [];
      return `${label}: ${members.slice(0, 5).join(', ')}${members.length > 5 ? ` +${members.length - 5} more` : ''} (${members.length} animals)`;
    });
    return { tag: 'insight', content: `Pinangkat ng K-means++ clustering ang iyong ${active.length} aktibong hayop sa ${c.k} segment base sa weight, age, health score, at species:`, bullets };
  }

  if (intent === 'unknown') {
    return {
      tag: 'info',
      content: bilingual(
        'Sorry, I didn\'t understand that question clearly. Please ask in Tagalog or English about your animals, health checks, feed, or farm status.',
        'Pasensya, hindi ko malinaw na naintindihan ang tanong. Maari kang magtanong sa Tagalog o English tungkol sa iyong mga hayop, kalusugan, pagkain, o status ng farm.'
      ),
    };
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (intent === 'summary') {
    const healthy = active.filter((a) => a.health_status === 'Healthy').length;
    const atRisk = active.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical').length;
    const pregnant = active.filter((a) => a.breeding_status === 'Pregnant').length;
    const avgW = active.length > 0 ? active.reduce((s, a) => s + (Number(a.weight_kg) || 0), 0) / active.length : 0;
    return {
      tag: 'insight',
      content: `Buod ng farm para sa ${active.length} aktibong hayop:`,
      bullets: [
        `Health: ${healthy} Healthy, ${active.filter(a => a.health_status === 'Monitor').length} Monitor, ${atRisk} At Risk/Critical`,
        `Average weight: ${fmt(avgW)} kg`,
        `Buntis: ${pregnant} hayop`,
        `Bakcuna: ${active.filter(a => a.vaccination_status === 'Up to Date').length} up to date, ${active.filter(a => a.vaccination_status === 'Overdue').length} overdue`,
        `Nakatuklasang anomalya: ${anomalies.length}`,
        `Aktibong ML insights: ${ml.totalInsights}`,
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
  if (atRisk2.length > 0) bullets.push(`[URGENT] ${atRisk2.length} hayop ang nasa panganib: ${atRisk2.slice(0, 2).map(a => a.name).join(', ')}`);
  if (anomalies.length > 0) bullets.push(`[ANOMALY] ${anomalies.length} kakaibang vital ang natukoy: ${anomalies.slice(0, 2).map(a => a.animal.name).join(', ')}`);
  if (overdue2.length > 0) bullets.push(`[VACCINE] ${overdue2.length} overdue na bakuna`);
  if (pregnant2.length > 0) bullets.push(`[BREEDING] ${pregnant2.length} hayop ang magbubuntis sa loob ng 14 na araw`);
  if (low2.length > 0) bullets.push(`[INVENTORY] ${low2.length} inventory item ang mababa ang stock`);
  if (ml.growthPredictions.filter(g => g.model).length > 0) bullets.push(`[GROWTH] ${ml.growthPredictions.filter(g => g.model).length} growth forecasts ang aktibo`);
  if (ml.healthModel?.canPredict) bullets.push(`AI sa Kalusugan: ${Math.round(ml.healthModel.accuracy * 100)}% accuracy · ${ml.healthModel.trainingSamples} training samples`);

  const status = atRisk2.length > 0 || anomalies.length > 0 ? 'kailangan ng pansin' : overdue2.length > 0 || low2.length > 0 ? 'may ilang dapat bantayan' : 'ayos ang lahat';
  return {
    tag: bullets.length > 0 ? 'briefing' : 'ok',
    content: `Ulat sa farm — ${active.length} aktibong hayop, ${status}:`,
    bullets: bullets.length > 0 ? bullets : ['Ayos ang lahat! Lahat ng hayop ay malusog, napapanahon ang bakuna, at sapat ang stock levels.'],
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
    content: bilingual(
      'Hi! I\'m your AI Farm Assistant. Ask me anything about your animals, health risks, or how any feature works.',
      'Hi! Ako ang iyong AI Farm Assistant. Magtanong tungkol sa iyong mga hayop, kalusugan, o kung paano gumagana ang anumang feature sa bukid.'
    ),
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
    if (anomalies.length > 0) p.push(`Ipakita ang mga anomalya (${anomalies.length} natukoy)`);
    if (farmData.animals.some(a => a.health_status === 'At Risk' || a.health_status === 'Critical')) p.push('Aling hayop ang nasa panganib?');
    if (farmData.animals.some(a => a.vaccination_status === 'Overdue')) p.push('Prayoridad sa bakuna');
    if (ml.growthPredictions.some(g => g.model?.marketReadyDate)) p.push('Mga petsa ng paglaki at paghahanda sa merkado');
    p.push('Ano ang dapat gawin ngayon?');
    p.push('Paano gumagana ang anomaly detection?');
    p.push('Ano ang pakain sa aking mga kambing?');
    p.push('Ilan ang mga hayop ko?');
    p.push('Palatandaan ng PPR');
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
                {ml.totalInsights > 0 ? `${farmData.animals.filter(a=>!a.archived).length} aktibong hayop sa bukid` : 'Nakakonekta sa iyong farm data'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="ai-close-btn" onClick={() => { const r = buildReply('briefing', farmData, ml, anomalies); setMessages(p => [...p, { id: `b${Date.now()}`, role: 'assistant', ...r }]); }} title="I-refresh ang briefing"><RefreshCw size={14} /></button>
            <button className="ai-close-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        {/* Status bar */}
        {!farmData.loading && (
          <div style={{ display: 'flex', gap: 8, padding: '6px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {ml.healthModel?.canPredict && <span style={{ fontSize: 11, color: 'var(--text-secondary)', display:'flex', alignItems:'center', gap:3 }}><Brain size={10} color="#FF7A18"/>Pagsusuri sa Kalusugan</span>}
            {anomalies.length > 0 && <span style={{ fontSize: 11, color: '#FF3B30', display:'flex', alignItems:'center', gap:3 }}><AlertCircle size={10}/>{anomalies.length} anomalya</span>}
            {ml.growthPredictions.filter(g=>g.model).length > 0 && <span style={{ fontSize: 11, color: 'var(--text-secondary)', display:'flex', alignItems:'center', gap:3 }}><TrendingUp size={10} color="#FF9F0A"/>{ml.growthPredictions.filter(g=>g.model).length} pagtataya sa paglaki</span>}
            {ml.clusters && <span style={{ fontSize: 11, color: 'var(--text-secondary)', display:'flex', alignItems:'center', gap:3 }}><Zap size={10} color="#FFB340"/>{ml.clusters.k} mga pangkat</span>}
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
            {thinking && <div className="ai-message assistant"><span style={{ opacity:0.5, fontSize:13 }}>Sinusuri ang iyong farm data…</span></div>}
            <div ref={endRef} />
          </div>
        </div>

        {/* Composer */}
        <form className="ai-composer" onSubmit={e => { e.preventDefault(); send(draft); }}>
          <input
            className="ai-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Magtanong tungkol sa hayop, AI model, o feature…"
            disabled={thinking}
          />
          <button className="ai-send-btn" type="submit" disabled={thinking || !draft.trim()}><Send size={16}/></button>
        </form>
      </div>
    </div>
  );
}
