/**
 * Vercel Serverless Function — AlpasFarm Gemini AI Animal Scanner (Legacy Forwarder)
 * POST /api/ai/animal-scan -> delegates to /api/gemini/animal-scan
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import geminiHandler from '../gemini/animal-scan';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return geminiHandler(req, res);
}
