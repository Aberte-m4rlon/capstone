/**
 * Vercel Serverless Function — AlpasFarm AI Chat
 * POST /api/ai/chat
 *
 * Receives:  { messages: [{role, content}, ...] }
 * Returns:   text/event-stream  →  data: {"token":"..."}\n\n  …  data: {"done":true}\n\n
 *
 * Environment variables (set in Vercel Dashboard — NEVER with VITE_ prefix):
 *   GROQ_API_KEY   — required, your Groq API key
 *   GROQ_MODEL     — optional, defaults to llama-3.1-8b-instant
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as https from 'https';

const GROQ_HOST  = 'api.groq.com';
const GROQ_PATH  = '/openai/v1/chat/completions';
const PRIMARY_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';

interface Message { role: string; content: string; }

// ── Tiny HTTPS helper (no extra deps) ─────────────────────────────────────────
function httpsPost(
  hostname: string,
  path: string,
  headers: Record<string, string | number>,
  body: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(28_000, () => { req.destroy(); reject(new Error('Groq request timed out after 28s')); });
    req.write(body);
    req.end();
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.', code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  // ── Safe request ID for log correlation (no PII) ──────────────────────────
  const rid = Math.random().toString(36).slice(2, 8);
  console.log(`[AlpasFarm AI] [${rid}] POST /api/ai/chat — provider:groq primary:${PRIMARY_MODEL}`);

  // ── Environment variable check ────────────────────────────────────────────
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error(
      `[AlpasFarm AI] [${rid}] ❌ GROQ_API_KEY is not set. ` +
      'Go to Vercel Dashboard → Project → Settings → Environment Variables and add GROQ_API_KEY.',
    );
    res.status(503).json({
      error: 'AI service is not configured for production. GROQ_API_KEY is missing from Vercel environment variables.',
      code: 'NO_API_KEY',
    });
    return;
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { messages?: Message[] };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  } catch {
    res.status(400).json({ error: 'Invalid JSON request body.', code: 'INVALID_JSON' });
    return;
  }

  const { messages = [] } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty messages array.', code: 'MISSING_MESSAGES' });
    return;
  }

  console.log(`[AlpasFarm AI] [${rid}] Sending ${messages.length} message(s) to Groq`);

  // ── Call Groq with primary model and automatic fallback ───────────────────
  async function callGroqWithModel(modelName: string) {
    const payload = JSON.stringify({
      model: modelName,
      messages: messages.slice(-20),   // last 20 turns max
      stream: false,
      temperature: 0.7,
      max_tokens: 1024,
    });
    return httpsPost(
      GROQ_HOST,
      GROQ_PATH,
      {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      payload,
    );
  }

  let groqStatus: number;
  let groqText: string;

  try {
    ({ status: groqStatus, text: groqText } = await callGroqWithModel(PRIMARY_MODEL));
    if ((groqStatus === 400 || groqStatus === 404) && PRIMARY_MODEL !== FALLBACK_MODEL) {
      console.warn(`[AlpasFarm AI] [${rid}] Primary model ${PRIMARY_MODEL} returned ${groqStatus}, retrying with fallback ${FALLBACK_MODEL}...`);
      ({ status: groqStatus, text: groqText } = await callGroqWithModel(FALLBACK_MODEL));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[AlpasFarm AI] [${rid}] Network error calling Groq: ${msg}`);
    res.status(502).json({
      error: 'Could not reach the AI provider. Check your internet connection or try again.',
      code: 'NETWORK_ERROR',
    });
    return;
  }

  console.log(`[AlpasFarm AI] [${rid}] Groq HTTP status: ${groqStatus}`);

  // ── Handle Groq error codes ───────────────────────────────────────────────
  if (groqStatus === 401) {
    console.error(`[AlpasFarm AI] [${rid}] ❌ Groq rejected the API key (401). Verify GROQ_API_KEY in Vercel.`);
    res.status(502).json({
      error: 'The AI API key is invalid. Verify GROQ_API_KEY in Vercel environment variables.',
      code: 'INVALID_KEY',
    });
    return;
  }
  if (groqStatus === 429) {
    console.warn(`[AlpasFarm AI] [${rid}] ⚠️ Groq rate limit exceeded (429).`);
    res.status(429).json({
      error: 'AI is temporarily busy (rate limit). Please wait a moment and try again.',
      code: 'RATE_LIMIT',
    });
    return;
  }
  if (groqStatus === 400) {
    console.error(`[AlpasFarm AI] [${rid}] Bad request to Groq (400). Response: ${groqText.slice(0, 300)}`);
    res.status(502).json({
      error: 'The AI request was malformed. Please try again.',
      code: 'BAD_REQUEST',
    });
    return;
  }
  if (groqStatus !== 200) {
    console.error(`[AlpasFarm AI] [${rid}] Unexpected Groq status ${groqStatus}.`);
    res.status(502).json({
      error: `AI provider returned an unexpected error (${groqStatus}). Please try again.`,
      code: 'PROVIDER_ERROR',
    });
    return;
  }

  // ── Parse Groq response ───────────────────────────────────────────────────
  let parsed: { choices?: Array<{ message?: { content?: string } }> };
  try {
    parsed = JSON.parse(groqText);
  } catch {
    console.error(`[AlpasFarm AI] [${rid}] Failed to parse Groq JSON response.`);
    res.status(502).json({ error: 'Received an invalid response from the AI provider.', code: 'PARSE_ERROR' });
    return;
  }

  const content = parsed?.choices?.[0]?.message?.content ?? '';
  if (!content) {
    console.warn(`[AlpasFarm AI] [${rid}] Groq returned empty content.`);
    res.status(502).json({ error: 'AI returned an empty response. Please try again.', code: 'EMPTY_RESPONSE' });
    return;
  }

  console.log(`[AlpasFarm AI] [${rid}] ✅ Success — ${content.length} chars → streaming SSE`);

  // ── Emit as SSE in the format the frontend expects ────────────────────────
  // Frontend parser in myai.ts reads:  data: {"token":"..."}\n\n
  //                               and: data: {"done":true}\n\n
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  // Emit word-by-word to give the streaming typing effect
  const words = content.split(' ');
  for (let i = 0; i < words.length; i++) {
    const token = (i === 0 ? '' : ' ') + words[i];
    res.write(`data: ${JSON.stringify({ token })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
}
