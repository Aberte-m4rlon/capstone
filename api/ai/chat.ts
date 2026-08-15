/**
 * Vercel Serverless Function — MyAI chat endpoint
 * POST /api/ai/chat
 *
 * Receives messages + pre-built farm context from the frontend,
 * calls Groq (server-side — key never reaches the browser),
 * and streams the response back using Server-Sent Events.
 *
 * Security:
 * - GROQ_API_KEY is a server-side environment variable only (no VITE_ prefix)
 * - Farm context is built from Supabase data the user already fetched
 *   through their own authenticated session — we do not re-query the DB here
 * - Read-only: this endpoint only reads/generates, never writes
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];   // full conversation including system prompt with farm context
  stream?: boolean;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate API key is configured
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'AI Assistant is not configured for this deployment.',
      code: 'NO_API_KEY',
    });
  }

  // Parse and validate body
  let body: ChatRequest;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const { messages, stream = true } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  // Validate message structure — prevent prompt injection via unexpected roles
  for (const msg of messages) {
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({ error: 'Invalid message role.' });
    }
    if (typeof msg.content !== 'string' || msg.content.length > 32000) {
      return res.status(400).json({ error: 'Invalid message content.' });
    }
  }

  // Hard cap: max 20 messages to prevent abuse
  const cappedMessages = messages.slice(-20);

  try {
    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
      console.error('[MyAI] Groq error:', groqResponse.status, errText);

      if (groqResponse.status === 429) {
        return res.status(429).json({
          error: 'AI Assistant is temporarily busy. Please try again in a moment.',
          code: 'RATE_LIMIT',
        });
      }
      return res.status(502).json({
        error: 'AI Assistant is temporarily unavailable. Please try again.',
        code: 'PROVIDER_ERROR',
      });
    }

    if (!stream) {
      // Non-streaming: return JSON directly
      const data = await groqResponse.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      return res.status(200).json({ content });
    }

    // Streaming: pipe Groq SSE → client SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = groqResponse.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: 'No response stream' })}\n\n`);
      return res.end();
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
        if (!trimmed || trimmed === 'data: [DONE]') {
          if (trimmed === 'data: [DONE]') {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          }
          continue;
        }
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const token = json?.choices?.[0]?.delta?.content ?? '';
          if (token) {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    return res.end();

  } catch (err) {
    console.error('[MyAI] Unexpected error:', err);
    // Do not expose internal error details to the client
    return res.status(500).json({
      error: 'AI Assistant encountered an unexpected error. Please try again.',
      code: 'INTERNAL_ERROR',
    });
  }
}
