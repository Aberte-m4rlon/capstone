/**
 * Vercel Serverless Function — AlpasFarm AI Chat
 * POST /api/ai/chat
 * Uses Node https module (no fetch dependency) for maximum compatibility.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as https from 'https';

const GROQ_HOST = 'api.groq.com';
const GROQ_PATH = '/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

interface Message { role: string; content: string; }

function httpsPost(
  host: string,
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      path,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'AI is not configured. Add GROQ_API_KEY to Vercel env vars.', code: 'NO_API_KEY' });
    return;
  }

  let body: { messages?: Message[]; stream?: boolean };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  } catch {
    res.status(400).json({ error: 'Invalid JSON.' });
    return;
  }

  const { messages = [], stream = false } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required.' });
    return;
  }

  const payload = JSON.stringify({
    model: MODEL,
    messages: messages.slice(-20),
    stream: false, // always non-streaming for reliability
    temperature: 0.7,
    max_tokens: 1024,
  });

  try {
    const { status, body: respBody } = await httpsPost(
      GROQ_HOST,
      GROQ_PATH,
      {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      payload,
    );

    if (status === 401) {
      res.status(502).json({ error: 'Invalid AI API key.', code: 'INVALID_KEY' }); return;
    }
    if (status === 429) {
      res.status(429).json({ error: 'AI is busy. Try again in a moment.', code: 'RATE_LIMIT' }); return;
    }
    if (status !== 200) {
      res.status(502).json({ error: `AI service error (${status}).`, code: 'PROVIDER_ERROR' }); return;
    }

    let parsed: { choices?: Array<{ message?: { content?: string } }> };
    try { parsed = JSON.parse(respBody); } catch {
      res.status(502).json({ error: 'Invalid response from AI provider.' }); return;
    }

    const content = parsed?.choices?.[0]?.message?.content ?? '';

    // Return in SSE format so the existing frontend streaming parser works
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    // Send content word by word to simulate streaming
    const words = content.split(' ');
    for (let i = 0; i < words.length; i++) {
      const token = (i === 0 ? '' : ' ') + words[i];
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AlpasFarm AI] Error:', msg);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI service encountered an error. Please try again.', code: 'INTERNAL_ERROR' });
    }
  }
}
