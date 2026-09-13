import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseServer } from '../lib/supabaseServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const { notificationId, userId } = req.query;

  const supabase = getSupabaseServer();
  if (!supabase) {
    res.status(500).json({ error: 'Database server connection unavailable.' });
    return;
  }

  try {
    let query = supabase
      .from('notification_deliveries')
      .select('*')
      .order('created_at', { ascending: false });

    if (notificationId && typeof notificationId === 'string') {
      query = query.eq('notification_id', notificationId);
    } else if (userId && typeof userId === 'string') {
      query = query.eq('user_id', userId).limit(50);
    } else {
      res.status(400).json({ error: 'Either notificationId or userId is required.' });
      return;
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ deliveries: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Server error' });
  }
}
