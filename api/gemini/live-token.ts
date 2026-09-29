import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const systemInstruction =
  'You are the live goat and sheep detector for a farm camera. Inspect the incoming video frames continuously. Detect every clearly visible real goat or sheep only. Never classify people, cows, dogs, cats, horses, toys, posters, screens, or ambiguous objects as goat or sheep. If uncertain, return no detection. For every visible goat or sheep return species goat or sheep and box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000. Return JSON only: {"detections":[{"species":"goat"|"sheep","box_2d":[number,number,number,number],"visible":true}]}. Use an empty array when none are clearly visible.';

const DEFAULT_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-exp';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const isKeyConfigured = Boolean(apiKey);
  console.log(`[GeminiLive] API key configured: ${isKeyConfigured}`);

  if (!isKeyConfigured) {
    return res.status(500).json({
      error: 'Gemini API key is not configured on the server.',
      code: 'MISSING_API_KEY',
      apiKeyConfigured: false,
    });
  }

  // Diagnostic GET route: lists supported Live models without exposing secrets
  if (req.method === 'GET') {
    try {
      const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
      const modelPager = await ai.models.list();
      const liveModels: Array<{ name: string; displayName?: string; methods?: string[] }> = [];
      for await (const m of modelPager) {
        liveModels.push({
          name: m.name,
          displayName: m.displayName,
          methods: m.supportedGenerationMethods,
        });
      }
      return res.status(200).json({
        apiKeyConfigured: true,
        defaultModel: DEFAULT_LIVE_MODEL,
        liveModels,
      });
    } catch (err: any) {
      console.error('[GeminiLive] Failed to query models for diagnostic:', err?.message || err);
      return res.status(500).json({
        apiKeyConfigured: true,
        error: err?.message || 'Failed to list models',
        code: 'MODEL_LIST_FAILED',
      });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed. Use POST to request tokens or GET for diagnostics.',
      code: 'METHOD_NOT_ALLOWED',
      apiKeyConfigured: isKeyConfigured,
    });
  }

  // Prioritize requested model from client if valid, else environment, else default
  const requestedModel = req.body?.model;
  const modelName = (requestedModel && typeof requestedModel === 'string' && requestedModel.trim())
    ? requestedModel.trim()
    : (process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL);

  const startTime = Date.now();
  console.log(`[GeminiLive] token creation request started for model: ${modelName}`);

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });

    // 7-second server-side timeout to avoid serverless hanging
    const tokenPromise = ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
        liveConnectConstraints: {
          model: modelName,
          config: {
            responseModalities: ['TEXT'],
            systemInstruction,
          },
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TOKEN_TIMEOUT')), 7000);
    });

    const token = await Promise.race([tokenPromise, timeoutPromise]);
    const duration = Date.now() - startTime;
    console.log(`[GeminiLive] token creation request completed in ${duration} ms`);

    if (!token?.name) {
      return res.status(502).json({
        error: 'Live detection token was not returned by provider.',
        code: 'TOKEN_MISSING',
        apiKeyConfigured: true,
      });
    }

    return res.status(200).json({
      token: token.name,
      model: modelName,
      apiKeyConfigured: true,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMsg = error?.message || String(error);
    console.error(`[GeminiLive] Token creation failed after ${duration} ms:`, errorMsg);

    if (error?.message === 'TOKEN_TIMEOUT') {
      return res.status(504).json({
        error: 'Gemini token creation timed out on server.',
        code: 'TOKEN_TIMEOUT',
        apiKeyConfigured: true,
      });
    }

    // Classify authentication vs model vs upstream errors
    const isAuthError =
      error?.status === 401 ||
      error?.status === 403 ||
      errorMsg.includes('UNAUTHENTICATED') ||
      errorMsg.includes('PERMISSION_DENIED');

    const isModelError =
      error?.status === 404 ||
      errorMsg.includes('not found') ||
      errorMsg.includes('unsupported') ||
      errorMsg.includes('INVALID_ARGUMENT');

    const status = isAuthError ? 401 : isModelError ? 400 : 502;
    const code = isAuthError ? 'AUTH_ERROR' : isModelError ? 'MODEL_ERROR' : 'PROVIDER_ERROR';

    return res.status(status).json({
      error: errorMsg || 'Live detection is temporarily unavailable.',
      code,
      apiKeyConfigured: true,
    });
  }
}
