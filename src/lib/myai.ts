/**
 * MyAI — AI provider abstraction for AlpasFarm
 *
 * LOCAL  (VITE_AI_MODE=local):
 *   Browser → Ollama localhost:11434 directly
 *
 * PRODUCTION  (VITE_AI_MODE=production, or env not set):
 *   Browser → POST /api/ai/chat (Vercel serverless) → Groq API
 *   The Groq API key is NEVER exposed to the browser.
 *   Set GROQ_API_KEY in Vercel Dashboard → Settings → Environment Variables.
 *
 * Farm context is built from Supabase data already loaded by the
 * authenticated user's session.
 */

// ── Provider detection ────────────────────────────────────────────────────────
export type AIMode = 'local' | 'production';

export const AI_MODE: AIMode =
  (import.meta.env.VITE_AI_MODE as AIMode) === 'local' ? 'local' : 'production';

// Local Ollama config (used only when VITE_AI_MODE=local)
const OLLAMA_URL   = import.meta.env.VITE_OLLAMA_URL   ?? 'http://localhost:11434';
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen2.5:1.5b';

// Production endpoint — the Vercel serverless function holds the API key
// NEVER call Groq directly from the browser — CORS + key exposure
const VERCEL_AI_ENDPOINT = '/api/ai/chat';

// Supabase Edge Function fallback (if deployed)
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const EDGE_ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ai-chat` : null;

export const MYAI_MODEL = AI_MODE === 'local' ? OLLAMA_MODEL : 'MyAI Cloud';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MyAIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface MyAIConversation {
  id: string;
  title: string;
  messages: MyAIMessage[];
  createdAt: number;
  updatedAt: number;
}

export type AIStatus =
  | 'checking'
  | 'online'        // local Ollama running + model present
  | 'offline'       // local Ollama not running
  | 'no_model'      // Ollama running but model missing
  | 'production'    // production mode — always available
  | 'unavailable';  // production endpoint returned an error

// ── Status check ──────────────────────────────────────────────────────────────
export async function checkAIStatus(): Promise<AIStatus> {
  // Local mode: test Ollama directly
  if (AI_MODE === 'local') {
    try {
      const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = await r.json();
        const models: string[] = (data.models || []).map((m: { name: string }) => m.name);
        const hasModel = models.some((m) => m.includes(OLLAMA_MODEL.split(':')[0]));
        return hasModel ? 'online' : 'no_model';
      }
      return 'offline';
    } catch {
      return 'offline';
    }
  }

  // Production: probe /api/ai/chat
  // 400 = endpoint exists + GROQ_API_KEY is set (returned for empty messages) → 'production'
  // 503 = endpoint exists but GROQ_API_KEY missing in Vercel              → 'unavailable'
  // 404 = function not deployed yet                                        → 'unavailable'
  // network error = local dev without Vercel dev server                   → 'unavailable'
  try {
    const r = await fetch(VERCEL_AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),   // empty → 400 (not 503) when key exists
      signal: AbortSignal.timeout(6000),
    });
    if (r.status === 400 || r.status === 200) return 'production';
    if (r.status === 503) return 'unavailable';   // key missing
    if (r.status === 404) return 'unavailable';   // not deployed
    if (r.status === 429) return 'production';    // rate limited but reachable
    return 'production';   // other codes still mean the endpoint is there
  } catch {
    return 'unavailable';
  }
}

export const SYSTEM_PROMPT = `You are MyAI, the intelligent assistant for AlpasFarm — an Intelligent Goat & Sheep Farm Management System used by Filipino livestock farmers.

Your purpose is to help farm managers understand, manage, and analyze information within their AlpasFarm system.

ALPASFARM SYSTEM CAPABILITIES & MODULES:
1. Animals & Profiles: Complete herd tracking for Goats (kambing) and Sheep (tupa) with QR tags, vitals (temperature, heart rate), health status, and breeding status.
2. AI Livestock Health Scanner: Real-time 2-second computer vision screening powered by MobileNetV2 and Cloud Run ML Server. Supports goats and sheep, visual symptom indicator detection, and automatically rejects non-target objects/animals (dogs, cats, humans, objects).
3. Health & Illness Monitoring: 15 clinical parameters, FAMACHA scoring (for anemia/barber pole worm), bloat scoring (0-3), rumen motility, and early pattern detection for 7 conditions (PPR, pneumonia, bloat, fever, foot rot, enterotoxemia, anemia).
4. Weight & Growth Forecasting: Polynomial regression for weight trajectories and market-ready dates.
5. Breeding & Reproduction: Gestation calculators (150-day gestation), mating records, expected kidding dates, and Naive Bayes breeding success probability.
6. Vaccination & Deworming: Preventive health schedules with overdue and due-soon alerts.
7. Feed Management & FCR: Feed intake tracking, cost computation, and Ordinary Least Squares (OLS) feed-to-gain modeling.
8. Dairy & Milk Yield: Daily milk logging and 7-day yield forecasting via Holt's Exponential Smoothing.
9. Farm Inventory: Feed and medicine stock levels with minimum stock and expiry date tracking.
10. 8 ML & Statistical Models: Logistic Regression Health Risk, Polynomial Growth Forecast, Holt Smoothing Milk Forecast, Naive Bayes Breeding Success, K-Means++ Herd Clustering, OLS Feed Efficiency, Statistical Anomaly Detection (Z-Score & IQR), and MobileNetV2 Vision Health Scanner.

IMPORTANT RULES:
- You have access to REAL farm data provided to you in this conversation. Use it to answer questions accurately.
- NEVER invent or hallucinate animal records, health records, vaccination records, breeding records, inventory, or analytics.
- If requested information is not in the provided data, clearly say: "I couldn't find that information in the current AlpasFarm records."
- You are READ-ONLY. Do not claim to add, edit, or delete any records.
- Provide practical, concise answers focused on farm management.
- You support both English and Filipino (Tagalog). Respond in the language the user uses.
- When giving health or veterinary recommendations, always remind the user to consult a licensed veterinarian (beterinaryo).
- Health risk scores, ML predictions, and calculated values come from AlpasFarm's own algorithms — do not recalculate them.
- Keep responses concise and practical. Use bullet points for lists.

CAMERA & VISION SCREENING RULES:
- Camera screening results come ONLY from the actual ML model in AlpasFarm. NEVER invent confidence scores, predictions, or screening results.
- Always state that camera screenings are PRELIMINARY assessments and NOT veterinary diagnoses.
- Visual screening is strictly for Goats and Sheep. Non-target items are flagged with a red warning.
- If asked about a camera screening, use the [CAMERA SCREENINGS] data provided. Do not fabricate results.`;

// ── Farm context builder ──────────────────────────────────────────────────────
export function buildFarmContext(
  farmData: {
    animals: any[];
    healthRecords: any[];
    weightRecords: any[];
    breedingRecords: any[];
    vaccinations: any[];
    inventory: any[];
    feedRecords: any[];
    milkRecords: any[];
    settings: any | null;
    cameraScreenings?: any[]; // optional — camera ML screening results
  },
  question: string,
): string {
  const q = question.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const active = farmData.animals.filter((a) => !a.archived);
  const nm: Record<string, string> = {};
  farmData.animals.forEach((a) => { nm[a.id] = a.name; });

  const lines: string[] = [];

  // Always include animals summary
  lines.push(`[FARM DATA] Date: ${today}`);
  lines.push(`[ANIMALS] ${active.length} active animals:`);
  active.forEach((a) => {
    let line = `  ${a.name} (${a.tag_id}) | ${a.species} ${a.breed ?? '?'} | ${a.sex}`;
    if (a.weight_kg) line += ` | ${a.weight_kg}kg`;
    line += ` | health:${a.health_status}(${a.health_risk_score}) | vacc:${a.vaccination_status} | breeding:${a.breeding_status}`;
    if (a.expected_kidding_date) line += ` | kidding:${a.expected_kidding_date}`;
    if (a.current_temperature) line += ` | temp:${a.current_temperature}°C hr:${a.current_heart_rate}bpm`;
    lines.push(line);
  });

  // Health records
  if (/health|sick|risk|ill|disease|fever|kalusugan|lagnat|check|suriin|anomal|condition|attention|critical/.test(q)) {
    const recent = farmData.healthRecords.slice(0, 15);
    if (recent.length > 0) {
      lines.push(`\n[HEALTH RECORDS] Last ${recent.length}:`);
      recent.forEach((r) => {
        const cond = r.detected_conditions ? ` | DETECTED:${r.detected_conditions}` : '';
        lines.push(
          `  ${nm[r.animal_id] ?? '?'} | ${r.record_date} | ${r.risk_level}(${r.risk_score}) | temp:${r.temperature ?? '?'}°C${cond}`,
        );
      });
    }
  }

  // Vaccinations
  if (/vaccin|bakun|overdue|shot|immuniz|due/.test(q)) {
    const overdue = farmData.vaccinations.filter((v: any) => {
      const ndd = v.next_due_date;
      return ndd && ndd < today;
    });
    const dueSoon = farmData.vaccinations.filter((v: any) => {
      const ndd = v.next_due_date;
      if (!ndd || ndd < today) return false;
      return (new Date(ndd).getTime() - Date.now()) / 86400000 <= 30;
    });
    lines.push(`\n[VACCINATIONS] ${overdue.length} overdue, ${dueSoon.length} due soon:`);
    [...overdue, ...dueSoon].slice(0, 15).forEach((v: any) => {
      const status = v.next_due_date && v.next_due_date < today ? 'OVERDUE' : 'DUE_SOON';
      lines.push(
        `  ${nm[v.animal_id] ?? '?'} | ${v.vaccine_name} | given:${v.date_given} | next:${v.next_due_date ?? '?'} | ${status}`,
      );
    });
  }

  // Breeding
  if (/breed|pregnant|kidding|mating|buntis|birth|offspring|gestation/.test(q)) {
    lines.push(`\n[BREEDING] ${farmData.breedingRecords.length} records:`);
    farmData.breedingRecords.slice(0, 15).forEach((r: any) => {
      lines.push(
        `  ${nm[r.animal_id] ?? '?'} | ${r.status} | mated:${r.mating_date} | expected_kidding:${r.expected_kidding_date ?? 'none'} | offspring:${r.offspring_count ?? '?'}`,
      );
    });
  }

  // Weight
  if (/weight|grow|gain|timbang|market|heavy|light/.test(q)) {
    lines.push(`\n[WEIGHT RECORDS] Last ${Math.min(farmData.weightRecords.length, 20)}:`);
    farmData.weightRecords.slice(0, 20).forEach((r: any) => {
      const gain = r.daily_gain_kg ? ` | gain:${r.daily_gain_kg}kg/day` : '';
      lines.push(`  ${nm[r.animal_id] ?? '?'} | ${r.record_date} | ${r.weight_kg}kg${gain}`);
    });
  }

  // Inventory
  if (/inventory|stock|supply|medicine|expired|gamot|kulang/.test(q)) {
    const lowStock = farmData.inventory.filter(
      (i: any) => Number(i.quantity) <= Number(i.minimum_stock),
    );
    const expired = farmData.inventory.filter(
      (i: any) => i.expiry_date && i.expiry_date < today,
    );
    lines.push(
      `\n[INVENTORY] ${farmData.inventory.length} items, ${lowStock.length} low stock, ${expired.length} expired:`,
    );
    farmData.inventory.forEach((i: any) => {
      const flags: string[] = [];
      if (Number(i.quantity) <= Number(i.minimum_stock)) flags.push('LOW_STOCK');
      if (i.expiry_date && i.expiry_date < today) flags.push('EXPIRED');
      lines.push(
        `  ${i.name} | ${i.category} | ${i.quantity}${i.unit} min:${i.minimum_stock}${flags.length ? ' | [ALERT] ' + flags.join(',') : ''}`,
      );
    });
  }

  // Feed
  if (/feed|pagkain|kain|cost|gastos|fcr|fodder/.test(q)) {
    const totalCost = farmData.feedRecords.reduce(
      (s: number, r: any) => s + Number(r.cost || 0), 0,
    );
    lines.push(`\n[FEED] ${farmData.feedRecords.length} records, total:₱${totalCost.toFixed(2)}:`);
    farmData.feedRecords.slice(0, 15).forEach((r: any) => {
      lines.push(
        `  ${nm[r.animal_id] ?? '?'} | ${r.record_date} | ${r.feed_type} | ${r.quantity_kg}kg | ₱${r.cost}`,
      );
    });
  }

  // Milk
  if (/milk|gatas|yield|dairy|litro/.test(q)) {
    const totalMilk = farmData.milkRecords.reduce(
      (s: number, r: any) => s + Number(r.yield_litres || 0), 0,
    );
    lines.push(
      `\n[MILK] ${farmData.milkRecords.length} records, total:${totalMilk.toFixed(2)}L:`,
    );
    farmData.milkRecords.slice(0, 15).forEach((r: any) => {
      lines.push(`  ${nm[r.animal_id] ?? '?'} | ${r.record_date} | ${r.yield_litres}L`);
    });
  }

  // Farm settings (always append if available)
  if (farmData.settings) {
    lines.push(
      `\n[FARM SETTINGS] Farm:${farmData.settings.farm_name} | target_weight:${farmData.settings.target_weight_kg}kg | gestation:${farmData.settings.gestation_days}days`,
    );
  }

  // Camera screenings — include when question is about camera/screening/visual
  if (
    /camera|screen|photo|image|visual|picture|larawan|litrato|screening/.test(q) ||
    (farmData.cameraScreenings && farmData.cameraScreenings.length > 0 &&
      /health|sick|risk|concern/.test(q))
  ) {
    const screenings = farmData.cameraScreenings ?? [];
    if (screenings.length > 0) {
      const nm2: Record<string, string> = {};
      farmData.animals.forEach((a: any) => { nm2[a.id] = a.name; });

      const concerns = screenings.filter((s: any) => s.prediction === 'possible_health_concern');
      lines.push(
        `\n[CAMERA SCREENINGS] ${screenings.length} total, ${concerns.length} possible concerns:`,
      );
      lines.push(
        'IMPORTANT: Camera screenings are PRELIMINARY ML assessments only, NOT veterinary diagnoses.',
      );
      screenings.slice(0, 15).forEach((s: any) => {
        const aname = nm2[s.animal_id] ?? '?';
        const label =
          s.prediction === 'possible_health_concern'
            ? 'Possible Health Concern'
            : s.prediction === 'normal_appearance'
            ? 'Normal Appearance'
            : 'Low Confidence';
        lines.push(
          `  ${aname} | ${s.created_at?.slice(0, 10)} | ${label} | confidence:${Math.round(s.confidence * 100)}% | model:${s.model_version} | quality:${s.quality_score}/100`,
        );
      });
    } else {
      lines.push('\n[CAMERA SCREENINGS] No camera screenings have been performed yet.');
    }
  }

  return lines.join('\n');
}

// ── Stream chat — routes based on mode ───────────────────────────────────────
export async function* streamChat(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<void> {
  // LOCAL mode: use Ollama running on the developer's machine
  if (AI_MODE === 'local') {
    try {
      yield* _streamOllama(messages, onToken, signal);
      return;
    } catch (ollamaErr) {
      // Ollama not running — fall through to production path
      console.warn('[AlpasFarm AI] Ollama unavailable, trying /api/ai/chat:', ollamaErr);
    }
  }

  // PRODUCTION path — always route through /api/ai/chat (Vercel serverless).
  // The Groq API key is kept server-side. Direct browser→Groq is CORS-blocked
  // in production and would also leak the API key.
  try {
    yield* _streamViaVercel(messages, onToken, signal);
    return;
  } catch (vercelErr) {
    // /api/ai/chat failed — check if we have a Supabase Edge Function fallback
    console.warn('[AlpasFarm AI] /api/ai/chat failed:', vercelErr);
    if (EDGE_ENDPOINT) {
      try {
        yield* _streamEdgeFunction(messages, onToken, signal);
        return;
      } catch (edgeErr) {
        console.warn('[AlpasFarm AI] Supabase Edge Function also failed:', edgeErr);
      }
    }
    throw vercelErr;   // re-throw the original error with its descriptive message
  }
}

// ── Primary production path: /api/ai/chat (Vercel serverless) ────────────────
// The Vercel function holds the GROQ_API_KEY server-side.
// It accepts the messages array and returns SSE: data: {"token":"..."}
async function* _streamViaVercel(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<void> {
  const resp = await fetch(VERCEL_AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!resp.ok) {
    // Read the error body for a descriptive message
    let errMsg = `AI service error (${resp.status}).`;
    let errCode = '';
    try {
      const errBody = await resp.json();
      if (errBody?.error) errMsg = errBody.error;
      if (errBody?.code)  errCode = errBody.code;
    } catch { /* ignore parse error */ }

    // Map HTTP status to actionable user messages
    if (resp.status === 503 || errCode === 'NO_API_KEY') {
      throw new Error('AI service is not configured for production. Set GROQ_API_KEY in Vercel Dashboard → Settings → Environment Variables.');
    }
    if (resp.status === 502 && errCode === 'INVALID_KEY') {
      throw new Error('The AI API key is invalid. Verify GROQ_API_KEY in Vercel environment variables.');
    }
    if (resp.status === 429 || errCode === 'RATE_LIMIT') {
      throw new Error('AI is temporarily busy (rate limit). Please wait a moment and try again.');
    }
    if (resp.status === 404) {
      throw new Error('AI endpoint not found. Check that Vercel deployment includes api/ai/chat.ts.');
    }
    if (resp.status === 405) {
      throw new Error('AI endpoint configuration error (405). Check vercel.json rewrites.');
    }
    throw new Error(errMsg);
  }

  // Parse SSE stream: data: {"token":"..."} or data: {"done":true}
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream from AI service. Please try again.');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t || !t.startsWith('data: ')) continue;
      try {
        const d = JSON.parse(t.slice(6));
        if (d?.error) throw new Error(d.error);
        if (d?.token) onToken(d.token);
        if (d?.done) return;
      } catch (parseErr) {
        // Re-throw actual errors, skip malformed SSE chunks
        if (parseErr instanceof SyntaxError) continue;
        throw parseErr;
      }
    }
    yield;
  }
}

// ── Direct Groq function removed ──────────────────────────────────────────────
// Browser → Groq direct calls are CORS-blocked in production and would expose
// the API key. All production AI goes through /api/ai/chat (Vercel serverless).
// This function is intentionally removed.

// ── Supabase Edge Function streaming ─────────────────────────────────────────
async function* _streamEdgeFunction(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<void> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const resp = await fetch(EDGE_ENDPOINT!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!resp.ok) {
    let msg = `AI service error (${resp.status}). Please try again.`;
    try { const d = await resp.json(); if (d?.error) msg = d.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream.');
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t || !t.startsWith('data: ')) continue;
      try {
        const d = JSON.parse(t.slice(6));
        if (d?.token) onToken(d.token);
        if (d?.done) return;
      } catch { /* skip */ }
    }
    yield;
  }
}
async function* _streamOllama(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<void> {
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      options: { temperature: 0.7, num_ctx: 4096, num_predict: 1024 },
    }),
    signal,
  });

  if (!resp.ok) throw new Error(`Ollama error: ${resp.status} ${resp.statusText}`);

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body from Ollama');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        const token = data?.message?.content ?? '';
        if (token) onToken(token);
        if (data?.done) return;
      } catch { /* skip */ }
    }
    yield;
  }
}

// ── Conversation storage (localStorage) ──────────────────────────────────────
const STORAGE_KEY = 'myai_conversations';

export function loadConversations(): MyAIConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MyAIConversation[];
  } catch {
    return [];
  }
}

export function saveConversations(convs: MyAIConversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs.slice(0, 50)));
  } catch { /* storage full */ }
}

export function newConversation(firstMessage?: string): MyAIConversation {
  return {
    id: crypto.randomUUID(),
    title: firstMessage
      ? firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '…' : '')
      : 'New Conversation',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
