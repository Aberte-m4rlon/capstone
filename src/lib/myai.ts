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

// Local Ollama config (used only when AI_MODE === 'local')
const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen2.5:1.5b';

// Production endpoint (Vercel serverless function)
const PRODUCTION_ENDPOINT = '/api/ai/chat';

// Displayed model label
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
  if (AI_MODE === 'production') {
    // In production mode, do a lightweight health-check
    try {
      const r = await fetch(PRODUCTION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }], stream: false }),
        signal: AbortSignal.timeout(8000),
      });
      // 503 means key not configured; 200/other means endpoint is reachable
      if (r.status === 503) {
        const data = await r.json().catch(() => ({}));
        if (data?.code === 'NO_API_KEY') return 'unavailable';
      }
      return 'production';
    } catch {
      return 'unavailable';
    }
  }

  // Local Ollama check
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return 'offline';
    const data = await r.json();
    const models: string[] = (data.models || []).map((m: { name: string }) => m.name);
    const hasModel = models.some((m) => m.includes(OLLAMA_MODEL.split(':')[0]));
    return hasModel ? 'online' : 'no_model';
  } catch {
    return 'offline';
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
- Keep responses concise and practical. Use bullet points for lists.`;

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

  return lines.join('\n');
}

// ── Stream chat — routes to Ollama (local) or /api/ai/chat (production) ───────
export async function* streamChat(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<void> {
  if (AI_MODE === 'local') {
    yield* _streamOllama(messages, onToken, signal);
  } else {
    yield* _streamProduction(messages, onToken, signal);
  }
}

// ── Local: direct Ollama streaming ───────────────────────────────────────────
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

// ── Production: /api/ai/chat SSE streaming ────────────────────────────────────
async function* _streamProduction(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): AsyncGenerator<void> {
  const resp = await fetch(PRODUCTION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream: true }),
    signal,
  });

  if (!resp.ok) {
    let errorMsg = 'AI Assistant is temporarily unavailable. Please try again.';
    try {
      const data = await resp.json();
      if (data?.error) errorMsg = data.error;
    } catch { /* use default */ }
    throw new Error(errorMsg);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream from AI service');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(trimmed.slice(6));
        if (data?.token) onToken(data.token);
        if (data?.done) return;
        if (data?.error) throw new Error(data.error);
      } catch (e: any) {
        // Re-throw only real errors, not JSON parse failures on empty lines
        if (e?.message && !e.message.includes('JSON')) throw e;
      }
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
