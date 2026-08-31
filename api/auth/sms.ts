/**
 * Vercel Serverless Function — AlpasFarm Real SMS Authentication
 * POST /api/auth/sms
 *
 * Actions:
 *   1. action: 'send'   → generates 6-digit OTP and sends REAL SMS via Semaphore (Primary PH Gateway) or Twilio (Secondary)
 *   2. action: 'verify' → validates OTP token, creates/authenticates user, returns profile & session info
 *
 * Primary SMS Gateway (Philippines Free Tier & High Delivery):
 *   - SEMAPHORE_API_KEY (from https://semaphore.co)
 *   - SEMAPHORE_SENDER_NAME (optional)
 *
 * Secondary / International Gateway:
 *   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as https from 'https';

// ── In-Memory OTP store with TTL for serverless instances / direct verification ──
interface StoredOtp {
  code: string;
  expiresAt: number;
  attempts: number;
  fullName?: string;
  farmName?: string;
  farmLocation?: string;
}

// In-memory cache fallback (persists during active instance life)
const otpCache = new Map<string, StoredOtp>();

// ── Phone Number Normalization ──────────────────────────────────────────────
export function normalizePhoneNumber(rawPhone: string): { e164: string; national: string; valid: boolean } {
  let cleaned = rawPhone.replace(/[^0-9+]/g, '');

  // Philippine format handlers
  if (cleaned.startsWith('09') && cleaned.length === 11) {
    const national = cleaned;
    const e164 = '+63' + cleaned.slice(1);
    return { e164, national, valid: true };
  }
  if (cleaned.startsWith('639') && cleaned.length === 12) {
    const national = '0' + cleaned.slice(2);
    const e164 = '+' + cleaned;
    return { e164, national, valid: true };
  }
  if (cleaned.startsWith('+639') && cleaned.length === 13) {
    const national = '0' + cleaned.slice(3);
    const e164 = cleaned;
    return { e164, national, valid: true };
  }
  if (cleaned.startsWith('9') && cleaned.length === 10) {
    const national = '0' + cleaned;
    const e164 = '+63' + cleaned;
    return { e164, national, valid: true };
  }

  // Generic International format
  if (cleaned.startsWith('+') && cleaned.length >= 10 && cleaned.length <= 16) {
    return { e164: cleaned, national: cleaned.slice(1), valid: true };
  }

  return { e164: cleaned, national: cleaned, valid: false };
}

// ── HTTP Request Helper ──────────────────────────────────────────────────────
function postRequest(
  urlStr: string,
  headers: Record<string, string | number>,
  body: string,
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, data }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(12_000, () => { req.destroy(); reject(new Error('SMS Gateway request timed out')); });
    req.write(body);
    req.end();
  });
}

// ── SMS Dispatcher: Semaphore (Primary Philippine Gateway) ───────────────────
async function sendViaSemaphore(
  apiKey: string,
  number: string,
  message: string,
  senderName?: string,
): Promise<{ success: boolean; detail?: string }> {
  const cleanNumber = number.replace(/[^0-9]/g, '');
  const phNumber = cleanNumber.startsWith('63') ? '0' + cleanNumber.slice(2) : cleanNumber;

  const payloadObj: Record<string, string> = {
    apikey: apiKey.trim(),
    number: phNumber,
    message: message,
  };

  if (senderName && senderName.trim()) {
    payloadObj.sendername = senderName.trim();
  }

  const payload = JSON.stringify(payloadObj);

  try {
    const res = await postRequest('https://api.semaphore.co/api/v4/messages', {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    }, payload);

    let parsed: any = null;
    try {
      parsed = JSON.parse(res.data);
    } catch {
      parsed = null;
    }

    if (res.status >= 200 && res.status < 300) {
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        if (first.status && String(first.status).toLowerCase() === 'failed') {
          return { success: false, detail: `Semaphore failed: ${first.message_id || 'Failed delivery'}` };
        }
      }
      return { success: true, detail: res.data };
    }

    const errDetail = (parsed && (parsed.message || parsed.error)) ? (parsed.message || parsed.error) : res.data;
    return { success: false, detail: `Semaphore error HTTP ${res.status}: ${errDetail}` };
  } catch (err: any) {
    return { success: false, detail: err?.message || 'Semaphore network failure' };
  }
}

// ── SMS Dispatcher: Twilio (Secondary / International) ───────────────────────
async function sendViaTwilio(
  accountSid: string,
  authToken: string,
  fromOrServiceSid: string,
  toNumber: string,
  message: string,
): Promise<{ success: boolean; detail?: string; sid?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const params = new URLSearchParams();
  params.append('To', toNumber);
  params.append('Body', message);

  if (fromOrServiceSid.startsWith('MG')) {
    params.append('MessagingServiceSid', fromOrServiceSid);
  } else {
    params.append('From', fromOrServiceSid);
  }

  const postData = params.toString();
  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const res = await postRequest(url, {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    }, postData);

    let parsed: any = {};
    try {
      parsed = JSON.parse(res.data);
    } catch {
      parsed = {};
    }

    if (res.status >= 200 && res.status < 300 && parsed.sid) {
      return { success: true, detail: `Twilio message SID: ${parsed.sid}`, sid: parsed.sid };
    }

    const errMessage = parsed.message || parsed.error_message || `HTTP ${res.status}: ${res.data}`;
    return { success: false, detail: `Twilio error: ${errMessage}` };
  } catch (err: any) {
    return { success: false, detail: err?.message || 'Twilio network failure' };
  }
}

// ── Main Serverless Handler ──────────────────────────────────────────────────
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

  let body: any;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  } catch {
    res.status(400).json({ error: 'Invalid JSON request body.', code: 'INVALID_JSON' });
    return;
  }

  const { action, phone, code, fullName, farmName, farmLocation } = body;

  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ error: 'Phone number is required.', code: 'MISSING_PHONE' });
    return;
  }

  const normalized = normalizePhoneNumber(phone);
  if (!normalized.valid) {
    res.status(400).json({
      error: 'Please enter a valid mobile number (e.g., 09171234567 or +639171234567).',
      code: 'INVALID_PHONE_FORMAT',
    });
    return;
  }

  const phoneKey = normalized.e164;

  // ════════════════════════════════════════════════════════════════════════════
  // 1. ACTION: SEND REAL SMS OTP
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'send') {
    // Generate secure 6-digit numeric OTP code
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store in cache for verification
    otpCache.set(phoneKey, {
      code: generatedOtp,
      expiresAt,
      attempts: 0,
      fullName: typeof fullName === 'string' ? fullName.trim() : undefined,
      farmName: typeof farmName === 'string' ? farmName.trim() : undefined,
      farmLocation: typeof farmLocation === 'string' ? farmLocation.trim() : undefined,
    });

    const smsMessage = `Your AlpasFarm authentication code is: ${generatedOtp}. Valid for 10 minutes. Do not share this code.`;

    let smsSent = false;
    let providerUsed = 'none';
    let providerError = '';

    // 1. Primary Gateway: Semaphore (Philippine Carrier Native)
    const semaphoreKey = process.env.SEMAPHORE_API_KEY || process.env.VITE_SEMAPHORE_API_KEY;
    const semaphoreSender = process.env.SEMAPHORE_SENDER_NAME || process.env.VITE_SEMAPHORE_SENDER_NAME;

    if (semaphoreKey) {
      const semResult = await sendViaSemaphore(semaphoreKey, normalized.national, smsMessage, semaphoreSender);
      if (semResult.success) {
        smsSent = true;
        providerUsed = 'semaphore';
      } else {
        providerError = semResult.detail || 'Semaphore send failed';
        console.error('[AlpasFarm SMS] Semaphore dispatch failure:', semResult.detail);
      }
    }

    // 2. Secondary / International Gateway: Twilio
    if (!smsSent) {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID || process.env.VITE_TWILIO_ACCOUNT_SID;
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN || process.env.VITE_TWILIO_AUTH_TOKEN;
      const twilioFrom =
        process.env.TWILIO_PHONE_NUMBER ||
        process.env.TWILIO_FROM_NUMBER ||
        process.env.TWILIO_MESSAGING_SERVICE_SID ||
        process.env.VITE_TWILIO_PHONE_NUMBER;

      if (twilioSid && twilioAuth && twilioFrom) {
        const twilioResult = await sendViaTwilio(twilioSid, twilioAuth, twilioFrom, normalized.e164, smsMessage);
        if (twilioResult.success) {
          smsSent = true;
          providerUsed = 'twilio';
        } else {
          if (!providerError) providerError = twilioResult.detail || 'Twilio send failed';
          console.error('[AlpasFarm SMS] Twilio dispatch failure:', twilioResult.detail);
        }
      }
    }

    // If no SMS provider was configured or dispatch failed
    if (!smsSent) {
      const hasAnyConfig = semaphoreKey || (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
      const errorMsg = !hasAnyConfig
        ? 'SMS Gateway is not configured. Please add SEMAPHORE_API_KEY in Vercel Environment Variables (get your free API key at https://semaphore.co).'
        : `Failed to dispatch SMS: ${providerError || 'Unknown SMS error'}`;

      res.status(502).json({
        success: false,
        error: errorMsg,
        code: 'SMS_SEND_FAILED',
      });
      return;
    }

    // Real SMS dispatched successfully. Never leak/expose the OTP in the JSON response!
    res.status(200).json({
      success: true,
      message: `A 6-digit verification code has been sent via SMS to ${normalized.e164}.`,
      phone: normalized.e164,
      expiresInSeconds: 600,
      provider: providerUsed,
      smsDelivered: true,
    });
    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. ACTION: VERIFY SMS OTP
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'verify') {
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Please enter the 6-digit verification code.', code: 'MISSING_CODE' });
      return;
    }

    const trimmedCode = code.trim();
    const stored = otpCache.get(phoneKey);

    if (!stored) {
      res.status(400).json({
        error: 'No active verification code found for this phone number. Please click "Resend SMS".',
        code: 'CODE_EXPIRED_OR_NOT_FOUND',
      });
      return;
    }

    if (Date.now() > stored.expiresAt) {
      otpCache.delete(phoneKey);
      res.status(400).json({
        error: 'This verification code has expired. Please request a new code.',
        code: 'CODE_EXPIRED',
      });
      return;
    }

    if (stored.attempts >= 5) {
      otpCache.delete(phoneKey);
      res.status(429).json({
        error: 'Too many incorrect attempts. Please request a new verification code.',
        code: 'TOO_MANY_ATTEMPTS',
      });
      return;
    }

    if (stored.code !== trimmedCode) {
      stored.attempts += 1;
      res.status(400).json({
        error: 'Incorrect verification code. Please check your SMS messages and try again.',
        code: 'INVALID_CODE',
        attemptsRemaining: 5 - stored.attempts,
      });
      return;
    }

    // Code is valid! Consume it
    otpCache.delete(phoneKey);

    // Return verification success with user payload
    res.status(200).json({
      success: true,
      phone: normalized.e164,
      user: {
        phone: normalized.e164,
        fullName: stored.fullName || fullName || 'Farm Manager',
        farmName: stored.farmName || farmName || 'My Farm',
        farmLocation: stored.farmLocation || farmLocation || '',
        role: 'farm_manager',
      },
      message: 'Phone number verified successfully.',
    });
    return;
  }

  res.status(400).json({ error: 'Invalid action. Supported actions: send, verify.', code: 'INVALID_ACTION' });
}
