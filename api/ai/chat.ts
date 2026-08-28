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

const GROQ_HOST = 'api.groq.com';
const GROQ_CHAT_PATH = '/openai/v1/chat/completions';
const GROQ_MODELS_PATH = '/openai/v1/models';

const DEFAULT_CANDIDATE_MODELS = [
  process.env.GROQ_MODEL,
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'qwen/qwen3.6-27b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'groq/compound',
].filter(Boolean) as string[];

interface Message { role: string; content: string; }

// ── Tiny HTTPS helpers ────────────────────────────────────────────────────────
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

function httpsGet(
  hostname: string,
  path: string,
  headers: Record<string, string | number>,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Groq models lookup timed out')); });
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

  const rid = Math.random().toString(36).slice(2, 8);
  console.log(`[AlpasFarm AI] [${rid}] POST /api/ai/chat`);

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

  // ── Parse body & clean messages ───────────────────────────────────────────
  let body: { messages?: Message[] };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  } catch {
    res.status(400).json({ error: 'Invalid JSON request body.', code: 'INVALID_JSON' });
    return;
  }

  const rawMessages = body.messages ?? [];
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty messages array.', code: 'MISSING_MESSAGES' });
    return;
  }

  // Clean and sanitize messages
  const cleanMessages = rawMessages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
    .filter((m) => !m.content.trim().startsWith('⚠️')) // exclude UI error banners from history
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content.trim(),
    }))
    .slice(-16);

  if (cleanMessages.length === 0) {
    res.status(400).json({ error: 'No valid user messages found in request.', code: 'INVALID_MESSAGES' });
    return;
  }

  console.log(`[AlpasFarm AI] [${rid}] Sending ${cleanMessages.length} sanitized message(s) to Groq`);

  // ── Helper to execute chat completion ─────────────────────────────────────
  async function executeGroqChat(modelName: string) {
    const payload = JSON.stringify({
      model: modelName,
      messages: cleanMessages,
      stream: false,
      temperature: 0.7,
      max_tokens: 1024,
    });
    return httpsPost(
      GROQ_HOST,
      GROQ_CHAT_PATH,
      {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      payload,
    );
  }

  // ── Multi-model cascade execution ─────────────────────────────────────────
  let selectedModel = DEFAULT_CANDIDATE_MODELS[0];
  let groqStatus = 0;
  let groqText = '';

  for (const candidate of DEFAULT_CANDIDATE_MODELS) {
    selectedModel = candidate;
    try {
      console.log(`[AlpasFarm AI] [${rid}] Attempting model: ${candidate}`);
      ({ status: groqStatus, text: groqText } = await executeGroqChat(candidate));

      if (groqStatus === 200) {
        console.log(`[AlpasFarm AI] [${rid}] ✅ Model ${candidate} succeeded with HTTP 200`);
        break;
      }

      if (groqStatus === 401) {
        // Invalid API key — don't bother retrying models
        console.error(`[AlpasFarm AI] [${rid}] ❌ Groq rejected the API key (401).`);
        res.status(502).json({
          error: 'The AI API key is invalid. Verify GROQ_API_KEY in Vercel environment variables.',
          code: 'INVALID_KEY',
        });
        return;
      }

      console.warn(`[AlpasFarm AI] [${rid}] Model ${candidate} returned HTTP ${groqStatus}, checking next fallback...`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AlpasFarm AI] [${rid}] Network error on ${candidate}: ${msg}`);
    }
  }

  // If all default candidates failed with 404/400, dynamically discover active models from Groq
  if (groqStatus !== 200 && (groqStatus === 404 || groqStatus === 400 || groqStatus === 0)) {
    try {
      console.log(`[AlpasFarm AI] [${rid}] Querying /openai/v1/models for dynamically available models on Groq...`);
      const modelsResp = await httpsGet(
        GROQ_HOST,
        GROQ_MODELS_PATH,
        { 'Authorization': `Bearer ${apiKey}` },
      );

      if (modelsResp.status === 200) {
        const parsedModels = JSON.parse(modelsResp.text);
        const activeChatModels: string[] = (parsedModels?.data ?? [])
          .map((m: any) => m.id)
          .filter((id: string) => !id.includes('whisper') && !id.includes('guard') && !id.includes('tts') && !id.includes('embed'));

        console.log(`[AlpasFarm AI] [${rid}] Discovered active models:`, activeChatModels.slice(0, 5));

        for (const activeModel of activeChatModels) {
          selectedModel = activeModel;
          ({ status: groqStatus, text: groqText } = await executeGroqChat(activeModel));
          if (groqStatus === 200) {
            console.log(`[AlpasFarm AI] [${rid}] ✅ Dynamic model ${activeModel} succeeded!`);
            break;
          }
        }
      }
    } catch (err: unknown) {
      console.warn(`[AlpasFarm AI] [${rid}] Dynamic model discovery error:`, err);
    }
  }

  // ── Handle error codes if still not 200 ────────────────────────────────────
  if (groqStatus === 429) {
    console.warn(`[AlpasFarm AI] [${rid}] ⚠️ Groq rate limit exceeded (429).`);
    res.status(429).json({
      error: 'AI is temporarily busy (rate limit). Please wait a moment and try again.',
      code: 'RATE_LIMIT',
    });
    return;
  }

  if (groqStatus !== 200) {
    console.error(`[AlpasFarm AI] [${rid}] All models failed. Last status: ${groqStatus}. Response: ${groqText.slice(0, 300)}`);
    res.status(502).json({
      error: `AI provider error (${groqStatus || 'timeout'}). Please try again.`,
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

  console.log(`[AlpasFarm AI] [${rid}] ✅ Success with [${selectedModel}] — ${content.length} chars → streaming SSE`);

  // ── Emit as SSE in the format the frontend expects ────────────────────────
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const words = content.split(' ');
  for (let i = 0; i < words.length; i++) {
    const token = (i === 0 ? '' : ' ') + words[i];
    res.write(`data: ${JSON.stringify({ token })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
}

