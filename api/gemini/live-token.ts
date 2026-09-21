import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const systemInstruction = 'You are the live goat and sheep detector for a farm camera. Inspect the incoming video frames continuously. Detect every clearly visible real goat or sheep only. Never classify people, cows, dogs, cats, horses, toys, posters, screens, or ambiguous objects as goat or sheep. If uncertain, return no detection. For every visible goat or sheep return species goat or sheep and box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000. Return JSON only: {\"detections\":[{\"species\":\"goat\"|\"sheep\",\"box_2d\":[number,number,number,number],\"visible\":true}]}. Use an empty array when none are clearly visible.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Live detection is temporarily unavailable.' });
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
    const token = await ai.authTokens.create({ config: { uses: 1, newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(), expireTime: new Date(Date.now() + 30 * 60_000).toISOString(), liveConnectConstraints: { model: process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-live-001', config: { responseModalities: ['TEXT'], systemInstruction } } } });
    if (!token.name) return res.status(502).json({ error: 'Live detection token was not created.' });
    return res.status(200).json({ token: token.name, model: process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-live-001' });
  } catch (error: any) {
    console.error('[live-token] Token creation error:', error?.message || error);
    return res.status(502).json({ error: 'Live detection is temporarily unavailable.' });
  }
}
