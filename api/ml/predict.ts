/**
 * Vercel Serverless Function — AlpasFarm ML Inference Proxy
 * POST /api/ml/predict
 *
 * Receives:  multipart/form-data (image, etc.) + Authorization header (Supabase JWT)
 * Proxies to: Dedicated ML Inference Server with secret X-API-Key
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

// Supabase details for auth verification
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// ML Server Configuration
const ML_SERVER_URL = process.env.ML_SERVER_URL || 'http://localhost:8000';
const ML_SERVER_API_KEY = process.env.ML_SERVER_API_KEY || 'alpasfarm_ml_secret_key_2026';

// Disable default body parser so we can pipe raw multipart/form-data directly
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  // 1. Verify Authentication Token via Supabase
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Access denied. Missing or invalid authorization token.' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'Server configuration error: Supabase parameters are missing.' });
    return;
  }

  const supabaseToken = authHeader.substring(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(supabaseToken);
  if (authError || !user) {
    res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    return;
  }

  // 2. Parse target ML Server URL
  let targetUrl: URL;
  try {
    targetUrl = new URL(ML_SERVER_URL);
  } catch (err) {
    res.status(500).json({ error: 'Invalid ML_SERVER_URL configured.' });
    return;
  }

  const isHttps = targetUrl.protocol === 'https:';
  const requestModule = isHttps ? https : http;

  const targetPath = '/api/v1/predict';
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetPath,
    method: 'POST',
    headers: {
      'X-API-Key': ML_SERVER_API_KEY,
      'Content-Type': req.headers['content-type'] || 'multipart/form-data',
    },
    timeout: 30000,
  };

  // 3. Pipe request body to ML Server
  const proxyReq = requestModule.request(options, (proxyRes) => {
    // Collect response
    let rawData = '';
    proxyRes.on('data', (chunk) => {
      rawData += chunk;
    });

    proxyRes.on('end', () => {
      res.status(proxyRes.statusCode || 200);
      res.setHeader('Content-Type', 'application/json');
      try {
        const json = JSON.parse(rawData);
        res.json(json);
      } catch {
        res.send(rawData);
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[ML Proxy Error]:', err);
    res.status(502).json({
      error: 'Failed to contact the ML Inference Server. Please verify the server is running.',
    });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.status(504).json({ error: 'Request timed out waiting for the ML Inference Server.' });
  });

  // Pipe the incoming request stream (multipart image file) directly to the target request
  req.pipe(proxyReq);
}
