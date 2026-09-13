import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseServer } from '../lib/supabaseServer';
import {
  dispatchSms,
  dispatchEmail,
  buildEmailTemplate,
  normalizePhoneNumber,
} from '../lib/sender';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const { userId, channel, recipient } = req.body || {};

  if (!channel || (channel !== 'sms' && channel !== 'email')) {
    res.status(400).json({ error: 'Channel must be "sms" or "email".' });
    return;
  }

  const supabase = getSupabaseServer();
  let targetRecipient = (recipient || '').trim();

  // If no recipient provided, look up user contact info
  if (!targetRecipient && userId && supabase) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone, email')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        if (channel === 'sms' && profile.phone) targetRecipient = profile.phone;
        if (channel === 'email' && profile.email) targetRecipient = profile.email;
      }

      if (!targetRecipient) {
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (userData?.user) {
          if (channel === 'email') targetRecipient = userData.user.email || '';
          if (channel === 'sms') {
            targetRecipient = userData.user.user_metadata?.phone || '';
          }
        }
      }
    } catch (lookupErr) {
      console.warn('[testNotification] Contact lookup error:', lookupErr);
    }
  }

  if (!targetRecipient) {
    res.status(400).json({
      success: false,
      error:
        channel === 'sms'
          ? 'Walang nakitang numero ng telepono. Mangyaring maglagay ng valid na Philippine phone number (hal. 09171234567).'
          : 'Walang nakitang email address. Mangyaring maglagay ng valid na email address.',
    });
    return;
  }

  // ── Test SMS ──────────────────────────────────────────────────────────────
  if (channel === 'sms') {
    const norm = normalizePhoneNumber(targetRecipient);
    if (!norm.valid) {
      res.status(400).json({
        success: false,
        error: `Hindi valid ang numero ng telepono: "${targetRecipient}". Gamitin ang format na 09XXXXXXXXX o +639XXXXXXXXX.`,
      });
      return;
    }

    const testMessage =
      'ALPASFARM: Pagsubok sa SMS Notification. Matagumpay na nakakonekta ang SMS alert system ng iyong bukid!';

    const result = await dispatchSms(norm.e164, testMessage);

    if (userId && supabase) {
      try {
        await supabase.from('notification_deliveries').insert({
          user_id: userId,
          channel: 'sms',
          recipient: norm.e164,
          status: result.success ? 'sent' : 'failed',
          provider_message_id: result.messageId || null,
          error_message: result.error || null,
          sent_at: result.success ? new Date().toISOString() : null,
        });
      } catch (logErr) {
        console.warn('[testNotification] Delivery log warning:', logErr);
      }
    }

    if (result.success) {
      res.status(200).json({
        success: true,
        channel: 'sms',
        recipient: norm.e164,
        provider: result.provider,
        messageId: result.messageId,
        message: `Matagumpay na naipadala ang test SMS sa ${norm.e164} gamit ang ${result.provider}!`,
      });
    } else {
      res.status(200).json({
        success: false,
        channel: 'sms',
        recipient: norm.e164,
        provider: result.provider,
        error: result.error,
        message: `Nabigo ang pagpapadala ng SMS: ${result.error}`,
      });
    }
    return;
  }

  // ── Test Email ────────────────────────────────────────────────────────────
  if (channel === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetRecipient)) {
      res.status(400).json({
        success: false,
        error: `Hindi valid ang format ng email: "${targetRecipient}".`,
      });
      return;
    }

    const testTitle = 'Pagsubok sa Email Notification (Test Alert)';
    const testBody =
      'Magandang araw mula sa ALPASFARM!\n\nIto ay pagsubok na mensahe upang kumpirmahin na aktibo at maayos na gumagana ang iyong email notification settings sa ALPASFARM.\n\nMakakatanggap ka rito ng mga paalala ukol sa kalusugan ng hayop, bakuna, pagbubuntis, at mababang imbentaryo.';

    const template = buildEmailTemplate({
      title: testTitle,
      message: testBody,
      severity: 'normal',
    });

    const result = await dispatchEmail(
      targetRecipient,
      `ALPASFARM - ${testTitle}`,
      template.html,
      template.text
    );

    if (userId && supabase) {
      try {
        await supabase.from('notification_deliveries').insert({
          user_id: userId,
          channel: 'email',
          recipient: targetRecipient,
          status: result.success ? 'sent' : 'failed',
          provider_message_id: result.messageId || null,
          error_message: result.error || null,
          sent_at: result.success ? new Date().toISOString() : null,
        });
      } catch (logErr) {
        console.warn('[testNotification] Delivery log warning:', logErr);
      }
    }

    if (result.success) {
      res.status(200).json({
        success: true,
        channel: 'email',
        recipient: targetRecipient,
        provider: result.provider,
        messageId: result.messageId,
        message: `Matagumpay na naipadala ang test Email sa ${targetRecipient} gamit ang ${result.provider}!`,
      });
    } else {
      res.status(200).json({
        success: false,
        channel: 'email',
        recipient: targetRecipient,
        provider: result.provider,
        error: result.error,
        message: `Nabigo ang pagpapadala ng Email: ${result.error}`,
      });
    }
    return;
  }
}
