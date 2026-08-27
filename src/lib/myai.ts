/**
 * MyAI — AI provider abstraction for AlpasFarm
 *
 * LOCAL  (VITE_AI_MODE=local):
 *   Browser → Ollama localhost:11434 directly
 *
 * PRODUCTION  (VITE_AI_MODE=production, or env not set):
 *   Browser → /api/ai/chat (Vercel serverless) → Groq API
 *   API key never reaches the browser.
 *
 * Farm context is built from Supabase data already loaded by the
 * authenticated user's session — no extra DB queries needed here.
 */

// ── Provider detection ────────────────────────────────────────────────────────
export type AIMode = 'local' | 'production';

export const AI_MODE: AIMode =
  (import.meta.env.VITE_AI_MODE as AIMode) === 'local' ? 'local' : 'production';

// Local Ollama config
const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen2.5:1.5b';

// Production: Groq direct (capstone/demo mode — key scoped to this project)
// For a production SaaS, move this to a server-side proxy.
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
const GROQ_MODEL = 'llama-3.1-8b-instant';

// Supabase Edge Function fallback (if deployed)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
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
  // Local mode: test Ollama first
  if (AI_MODE === 'local') {
    try {
      const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = await r.json();
        const models: string[] = (data.models || []).map((m: { name: string }) => m.name);
        const hasModel = models.some((m) => m.includes(OLLAMA_MODEL.split(':')[0]));
        return hasModel ? 'online' : 'no_model';
      }
    } catch {
      // Ollama not reachable — check if /api/ai/chat is available as fallback
    }
  }

  // Production / fallback: ping /api/ai/chat with an OPTIONS-like test
  // We don't send a real message — just check if the endpoint responds
  try {
    const r = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Send an empty messages array — server will return 400, not 503/404
      // 400 = endpoint exists and is configured; 503 = missing key; 404 = not deployed
      body: JSON.stringify({ messages: [] }),
      signal: AbortSignal.timeout(5000),
    });
    // 400 = endpoint works, just bad input — AI is available
    // 503 = endpoint works, key missing — unavailable
    // 404 = endpoint not deployed yet
    if (r.status === 400 || r.status === 200) return 'production';
    if (r.status === 503) return 'unavailable';
    if (r.status === 404) {
      // /api/ai/chat not deployed — try direct Groq if key available
      if (GROQ_KEY) return 'production';
      return 'unavailable';
    }
    return 'production';
  } catch {
    // Network error — likely local dev without Vercel functions
    if (GROQ_KEY) return 'production';
    return 'unavailable';
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
export const SYSTEM_PROMPT = `You are MyAI, the AI assistant for AlpasFarm — an Intelligent Goat & Sheep Farm Management System used by Filipino farmers.

Your purpose is to help farm managers understand and manage information within their AlpasFarm system.

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

CAMERA SCREENING RULES (CRITICAL):
- Camera screening results come ONLY from the actual ML model in AlpasFarm. NEVER invent confidence scores, predictions, or screening results.
- Always state that camera screenings are PRELIMINARY assessments and NOT veterinary diagnoses.
- If asked about a camera screening, use the [CAMERA SCREENINGS] data provided. Do not fabricate results.
- Example: "According to AlpasFarm's camera screening, [animal] was flagged with a possible health concern at [confidence]% ML confidence. This is only a preliminary visual screening — please consult a veterinarian."
- If no camera screening data is available for an animal, say so clearly.

TABULAR ML HEALTH SCREENING RULES (CRITICAL):
- The tabular ML health screening uses a Random Forest model trained on SYNTHETIC data.
- The ML probability (0–100%) is the model's output — it is NOT the same as the AlpasFarm veterinary risk score.
- The AlpasFarm veterinary rule engine is the authoritative health assessment. The ML model is an additional early-warning tool only.
- If asked "Why is [animal] marked as needing attention?", explain the contributing factors from the ML result data. Do NOT invent ML results.
- Always state: "This ML screening was trained on synthetic data and is NOT a veterinary diagnosis."
- Example: "According to the AlpasFarm ML health screening, [animal] showed [probability]% ML probability of suspected illness, with [feature1] and [feature2] as top contributing factors. This is an early-warning tool — please consult a veterinarian for confirmation."
- NEVER present ML probability as equivalent to a veterinary diagnosis or disease confirmation.`;

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
        `  ${i.name} | ${i.category} | ${i.quantity}${i.unit} min:${i.minimum_stock}${flags.length ? ' | ⚠️' + flags.join(',') : ''}`,
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
        '⚠️ IMPORTANT: Camera screenings are PRELIMINARY ML assessments only, NOT veterinary diagnoses.',
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
  if (AI_MODE === 'local') {
    try {
      yield* _streamOllama(messages, onToken, signal);
      return;
    } catch (ollamaErr) {
      // Ollama unavailable — fall through to cloud AI
      console.warn('[AlpasFarm AI] Ollama unavailable, trying cloud AI:', ollamaErr);
    }
  }

  // Production path — ALWAYS go through /api/ai/chat Vercel function.
  // This keeps the API key server-side and avoids Groq CORS restrictions.
  try {
    yield* _streamViaVercel(messages, onToken, signal);
    return;
  } catch (vercelErr) {
    // /api/ai/chat failed (e.g. local dev without Vercel functions)
    // Fall back to direct Groq only if running locally with the key
    console.warn('[AlpasFarm AI] /api/ai/chat failed, trying direct Groq fallback:', vercelErr);
  }

  if (GROQ_KEY) {
    try {
      yield* _streamGroqDirect(messages, onToken, signal);
      return;
    } catch (groqErr) {
      console.warn('[AlpasFarm AI] Direct Groq failed:', groqErr);
      if (EDGE_ENDPOINT) {
        yield* _streamEdgeFunction(messages, onToken, signal);
        return;
      }
      throw groqErr;
    }
  }

  if (EDGE_ENDPOINT) {
    yield* _streamEdgeFunction(messages, onToken, signal);
    return;
  }

  throw new Error('AI service is not configured. Please check that GROQ_API_KEY is set in Vercel environment variables.');
}

// ── Primary production path: /api/ai/chat (Vercel serverless) ────────────────
// The Vercel function holds the GROQ_API_KEY server-side.
// It accepts the messages array and returns SSE tokens.
async function* _streamViaVercel(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<void> {
  const resp = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!resp.ok) {
    let errMsg = `AI service error (${resp.status}).`;
    try {
      const errBody = await resp.json();
      if (errBody?.error) errMsg = errBody.error;
    } catch { /* ignore parse error */ }

    if (resp.status === 503) throw new Error('AI is not configured on the server. Add GROQ_API_KEY to Vercel environment variables.');
    if (resp.status === 401) throw new Error('Authentication error. Please try signing out and back in.');
    if (resp.status === 429) throw new Error('AI is temporarily busy. Please try again in a moment.');
    if (resp.status === 404) throw new Error('/api/ai/chat endpoint not found. Ensure Vercel deployment is up to date.');
    throw new Error(errMsg);
  }

  // The Vercel function returns SSE: data: {"token":"..."}\n\n
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream from AI service.');
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
      } catch { /* skip malformed SSE chunk */ }
    }
    yield;
  }
}

// ── Groq direct (browser → Groq API) ─────────────────────────────────────────
async function* _streamGroqDirect(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<void> {
  const resp = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages.slice(-20),
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
    }),
    signal,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    if (resp.status === 401) throw new Error('Invalid AI API key. Please contact the administrator.');
    if (resp.status === 429) throw new Error('AI is temporarily busy. Please try again in a moment.');
    throw new Error(`AI service error (${resp.status}). Please try again.`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream from AI provider.');
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
      if (!t || t === 'data: [DONE]') { if (t === 'data: [DONE]') return; continue; }
      if (!t.startsWith('data: ')) continue;
      try {
        const d = JSON.parse(t.slice(6));
        const token = d?.choices?.[0]?.delta?.content ?? '';
        if (token) onToken(token);
        if (d?.choices?.[0]?.finish_reason === 'stop') return;
      } catch { /* skip malformed */ }
    }
    yield;
  }
}

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
