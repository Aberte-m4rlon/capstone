/**
 * Vercel Serverless Function — AlpasFarm AI Chat
 * POST /api/ai/chat
 *
 * Routes messages to Groq API server-side.
 * GROQ_API_KEY is server-only — never sent to the browser.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  stream?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'AI Assistant is not configured for this deployment. Please add GROQ_API_KEY to Vercel environment variables.',
      code: 'NO_API_KEY',
    });
    return;
  }

  // Parse body — Vercel may give us parsed JSON or raw string
  let body: ChatRequest;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ChatRequest;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }

  const { messages, stream = true } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required.' });
    return;
  }

  // Validate and sanitize messages
  for (const msg of messages) {
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      res.status(400).json({ error: 'Invalid message role.' });
      return;
    }
    if (typeof msg.content !== 'string' || msg.content.length > 32000) {
      res.status(400).json({ error: 'Invalid message content.' });
      return;
    }
  }

  const cappedMessages = messages.slice(-20);

  try {
    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: cappedMessages,
        stream,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text().catch(() => '');
      console.error(`[AlpasFarm AI] Groq error ${groqResponse.status}:`, errText.slice(0, 200));

      if (groqResponse.status === 401) {
        res.status(502).json({ error: 'Invalid AI API key. Contact the farm administrator.', code: 'INVALID_KEY' });
        return;
      }
      if (groqResponse.status === 429) {
        res.status(429).json({ error: 'AI is temporarily busy. Please try again in a moment.', code: 'RATE_LIMIT' });
        return;
      }
      res.status(502).json({ error: `AI service error (${groqResponse.status}). Please try again.`, code: 'PROVIDER_ERROR' });
      return;
    }

    if (!stream) {
      const data = await groqResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data?.choices?.[0]?.message?.content ?? '';
      res.status(200).json({ content });
      return;
    }

    // Streaming SSE response
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = groqResponse.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: 'No response stream from AI provider' })}\n\n`);
      res.end();
      return;
    }

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
        if (!trimmed) continue;
        if (trimmed === 'data: [DONE]') {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          continue;
        }
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const parsed = JSON.parse(trimmed.slice(6)) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const token = parsed?.choices?.[0]?.delta?.content;
          if (token) {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[AlpasFarm AI] Unexpected error:', msg);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI encountered an unexpected error. Please try again.', code: 'INTERNAL_ERROR' });
    }
  }
}
