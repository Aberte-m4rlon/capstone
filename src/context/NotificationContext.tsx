import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { notificationService, normalizeNotification } from '../lib/notificationService';
import type { Notification, NotificationType, Priority } from '../types';
import type { DailyAlert } from '../lib/recommendations';

export interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  handleNotificationClick: (
    notification: Notification,
    navigate?: (path: string) => void
  ) => Promise<void>;
  createNotification: (data: {
    type: NotificationType;
    title: string;
    description?: string | null;
    message?: string | null;
    priority?: Priority;
    link?: string | null;
    action_url?: string | null;
    animal_id?: string | null;
  }) => Promise<Notification | null>;
  syncAlerts: (alerts: DailyAlert[]) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const isSyncingRef = useRef<boolean>(false);

  // Calculate unread count (always non-negative)
  const unreadCount = Math.max(
    0,
    notifications.filter((n) => !n.read && !n.is_read).length
  );

  // Refresh notifications from Supabase
  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const list = await notificationService.fetchNotifications(user.id);
    setNotifications(list);
    setLoading(false);
  }, [user]);

  // Initial fetch and Realtime subscription
  useEffect(() => {
    refresh();

    if (!user) return;

    // Realtime Postgres subscription on notifications table
    const channel = supabase
      .channel('public:notifications:' + user.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotif = normalizeNotification(payload.new);
            setNotifications((prev) => {
              if (prev.some((n) => n.id === newNotif.id)) return prev;
              return [newNotif, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = normalizeNotification(payload.new);
            setNotifications((prev) =>
              prev.map((n) => (n.id === updated.id ? updated : n))
            );
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (oldId) {
              setNotifications((prev) => prev.filter((n) => n.id !== oldId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  // Mark single notification as read (Optimistic UI)
  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!notificationId) return;

      // 1. Optimistically update local state immediately
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? {
                ...n,
                read: true,
                is_read: true,
                read_at: n.read_at || new Date().toISOString(),
              }
            : n
        )
      );

      // 2. Persist to database in background
      await notificationService.markAsRead(notificationId);
    },
    []
  );

  // Mark all notifications as read (Optimistic UI)
  const markAllAsRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read && !n.is_read);
    if (unread.length === 0) return;

    // 1. Optimistic UI update immediately
    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        read: true,
        is_read: true,
        read_at: n.read_at || nowIso,
      }))
    );

    toast('All notifications marked as read', 'success');

    // 2. Persist to database
    await notificationService.markAllAsRead(user?.id);
  }, [notifications, user, toast]);

  // Delete notification (Optimistic UI)
  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!notificationId) return;
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      await notificationService.deleteNotification(notificationId);
    },
    []
  );

  // Clear all notifications (Optimistic UI)
  const clearAll = useCallback(async () => {
    setNotifications([]);
    toast('All notifications cleared', 'success');
    await notificationService.clearAllNotifications(user?.id);
  }, [user, toast]);

  // Click handler with instant optimistic read + route navigation
  const handleNotificationClick = useCallback(
    async (notification: Notification, navigate?: (path: string) => void) => {
      if (!notification) return;

      // 1. Mark as read optimistically if not already read
      if (!notification.read && !notification.is_read) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id
              ? {
                  ...n,
                  read: true,
                  is_read: true,
                  read_at: new Date().toISOString(),
                }
              : n
          )
        );

        // 2. Save to database in background
        notificationService.markAsRead(notification.id).catch((err) => {
          console.warn('Failed to save read state in DB:', err);
        });
      }

      // 3. Navigate to target URL if available
      const targetUrl =
        notification.action_url ||
        notification.link ||
        (notification.animal_id ? `/animals/${notification.animal_id}` : null);

      if (targetUrl && navigate) {
        navigate(targetUrl);
      }
    },
    []
  );

  // Create notification helper
  const createNotification = useCallback(
    async (data: {
      type: NotificationType;
      title: string;
      description?: string | null;
      message?: string | null;
      priority?: Priority;
      link?: string | null;
      action_url?: string | null;
      animal_id?: string | null;
    }) => {
      if (!user) return null;
      const created = await notificationService.createNotification(user.id, data);
      if (created) {
        setNotifications((prev) => [created, ...prev.filter((n) => n.id !== created.id)]);
      }
      return created;
    },
    [user]
  );

  // Sync daily alerts helper
  const syncAlerts = useCallback(
    async (alerts: DailyAlert[]) => {
      if (!user || isSyncingRef.current || !alerts.length) return;
      isSyncingRef.current = true;
      try {
        const synced = await notificationService.syncDailyAlerts(alerts, user.id, notifications);
        setNotifications(synced);
      } finally {
        isSyncingRef.current = false;
      }
    },
    [user, notifications]
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        refresh,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        handleNotificationClick,
        createNotification,
        syncAlerts,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
