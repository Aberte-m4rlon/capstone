import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

// ─── Role definitions ─────────────────────────────────────────────────────────
export type UserRole = 'system_admin' | 'farm_manager';

/** Human-readable label for a role */
export function getRoleLabel(role: UserRole | null): string {
  if (role === 'system_admin') return 'System Administrator';
  return 'Farm Manager';
}

/** Default landing route after sign-in */
export function defaultRouteForRole(role: UserRole | null): string {
  if (role === 'system_admin') return '/admin';
  return '/dashboard';
}

/** Whether a role can access a given route */
export function canAccessRoute(role: UserRole | null, route: string): boolean {
  if (!role) return false;
  if (role === 'system_admin') return route === '/admin';
  return route !== '/admin';
}

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string | null;
  is_active: boolean;
}

/**
 * Fallback admin email list.
 * Used when the `profiles` table doesn't exist yet or has no row for the user.
 * Apply the database migration below to move to a proper role column.
 *
 * MIGRATION (run once in Supabase SQL Editor):
 * ─────────────────────────────────────────────
 * create table if not exists public.profiles (
 *   id          uuid primary key references auth.users(id) on delete cascade,
 *   role        text not null default 'farm_manager'
 *                 check (role in ('farm_manager', 'system_admin')),
 *   full_name   text,
 *   is_active   boolean not null default true,
 *   created_at  timestamptz not null default now(),
 *   updated_at  timestamptz not null default now()
 * );
 * alter table public.profiles enable row level security;
 * create policy "Users can view their own profile"
 *   on public.profiles for select using (auth.uid() = id);
 * -- Seed existing admin:
 * insert into public.profiles (id, role)
 *   select id, 'system_admin'
 *   from auth.users where email = 'marlonaberte00@gmail.com'
 *   on conflict (id) do update set role = 'system_admin';
 */
export const ADMIN_EMAILS_FALLBACK: string[] = ['marlonaberte00@gmail.com'];

// ─── Context shape ────────────────────────────────────────────────────────────
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch the profile row. Falls back gracefully if the table doesn't exist.
   */
  const fetchProfile = async (userId: string, userEmail?: string | null): Promise<UserProfile> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, full_name, is_active')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        // profiles table may not be migrated yet
        const isAdmin = !!userEmail && ADMIN_EMAILS_FALLBACK.includes(userEmail.toLowerCase());
        return {
          id: userId,
          role: isAdmin ? 'system_admin' : 'farm_manager',
          full_name: null,
          is_active: true,
        };
      }

      if (!data) {
        // No row yet → insert a default profile
        const isAdmin = !!userEmail && ADMIN_EMAILS_FALLBACK.includes(userEmail.toLowerCase());
        const defaultRole: UserRole = isAdmin ? 'system_admin' : 'farm_manager';
        const { data: inserted } = await supabase
          .from('profiles')
          .insert({ id: userId, role: defaultRole, full_name: null, is_active: true })
          .select('id, role, full_name, is_active')
          .maybeSingle();
        return (
          (inserted as UserProfile | null) ?? {
            id: userId,
            role: defaultRole,
            full_name: null,
            is_active: true,
          }
        );
      }

      return data as UserProfile;
    } catch {
      const isAdmin = !!userEmail && ADMIN_EMAILS_FALLBACK.includes(userEmail.toLowerCase());
      return {
        id: userId,
        role: isAdmin ? 'system_admin' : 'farm_manager',
        full_name: null,
        is_active: true,
      };
    }
  };

  // ── Bootstrap: restore session on mount ─────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        const sess = data.session;
        setSession(sess);
        if (sess?.user) {
          const p = await fetchProfile(sess.user.id, sess.user.email);
          if (mounted) setProfile(p);
        }
        if (mounted) setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (newSession?.user) {
        const p = await fetchProfile(newSession.user.id, newSession.user.email);
        if (mounted) setProfile(p);
      } else {
        if (mounted) setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sign in with email + password ────────────────────────────────────────────
  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      return { error: 'Invalid email or password.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    });

    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      if (
        msg.includes('invalid') ||
        msg.includes('credentials') ||
        msg.includes('password') ||
        msg.includes('not found') ||
        msg.includes('email')
      ) {
        return { error: 'Invalid email or password.' };
      }
      if (msg.includes('not confirmed')) {
        return { error: 'Please verify your email address before signing in.' };
      }
      return { error: 'Unable to sign in right now. Please try again.' };
    }

    if (!data.user) {
      return { error: 'Invalid email or password.' };
    }

    const p = await fetchProfile(data.user.id, data.user.email);

    // Block inactive accounts
    if (!p.is_active) {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      return {
        error: 'Your account is currently inactive. Please contact the system administrator.',
      };
    }

    setProfile(p);
    return { error: null };
  };

  // ── Sign out ─────────────────────────────────────────────────────────────────
  const signOut = async () => {
    setProfile(null);
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Local state already cleared — safe to ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role: profile?.role ?? null,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
