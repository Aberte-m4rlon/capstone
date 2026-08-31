import { supabase } from './supabase';
import type { Notification, Priority, NotificationType } from '../types';
import type { DailyAlert } from './recommendations';

/**
 * Normalizes a database notification record to guarantee uniform
 * properties (read / is_read, link / action_url, description / message).
 */
export function normalizeNotification(raw: any): Notification {
  const isRead = Boolean(raw.read ?? raw.is_read ?? false);
  const actionUrl = raw.action_url || raw.link || null;
  const description = raw.description || raw.message || null;

  return {
    id: raw.id,
    user_id: raw.user_id,
    type: (raw.type || 'System') as NotificationType,
    title: raw.title || 'Notification',
    description,
    message: description,
    priority: (raw.priority || 'Normal') as Priority,
    link: actionUrl,
    action_url: actionUrl,
    animal_id: raw.animal_id || null,
    read: isRead,
    is_read: isRead,
    created_at: raw.created_at || new Date().toISOString(),
    read_at: raw.read_at || (isRead ? new Date().toISOString() : null),
  };
}

export const notificationService = {
  /**
   * Fetch all notifications for the current user or farm, sorted newest first.
   */
  async fetchNotifications(userId?: string): Promise<Notification[]> {
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('notificationService.fetchNotifications error:', error.message);
        return [];
      }
      return (data || []).map(normalizeNotification);
    } catch (err) {
      console.warn('notificationService.fetchNotifications caught:', err);
      return [];
    }
  },

  /**
   * Mark a single notification as read permanently in Supabase.
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    if (!notificationId) return false;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          read: true,
        })
        .eq('id', notificationId);

      if (error) {
        console.warn('notificationService.markAsRead failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('notificationService.markAsRead exception:', err);
      return false;
    }
  },

  /**
   * Mark all unread notifications as read permanently in Supabase.
   */
  async markAllAsRead(userId?: string): Promise<boolean> {
    try {
      let query = supabase
        .from('notifications')
        .update({ read: true })
        .eq('read', false);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { error } = await query;
      if (error) {
        console.warn('notificationService.markAllAsRead failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('notificationService.markAllAsRead exception:', err);
      return false;
    }
  },

  /**
   * Delete a single notification.
   */
  async deleteNotification(notificationId: string): Promise<boolean> {
    if (!notificationId) return false;
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) {
        console.warn('notificationService.deleteNotification failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('notificationService.deleteNotification exception:', err);
      return false;
    }
  },

  /**
   * Delete all notifications for the active user.
   */
  async clearAllNotifications(userId?: string): Promise<boolean> {
    try {
      let query = supabase
        .from('notifications')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { error } = await query;
      if (error) {
        console.warn('notificationService.clearAllNotifications failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('notificationService.clearAllNotifications exception:', err);
      return false;
    }
  },

  /**
   * Insert a new notification into Supabase.
   */
  async createNotification(
    userId: string,
    data: {
      type: NotificationType;
      title: string;
      description?: string | null;
      message?: string | null;
      priority?: Priority;
      link?: string | null;
      action_url?: string | null;
      animal_id?: string | null;
      read?: boolean;
      is_read?: boolean;
    }
  ): Promise<Notification | null> {
    try {
      const payload = {
        user_id: userId,
        type: data.type || 'System',
        title: data.title,
        description: data.description || data.message || null,
        priority: data.priority || 'Normal',
        link: data.action_url || data.link || null,
        read: Boolean(data.read || data.is_read || false),
      };

      const { data: inserted, error } = await supabase
        .from('notifications')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        console.warn('notificationService.createNotification failed:', error.message);
        return null;
      }
      return inserted ? normalizeNotification(inserted) : null;
    } catch (err) {
      console.warn('notificationService.createNotification exception:', err);
      return null;
    }
  },

  /**
   * Synchronize system-generated daily alerts into notifications so that
   * unread status, clicking, and badge counts are uniformly tracked across the farm.
   */
  async syncDailyAlerts(
    alerts: DailyAlert[],
    userId: string,
    existingNotifications: Notification[]
  ): Promise<Notification[]> {
    if (!userId || !alerts.length) return existingNotifications;

    const existingTitles = new Set(existingNotifications.map((n) => `${n.type}-${n.title}`));
    const newItemsToInsert: any[] = [];

    // Filter to critical / warning alerts that haven't been recorded yet
    for (const alert of alerts) {
      const key = `${alert.type}-${alert.title}`;
      if (!existingTitles.has(key)) {
        newItemsToInsert.push({
          user_id: userId,
          type: alert.type,
          title: alert.title,
          description: alert.description,
          priority: alert.priority,
          link: alert.link,
          read: false,
        });
      }
    }

    if (newItemsToInsert.length > 0) {
      try {
        const { data: created, error } = await supabase
          .from('notifications')
          .insert(newItemsToInsert)
          .select('*');

        if (!error && created) {
          const formatted = created.map(normalizeNotification);
          return [...formatted, ...existingNotifications];
        }
      } catch (e) {
        console.warn('Could not auto-sync daily alerts into notifications:', e);
      }
    }

    return existingNotifications;
  },
};
