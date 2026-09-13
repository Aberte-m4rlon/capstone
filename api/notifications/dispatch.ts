import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseServer } from '../lib/supabaseServer';
import {
  dispatchSms,
  dispatchEmail,
  buildEmailTemplate,
  normalizePhoneNumber,
} from '../lib/sender';

interface DispatchRequestBody {
  userId: string;
  type: string;
  title: string;
  message: string;
  description?: string;
  priority?: string;
  severity?: 'critical' | 'warning' | 'normal' | 'info';
  link?: string;
  actionUrl?: string;
  animalId?: string;
  relatedType?: string;
  relatedId?: string;
  eventKey?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  channels?: {
    inApp?: boolean;
    sms?: boolean;
    email?: boolean;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
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

  const body = req.body as DispatchRequestBody;
  if (!body || !body.userId || !body.title || (!body.message && !body.description)) {
    res.status(400).json({
      error: 'Missing required parameters (userId, title, message are required).',
    });
    return;
  }

  const {
    userId,
    type = 'System',
    title,
    message = body.description || '',
    priority = 'Normal',
    link = body.actionUrl || null,
    animalId = null,
    relatedType = null,
    relatedId = null,
    eventKey = null,
    recipientPhone,
    recipientEmail,
    channels,
  } = body;

  const normalizedSeverity: 'critical' | 'warning' | 'normal' | 'info' =
    body.severity ||
    (priority.toLowerCase() === 'critical'
      ? 'critical'
      : priority.toLowerCase() === 'warning' || priority.toLowerCase() === 'high'
      ? 'warning'
      : 'normal');

  const supabase = getSupabaseServer();
  const deliveries: Array<{
    channel: string;
    recipient: string;
    status: 'sent' | 'delivered' | 'failed' | 'skipped';
    providerMessageId?: string;
    error?: string;
  }> = [];

  // ── 1. Idempotency / Duplicate Check via eventKey ─────────────────────────
  if (eventKey && supabase) {
    try {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id, user_id, title, message, description, created_at')
        .eq('user_id', userId)
        .eq('event_key', eventKey)
        .maybeSingle();

      if (existing) {
        // Already recorded and dispatched, prevent spamming
        res.status(200).json({
          success: true,
          duplicate: true,
          message: 'Notification with this eventKey was already recorded and dispatched.',
          notification: existing,
          deliveries: [],
        });
        return;
      }
    } catch (checkErr) {
      console.warn('[dispatch] Idempotency check error:', checkErr);
    }
  }

  // ── 2. Determine User Contact Information ─────────────────────────────────
  let phone = recipientPhone || '';
  let email = recipientEmail || '';

  if (supabase && (!phone || !email)) {
    try {
      // Look in auth.users or profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        if (!phone && profile.phone) phone = profile.phone;
        if (!email && profile.email) email = profile.email;
      }

      // If phone still missing, check user metadata via auth admin
      if (!phone || !email) {
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (userData?.user) {
          if (!email && userData.user.email) email = userData.user.email;
          if (!phone && userData.user.user_metadata?.phone) {
            phone = userData.user.user_metadata.phone;
          }
        }
      }
    } catch (lookupErr) {
      console.warn('[dispatch] Contact lookup error:', lookupErr);
    }
  }

  // ── 3. Determine User Notification Preferences ────────────────────────────
  // Default preferences
  const categoryKey = type.toLowerCase();
  let prefInApp = true;
  let prefSms = false;
  let prefEmail = false;
  let criticalBypass = true;

  if (categoryKey.includes('health') || categoryKey.includes('medication')) {
    prefSms = true;
    prefEmail = true;
  } else if (categoryKey.includes('vaccin')) {
    prefSms = true;
    prefEmail = true;
  } else if (categoryKey.includes('inventory') || categoryKey.includes('expiry')) {
    prefEmail = true;
  } else if (categoryKey.includes('breeding')) {
    prefEmail = true;
  } else if (categoryKey.includes('sale')) {
    prefEmail = true;
  }

  if (supabase) {
    try {
      const { data: prefRow } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (prefRow) {
        criticalBypass = prefRow.critical_bypass ?? true;
        if (categoryKey.includes('health')) {
          prefInApp = prefRow.health_in_app ?? true;
          prefSms = prefRow.health_sms ?? true;
          prefEmail = prefRow.health_email ?? true;
        } else if (categoryKey.includes('medication')) {
          prefInApp = prefRow.medication_in_app ?? true;
          prefSms = prefRow.medication_sms ?? true;
          prefEmail = prefRow.medication_email ?? true;
        } else if (categoryKey.includes('vaccin')) {
          prefInApp = prefRow.vaccination_in_app ?? true;
          prefSms = prefRow.vaccination_sms ?? true;
          prefEmail = prefRow.vaccination_email ?? true;
        } else if (categoryKey.includes('inventory') || categoryKey.includes('expiry')) {
          prefInApp = prefRow.inventory_in_app ?? true;
          prefSms = prefRow.inventory_sms ?? false;
          prefEmail = prefRow.inventory_email ?? true;
        } else if (categoryKey.includes('breeding')) {
          prefInApp = prefRow.breeding_in_app ?? true;
          prefSms = prefRow.breeding_sms ?? false;
          prefEmail = prefRow.breeding_email ?? true;
        } else if (categoryKey.includes('sale')) {
          prefInApp = prefRow.sales_in_app ?? true;
          prefSms = prefRow.sales_sms ?? false;
          prefEmail = prefRow.sales_email ?? true;
        } else {
          prefInApp = prefRow.system_in_app ?? true;
          prefSms = prefRow.system_sms ?? false;
          prefEmail = prefRow.system_email ?? false;
        }
      }
    } catch (prefErr) {
      console.warn('[dispatch] Preferences lookup error:', prefErr);
    }
  }

  // Emergency override: Critical alerts bypass disabled channels unless explicit in request
  const isCritical = normalizedSeverity === 'critical';
  if (isCritical && criticalBypass) {
    prefSms = true;
    prefEmail = true;
  }

  // Apply explicit request channel overrides if supplied
  const shouldSendInApp = channels?.inApp !== undefined ? channels.inApp : prefInApp;
  const shouldSendSms = channels?.sms !== undefined ? channels.sms : prefSms;
  const shouldSendEmail = channels?.email !== undefined ? channels.email : prefEmail;

  // ── 4. Create In-App Notification Record ──────────────────────────────────
  let createdNotification: any = null;

  if (shouldSendInApp && supabase) {
    try {
      const payload: Record<string, any> = {
        user_id: userId,
        type,
        title,
        description: message,
        message,
        priority,
        severity: normalizedSeverity,
        link,
        animal_id: animalId,
        related_type: relatedType,
        related_id: relatedId,
        event_key: eventKey,
        read: false,
        is_read: false,
      };

      const { data: notifData, error: notifErr } = await supabase
        .from('notifications')
        .insert(payload)
        .select('*')
        .single();

      if (!notifErr && notifData) {
        createdNotification = notifData;
        deliveries.push({
          channel: 'in_app',
          recipient: userId,
          status: 'delivered',
        });

        // Record delivery
        await supabase.from('notification_deliveries').insert({
          user_id: userId,
          notification_id: notifData.id,
          channel: 'in_app',
          recipient: userId,
          status: 'delivered',
          delivered_at: new Date().toISOString(),
        });
      } else {
        console.warn('[dispatch] In-app insert warning:', notifErr?.message);
      }
    } catch (inAppErr: any) {
      console.warn('[dispatch] In-app caught:', inAppErr?.message);
    }
  }

  const notificationId = createdNotification?.id || null;

  // ── 5. Dispatch SMS (if enabled and phone available) ──────────────────────
  if (shouldSendSms) {
    if (!phone) {
      deliveries.push({
        channel: 'sms',
        recipient: '',
        status: 'skipped',
        error: 'User has no phone number configured in profile.',
      });
    } else {
      const normalized = normalizePhoneNumber(phone);
      if (!normalized.valid) {
        const errMsg = `Invalid Philippine or international phone format: ${phone}`;
        deliveries.push({
          channel: 'sms',
          recipient: phone,
          status: 'failed',
          error: errMsg,
        });

        if (supabase) {
          await supabase.from('notification_deliveries').insert({
            user_id: userId,
            notification_id: notificationId,
            channel: 'sms',
            recipient: phone,
            status: 'failed',
            error_message: errMsg,
          });
        }
      } else {
        // Format farmer-friendly SMS message
        const smsContent = `ALPASFARM: ${title}. ${message}`;
        const smsResult = await dispatchSms(normalized.e164, smsContent);

        deliveries.push({
          channel: 'sms',
          recipient: normalized.e164,
          status: smsResult.success ? 'sent' : 'failed',
          providerMessageId: smsResult.messageId,
          error: smsResult.error,
        });

        if (supabase) {
          await supabase.from('notification_deliveries').insert({
            user_id: userId,
            notification_id: notificationId,
            channel: 'sms',
            recipient: normalized.e164,
            status: smsResult.success ? 'sent' : 'failed',
            provider_message_id: smsResult.messageId || null,
            error_message: smsResult.error || null,
            sent_at: smsResult.success ? new Date().toISOString() : null,
          });
        }
      }
    }
  }

  // ── 6. Dispatch Email (if enabled and email available) ────────────────────
  if (shouldSendEmail) {
    if (!email) {
      deliveries.push({
        channel: 'email',
        recipient: '',
        status: 'skipped',
        error: 'User has no email address configured in profile.',
      });
    } else {
      const emailSubject = `ALPASFARM - ${title}`;
      const fullActionUrl = link
        ? link.startsWith('http')
          ? link
          : `https://alpasfarm.ph${link}`
        : undefined;

      const template = buildEmailTemplate({
        title,
        message,
        relatedType: relatedType || undefined,
        actionUrl: fullActionUrl,
        severity: normalizedSeverity,
      });

      const emailResult = await dispatchEmail(
        email,
        emailSubject,
        template.html,
        template.text
      );

      deliveries.push({
        channel: 'email',
        recipient: email,
        status: emailResult.success ? 'sent' : 'failed',
        providerMessageId: emailResult.messageId,
        error: emailResult.error,
      });

      if (supabase) {
        await supabase.from('notification_deliveries').insert({
          user_id: userId,
          notification_id: notificationId,
          channel: 'email',
          recipient: email,
          status: emailResult.success ? 'sent' : 'failed',
          provider_message_id: emailResult.messageId || null,
          error_message: emailResult.error || null,
          sent_at: emailResult.success ? new Date().toISOString() : null,
        });
      }
    }
  }

  res.status(200).json({
    success: true,
    notification: createdNotification,
    deliveries,
  });
}
