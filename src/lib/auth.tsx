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

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (opts: SignUpOptions) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  verifyEmailOtp: (email: string, token: string, extraData?: { fullName?: string; farmName?: string }) => Promise<{ error: string | null }>;
  resendVerificationCode: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export interface SignUpOptions {
  email: string;
  password: string;
  fullName: string;
  farmName: string;
  farmLocation: string;
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

  // ── Sign up ───────────────────────────────────────────────────────────────────
  const signUp = async (opts: SignUpOptions): Promise<{ error: string | null; needsConfirmation: boolean }> => {
    const email = opts.email.trim().toLowerCase();
    const password = opts.password.trim();
    const fullName = opts.fullName.trim();
    const farmName = opts.farmName.trim();

    if (!email || !password || !fullName || !farmName) {
      return { error: 'All required fields must be filled in.', needsConfirmation: false };
    }

    // ── Create the Supabase auth account ─────────────────────────────────────
    // role is NEVER accepted from the client — always assigned server-side as farm_manager
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          // Supabase stores this in auth.users.raw_user_meta_data
          // The handle_new_user trigger picks it up and creates a profiles row
        },
      },
    });

    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('already registered') || msg.includes('user already exists') || msg.includes('already been registered')) {
        return { error: 'This email is already registered. Please sign in.', needsConfirmation: false };
      }
      if (msg.includes('password') || msg.includes('weak')) {
        return { error: 'Password is too weak. Use at least 8 characters with mixed case and a number.', needsConfirmation: false };
      }
      if (msg.includes('invalid') && msg.includes('email')) {
        return { error: 'Please enter a valid email address.', needsConfirmation: false };
      }
      return { error: 'Unable to create account. Please try again.', needsConfirmation: false };
    }

    if (!data.user) {
      return { error: 'Unable to create account. Please try again.', needsConfirmation: false };
    }

    // ── Create profiles row with farm_manager role (never from client input) ──
    try {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        role: 'farm_manager' as UserRole,  // hardcoded — never user-supplied
        full_name: fullName,
        is_active: true,
        email,
      }, { onConflict: 'id' });
    } catch {
      // Profile creation failure is non-fatal; the trigger may have already created it
    }

    // ── Create initial farm settings ─────────────────────────────────────────
    if (farmName) {
      try {
        await supabase.from('settings').upsert({
          user_id: data.user.id,
          farm_name: farmName,
          target_weight_kg: 40,
          gestation_days: 150,
          temp_critical: 40,
          heart_rate_high: 90,
          expiry_warning_days: 15,
          vaccine_due_days: 30,
          breeding_min_age_months: 8,
          breeding_min_weight_kg: 25,
        }, { onConflict: 'user_id' });
      } catch {
        // Non-fatal — user can set up farm settings later
      }
    }

    // If session was immediately returned, email confirmation is disabled in Supabase
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  };

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

  // ── Verify OTP code (email confirmation / signup token) ───────────────────────
  const verifyEmailOtp = async (
    email: string,
    token: string,
    extraData?: { fullName?: string; farmName?: string },
  ): Promise<{ error: string | null }> => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedToken = token.trim();

    if (!trimmedEmail) return { error: 'Email address is required.' };
    if (!trimmedToken) return { error: 'Please enter the verification code.' };

    try {
      // 1. Try signup token type first
      let res = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: trimmedToken,
        type: 'signup',
      });

      // 2. If signup fails, try email type as fallback
      if (res.error) {
        const retry = await supabase.auth.verifyOtp({
          email: trimmedEmail,
          token: trimmedToken,
          type: 'email',
        });
        if (!retry.error && retry.data.user) {
          res = retry;
        }
      }

      if (res.error) {
        const msg = res.error.message?.toLowerCase() ?? '';
        if (msg.includes('expired')) {
          return { error: 'The verification code has expired. Please click "Resend Code" to get a new code.' };
        }
        if (msg.includes('invalid') || msg.includes('token') || msg.includes('otp')) {
          return { error: 'Invalid verification code. Please check your email and try again.' };
        }
        return { error: res.error.message || 'Verification failed. Please try again.' };
      }

      if (res.data.session && res.data.user) {
        setSession(res.data.session);
        const p = await fetchProfile(res.data.user.id, res.data.user.email);

        // Update profile with full name if available
        if (extraData?.fullName && (!p.full_name || p.full_name === '')) {
          try {
            await supabase.from('profiles').upsert({
              id: res.data.user.id,
              role: p.role || 'farm_manager',
              full_name: extraData.fullName,
              is_active: true,
              email: trimmedEmail,
            }, { onConflict: 'id' });
            p.full_name = extraData.fullName;
          } catch { /* ignore */ }
        }

        // Initialize farm settings if available
        if (extraData?.farmName) {
          try {
            await supabase.from('settings').upsert({
              user_id: res.data.user.id,
              farm_name: extraData.farmName,
              target_weight_kg: 40,
              gestation_days: 150,
              temp_critical: 40,
              heart_rate_high: 90,
              expiry_warning_days: 15,
              vaccine_due_days: 30,
              breeding_min_age_months: 8,
              breeding_min_weight_kg: 25,
            }, { onConflict: 'user_id' });
          } catch { /* ignore */ }
        }

        setProfile(p);
      }

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Network error during verification. Please check your connection.' };
    }
  };

  // ── Resend verification code ─────────────────────────────────────────────────
  const resendVerificationCode = async (email: string): Promise<{ error: string | null }> => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return { error: 'Email address is required.' };

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: trimmedEmail,
      });

      if (error) {
        const msg = error.message?.toLowerCase() ?? '';
        if (msg.includes('rate') || msg.includes('limit') || msg.includes('seconds')) {
          return { error: 'Please wait a moment before requesting another code.' };
        }
        return { error: error.message || 'Unable to resend code right now.' };
      }

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Network error while resending verification code.' };
    }
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
        signUp,
        verifyEmailOtp,
        resendVerificationCode,
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
