import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

// ─── Role definitions ─────────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'system_admin' | 'farm_manager';

/** Human-readable label for a role */
export function getRoleLabel(role: UserRole | null): string {
  if (role === 'super_admin') return 'Super Administrator';
  if (role === 'system_admin') return 'System Administrator';
  return 'Farm Manager';
}

/** Default landing route after sign-in */
export function defaultRouteForRole(role: UserRole | null): string {
  if (role === 'super_admin') return '/super-admin';
  if (role === 'system_admin') return '/admin';
  return '/dashboard';
}

/** Whether a role can access a given route */
export function canAccessRoute(role: UserRole | null, route: string): boolean {
  if (!role) return false;
  if (role === 'super_admin') return true; // super admin can access everything
  if (role === 'system_admin') return route === '/admin';
  return route !== '/admin' && route !== '/super-admin';
}

/** Check if a role is an administrative role */
export function isAdminRole(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'system_admin';
}

/** Check if a role can manage users */
export function canManageUsers(role: UserRole | null): boolean {
  return role === 'super_admin';
}

/** Role hierarchy — higher number = more authority */
export const ROLE_RANK: Record<UserRole, number> = {
  farm_manager: 1,
  system_admin: 2,
  super_admin: 3,
};

/** All assignable roles with labels */
export const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: 'farm_manager', label: 'Farm Manager' },
  { value: 'system_admin', label: 'System Administrator' },
  { value: 'super_admin', label: 'Super Administrator' },
];

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string | null;
  is_active: boolean;
}

/**
 * Fallback admin email list.
 * Used when the `profiles` table doesn't exist yet or has no row for the user.
 *
 * SUPABASE MIGRATION — run once in Supabase SQL Editor:
 * ─────────────────────────────────────────────────────
 * -- 1. Widen the CHECK constraint to include super_admin
 * alter table public.profiles
 *   drop constraint if exists profiles_role_check;
 * alter table public.profiles
 *   add constraint profiles_role_check
 *   check (role in ('farm_manager', 'system_admin', 'super_admin'));
 *
 * -- 2. Promote your account to super_admin
 * update public.profiles
 *   set role = 'super_admin'
 *   where id = (select id from auth.users where email = 'marlonaberte00@gmail.com');
 *
 * -- 3. Allow super_admin to update any profile row (for role assignment)
 * create policy "Super admin can manage all profiles"
 *   on public.profiles for all
 *   using (
 *     exists (
 *       select 1 from public.profiles p
 *       where p.id = auth.uid() and p.role = 'super_admin'
 *     )
 *   );
 */
export const ADMIN_EMAILS_FALLBACK: string[] = ['marlonaberte00@gmail.com'];
/** These emails get super_admin when no profiles row exists */
export const SUPER_ADMIN_EMAILS_FALLBACK: string[] = ['marlonaberte00@gmail.com'];

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
   * Email-based fallback always wins for SUPER_ADMIN_EMAILS_FALLBACK so the
   * super-admin account works even before the DB migration is run.
   */
  const fetchProfile = async (userId: string, userEmail?: string | null): Promise<UserProfile> => {
    const emailLower = userEmail?.trim().toLowerCase() ?? '';
    const isSuperAdminEmail = !!emailLower && SUPER_ADMIN_EMAILS_FALLBACK.includes(emailLower);

    // Super-admin email always gets super_admin role regardless of DB state
    const fallbackRole: UserRole = isSuperAdminEmail ? 'super_admin' : 'farm_manager';

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, full_name, is_active')
        .eq('id', userId)
        .maybeSingle();

      // Table doesn't exist or any DB error → use email fallback
      if (error) {
        return { id: userId, role: fallbackRole, full_name: null, is_active: true };
      }

      if (!data) {
        // No row yet → try to insert a default profile row
        try {
          const { data: inserted } = await supabase
            .from('profiles')
            .insert({ id: userId, role: fallbackRole, full_name: null, is_active: true })
            .select('id, role, full_name, is_active')
            .maybeSingle();
          if (inserted) return inserted as UserProfile;
        } catch {
          // Insert failed (table may not exist) — fall through to fallback
        }
        return { id: userId, role: fallbackRole, full_name: null, is_active: true };
      }

      // Row exists in DB — but if this is the super-admin email, always honour super_admin
      // in case the DB row still has an old role value before the migration ran
      const resolvedRole: UserRole = isSuperAdminEmail && data.role !== 'super_admin'
        ? 'super_admin'
        : (data.role as UserRole);

      return { ...(data as UserProfile), role: resolvedRole };
    } catch {
      return { id: userId, role: fallbackRole, full_name: null, is_active: true };
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
