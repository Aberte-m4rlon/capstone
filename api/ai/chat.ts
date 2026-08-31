/**
 * Vercel Serverless Function — AlpasFarm AI Chat
 * POST /api/ai/chat
 *
 * Receives:  { messages: [{role, content, image?}, ...] }
 * Returns:   text/event-stream  →  data: {"token":"..."}\n\n  …  data: {"done":true}\n\n
 *
 * Environment variables (set in Vercel Dashboard — NEVER with VITE_ prefix):
 *   GROQ_API_KEY   — required, your Groq API key
 *   GROQ_MODEL     — optional, defaults to llama-3.1-8b-instant / llama-3.2-11b-vision-preview
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as https from 'https';

const GROQ_HOST = 'api.groq.com';
const GROQ_CHAT_PATH = '/openai/v1/chat/completions';
const GROQ_MODELS_PATH = '/openai/v1/models';

const DEFAULT_VISION_MODELS = [
  'llama-3.2-11b-vision-preview',
  'llama-3.2-90b-vision-preview',
];

const DEFAULT_TEXT_MODELS = [
  process.env.GROQ_MODEL,
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'groq/compound',
].filter(Boolean) as string[];

interface Message {
  role: string;
  content?: string | any[];
  image?: string;
}

function ensureDataUrl(input: string): string {
  if (!input) return '';
  if (input.startsWith('data:image/')) return input;
  return `data:image/jpeg;base64,${input}`;
}

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
      `[AlpasFarm AI] [${rid}] [ERROR] GROQ_API_KEY is not set. ` +
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
    .filter((m) => m && ((typeof m.content === 'string' && m.content.trim().length > 0) || m.image || Array.isArray(m.content)))
    .filter((m) => !(typeof m.content === 'string' && m.content.trim().startsWith('[WARN]')))
    .map((m) => {
      const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user';
      let contentStr = '';
      if (typeof m.content === 'string') {
        contentStr = m.content.trim();
      } else if (Array.isArray(m.content)) {
        const textItem = m.content.find((c: any) => c.type === 'text');
        contentStr = textItem?.text || '';
      }
      return {
        role,
        content: contentStr,
        image: typeof m.image === 'string' && m.image.length > 20 ? m.image : undefined,
      };
    })
    .slice(-16);

  if (cleanMessages.length === 0) {
    res.status(400).json({ error: 'No valid user messages found in request.', code: 'INVALID_MESSAGES' });
    return;
  }

  const hasImage = cleanMessages.some((m) => !!m.image);
  console.log(`[AlpasFarm AI] [${rid}] Sending ${cleanMessages.length} sanitized message(s) to Groq (hasImage: ${hasImage})`);

  // ── Message formatting for Vision vs Text models ──────────────────────────
  function buildVisionMessages() {
    return cleanMessages.map((m) => {
      if (m.image) {
        return {
          role: m.role,
          content: [
            {
              type: 'text',
              text: m.content || 'Please analyze this livestock image (goat/sheep) for health, breed characteristics, symptoms, and condition.',
            },
            {
              type: 'image_url',
              image_url: { url: ensureDataUrl(m.image) },
            },
          ],
        };
      }
      return {
        role: m.role,
        content: m.content || 'Hello',
      };
    });
  }

  function buildTextMessages() {
    return cleanMessages.map((m) => {
      if (m.image) {
        return {
          role: m.role,
          content: `${m.content || 'Please analyze this livestock image.'}\n\n[User attached an image of a goat/sheep for veterinary visual assessment. Provide comprehensive guidance, common visual symptoms to check, and clinical first-aid recommendations.]`,
        };
      }
      return {
        role: m.role,
        content: m.content || 'Hello',
      };
    });
  }

  // ── Helper to execute chat completion ─────────────────────────────────────
  async function executeGroqChat(modelName: string, isVision: boolean) {
    const formattedMsgs = isVision ? buildVisionMessages() : buildTextMessages();
    const payload = JSON.stringify({
      model: modelName,
      messages: formattedMsgs,
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

  // ── Candidate Model Selection ─────────────────────────────────────────────
  let candidateQueue: Array<{ name: string; isVision: boolean }> = [];

  if (hasImage) {
    for (const vModel of DEFAULT_VISION_MODELS) {
      candidateQueue.push({ name: vModel, isVision: true });
    }
  }

  for (const tModel of DEFAULT_TEXT_MODELS) {
    candidateQueue.push({ name: tModel, isVision: false });
  }

  let selectedModel = candidateQueue[0]?.name || 'llama-3.1-8b-instant';
  let groqStatus = 0;
  let groqText = '';

  for (const candidate of candidateQueue) {
    selectedModel = candidate.name;
    try {
      console.log(`[AlpasFarm AI] [${rid}] Attempting model: ${candidate.name} (vision: ${candidate.isVision})`);
      ({ status: groqStatus, text: groqText } = await executeGroqChat(candidate.name, candidate.isVision));

      if (groqStatus === 200) {
        console.log(`[AlpasFarm AI] [${rid}] [OK] Model ${candidate.name} succeeded with HTTP 200`);
        break;
      }

      if (groqStatus === 401) {
        console.error(`[AlpasFarm AI] [${rid}] [ERROR] Groq rejected the API key (401).`);
        res.status(502).json({
          error: 'The AI API key is invalid. Verify GROQ_API_KEY in Vercel environment variables.',
          code: 'INVALID_KEY',
        });
        return;
      }

      console.warn(`[AlpasFarm AI] [${rid}] Model ${candidate.name} returned HTTP ${groqStatus}, checking next fallback...`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AlpasFarm AI] [${rid}] Network error on ${candidate.name}: ${msg}`);
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
          const isVision = activeModel.includes('vision');
          ({ status: groqStatus, text: groqText } = await executeGroqChat(activeModel, isVision));
          if (groqStatus === 200) {
            console.log(`[AlpasFarm AI] [${rid}] [OK] Dynamic model ${activeModel} succeeded!`);
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
    console.warn(`[AlpasFarm AI] [${rid}] [WARN] Groq rate limit exceeded (429).`);
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

  console.log(`[AlpasFarm AI] [${rid}] [OK] Success with [${selectedModel}] — ${content.length} chars → streaming SSE`);

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
