import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const systemInstruction =
  'You are the live goat and sheep detector for a farm camera. Inspect the incoming video frames continuously. Detect every clearly visible real goat or sheep only. Never classify people, cows, dogs, cats, horses, toys, posters, screens, or ambiguous objects as goat or sheep. If uncertain, return no detection. For every visible goat or sheep return species goat or sheep and box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000. Return JSON only: {"detections":[{"species":"goat"|"sheep","box_2d":[number,number,number,number],"visible":true}]}. Use an empty array when none are clearly visible.';

const DEFAULT_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-preview';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const isKeyConfigured = Boolean(apiKey);
  console.log(`[GeminiLive] GEMINI_API_KEY configured: ${isKeyConfigured}`);

  if (!isKeyConfigured) {
    return res.status(500).json({
      error: 'Gemini API key is not configured on the server.',
    });
  }

  const modelName = process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  const startTime = Date.now();
  console.log('[GeminiLive] token creation request started');

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });

    // 7-second server-side timeout to avoid serverless hang
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
      return res.status(502).json({ error: 'Live detection token was not returned by provider.' });
    }

    return res.status(200).json({ token: token.name, model: modelName });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[GeminiLive] Token creation failed after ${duration} ms:`, error?.message || error);

    if (error?.message === 'TOKEN_TIMEOUT') {
      return res.status(504).json({
        error: 'Gemini token creation timed out on server.',
      });
    }

    return res.status(502).json({
      error: error?.message || 'Live detection is temporarily unavailable.',
    });
  }
}
