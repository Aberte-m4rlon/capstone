import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

const schema = { type: Type.OBJECT, properties: { observed: { type: Type.BOOLEAN }, summary: { type: Type.STRING }, movements: { type: Type.ARRAY, items: { type: Type.STRING } }, concerns: { type: Type.ARRAY, items: { type: Type.STRING } }, recommendation: { type: Type.STRING } }, required: ['observed', 'summary', 'movements', 'concerns', 'recommendation'] };
const prompt = 'You analyze a short goat or sheep observation video. Report only visible behavior: movement, walking, standing, lying, posture, head movement, feeding, or visible inactivity. Do not diagnose disease, temperature, or internal conditions. Use Napansing kilos rather than claiming illness. If the animal is not clearly visible, say the view is insufficient. Return JSON only.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Video analysis is temporarily unavailable.' });
  const video = req.body?.video;
  if (typeof video !== 'string') return res.status(400).json({ error: 'Video data is required.' });
  const match = video.match(/^data:(video\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mimeType = match?.[1] || 'video/webm';
  const data = match?.[2] || video;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-flash-latest', contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }], config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 } });
    const parsed = JSON.parse(response.text || '{}');
    return res.status(200).json({ observed: parsed.observed === true, summary: typeof parsed.summary === 'string' ? parsed.summary : 'Hindi sapat ang view ng kilos.', movements: Array.isArray(parsed.movements) ? parsed.movements.filter((x: unknown): x is string => typeof x === 'string') : [], concerns: Array.isArray(parsed.concerns) ? parsed.concerns.filter((x: unknown): x is string => typeof x === 'string') : [], recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : 'Ipagpatuloy ang pagmamasid.' });
  } catch (error: any) {
    console.error('[animal-video-analysis] Gemini error:', error?.message || error);
    return res.status(502).json({ error: 'Video analysis is temporarily unavailable.' });
  }
}
