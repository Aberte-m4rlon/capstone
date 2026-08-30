import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { sendSmsOtp, verifySmsOtp, formatPhoneNumber } from './sms';

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
  if (role === 'system_admin') return route !== '/super-admin';
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
  phone?: string | null;
  is_active: boolean;
}

export const ADMIN_EMAILS_FALLBACK: string[] = ['marlonaberte00@gmail.com'];
/** These emails get super_admin when no profiles row exists */
export const SUPER_ADMIN_EMAILS_FALLBACK: string[] = ['marlonaberte00@gmail.com'];

export interface SignUpOptions {
  email: string;
  password: string;
  fullName: string;
  farmName: string;
  farmLocation: string;
}

export interface PhoneSignUpOptions {
  phone: string;
  fullName: string;
  farmName: string;
  farmLocation: string;
}

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
  // ── SMS / Phone Auth Methods ──
  signInWithPhoneOtp: (phone: string) => Promise<{ error: string | null; message?: string; devCode?: string }>;
  signUpWithPhoneOtp: (opts: PhoneSignUpOptions) => Promise<{ error: string | null; message?: string; devCode?: string }>;
  verifyPhoneOtp: (phone: string, token: string, extraData?: { fullName?: string; farmName?: string; farmLocation?: string }) => Promise<{ error: string | null }>;
  resendPhoneOtp: (phone: string) => Promise<{ error: string | null; message?: string }>;
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

    // Check local storage for phone session fallback
    const savedPhoneSession = localStorage.getItem('alpas_phone_user');
    if (savedPhoneSession) {
      try {
        const parsed = JSON.parse(savedPhoneSession);
        if (parsed?.id) {
          setSession({
            user: {
              id: parsed.id,
              phone: parsed.phone,
              email: `${parsed.phone.replace(/[^0-9]/g, '')}@alpasfarm.local`,
              app_metadata: {},
              user_metadata: { full_name: parsed.full_name },
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as any,
            access_token: 'local-token',
            refresh_token: 'local-refresh',
            expires_in: 86400,
            token_type: 'bearer',
          });
          setProfile({
            id: parsed.id,
            role: parsed.role || 'farm_manager',
            full_name: parsed.full_name,
            phone: parsed.phone,
            is_active: true,
          });
          setLoading(false);
        }
      } catch {
        localStorage.removeItem('alpas_phone_user');
      }
    }

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        const sess = data.session;
        if (sess) {
          setSession(sess);
          if (sess?.user) {
            const p = await fetchProfile(sess.user.id, sess.user.email);
            if (mounted) setProfile(p);
          }
        }
        if (mounted) setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      if (newSession) {
        setSession(newSession);
        if (newSession?.user) {
          const p = await fetchProfile(newSession.user.id, newSession.user.email);
          if (mounted) setProfile(p);
        }
      } else {
        const hasPhoneSession = localStorage.getItem('alpas_phone_user');
        if (!hasPhoneSession) {
          setProfile(null);
          setSession(null);
        }
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sign up with Email ───────────────────────────────────────────────────────
  const signUp = async (opts: SignUpOptions): Promise<{ error: string | null; needsConfirmation: boolean }> => {
    const email = opts.email.trim().toLowerCase();
    const password = opts.password.trim();
    const fullName = opts.fullName.trim();
    const farmName = opts.farmName.trim();

    if (!email || !password || !fullName || !farmName) {
      return { error: 'All required fields must be filled in.', needsConfirmation: false };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
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

    try {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        role: 'farm_manager' as UserRole,
        full_name: fullName,
        is_active: true,
        email,
      }, { onConflict: 'id' });
    } catch {
      // Profile creation failure is non-fatal
    }

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
        // Non-fatal
      }
    }

    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  };

  // ── Sign in with Email + Password ───────────────────────────────────────────
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

  // ── Verify Email OTP ────────────────────────────────────────────────────────
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
      let res = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: trimmedToken,
        type: 'signup',
      });

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

  // ── Resend Email OTP ────────────────────────────────────────────────────────
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

  // ════════════════════════════════════════════════════════════════════════════
  // ── REAL SMS / PHONE AUTH IMPLEMENTATION ────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  // ── Send SMS OTP for Sign In ────────────────────────────────────────────────
  const signInWithPhoneOtp = async (
    phone: string,
  ): Promise<{ error: string | null; message?: string; devCode?: string }> => {
    const formatted = formatPhoneNumber(phone);
    if (!formatted.valid) {
      return { error: 'Please enter a valid Philippine mobile number (e.g., 0917 123 4567).' };
    }

    try {
      // 1. Send SMS through serverless real SMS router
      const smsRes = await sendSmsOtp({ phone: formatted.e164 });
      if (!smsRes.success) {
        return { error: smsRes.message || 'Failed to send SMS code.' };
      }

      // 2. Also trigger Supabase Phone OTP if available
      try {
        await supabase.auth.signInWithOtp({ phone: formatted.e164 });
      } catch {
        // Fallback is already handled by serverless SMS
      }

      return {
        error: null,
        message: smsRes.message,
        devCode: smsRes.devCode,
      };
    } catch (err: any) {
      return { error: err?.message || 'Failed to send SMS verification code.' };
    }
  };

  // ── Send SMS OTP for Sign Up ────────────────────────────────────────────────
  const signUpWithPhoneOtp = async (
    opts: PhoneSignUpOptions,
  ): Promise<{ error: string | null; message?: string; devCode?: string }> => {
    const formatted = formatPhoneNumber(opts.phone);
    const fullName = opts.fullName.trim();
    const farmName = opts.farmName.trim();

    if (!formatted.valid) {
      return { error: 'Please enter a valid Philippine mobile number (e.g., 0917 123 4567).' };
    }
    if (!fullName) {
      return { error: 'Please enter your full name.' };
    }
    if (!farmName) {
      return { error: 'Please enter your farm name.' };
    }

    try {
      const smsRes = await sendSmsOtp({
        phone: formatted.e164,
        fullName,
        farmName,
        farmLocation: opts.farmLocation,
      });

      if (!smsRes.success) {
        return { error: smsRes.message || 'Failed to dispatch SMS code.' };
      }

      return {
        error: null,
        message: smsRes.message,
        devCode: smsRes.devCode,
      };
    } catch (err: any) {
      return { error: err?.message || 'Error initiating phone sign-up.' };
    }
  };

  // ── Verify SMS OTP ──────────────────────────────────────────────────────────
  const verifyPhoneOtp = async (
    phone: string,
    token: string,
    extraData?: { fullName?: string; farmName?: string; farmLocation?: string },
  ): Promise<{ error: string | null }> => {
    const formatted = formatPhoneNumber(phone);
    const trimmedToken = token.trim();

    if (!formatted.valid) return { error: 'Invalid phone number.' };
    if (!trimmedToken) return { error: 'Please enter the 6-digit SMS code.' };

    try {
      // 1. Try Supabase verifyOtp first if Supabase Phone Auth is active
      try {
        const supaRes = await supabase.auth.verifyOtp({
          phone: formatted.e164,
          token: trimmedToken,
          type: 'sms',
        });
        if (!supaRes.error && supaRes.data.session) {
          setSession(supaRes.data.session);
          const p = await fetchProfile(supaRes.data.user!.id, supaRes.data.user!.email);
          setProfile(p);
          return { error: null };
        }
      } catch {
        // Fall back to serverless SMS verification
      }

      // 2. Verify with SMS API router
      const verifyRes = await verifySmsOtp(formatted.e164, trimmedToken);
      if (!verifyRes.success) {
        return { error: verifyRes.error || 'Invalid or expired SMS code.' };
      }

      // Generate or retrieve phone user identifier
      const cleanDigits = formatted.e164.replace(/[^0-9]/g, '');
      const syntheticUserId = `phone_${cleanDigits}`;
      const fullName = extraData?.fullName || verifyRes.user?.fullName || 'Farm Manager';
      const farmName = extraData?.farmName || verifyRes.user?.farmName || 'My Farm';

      const userProfile: UserProfile = {
        id: syntheticUserId,
        role: 'farm_manager',
        full_name: fullName,
        phone: formatted.e164,
        is_active: true,
      };

      // Persist profile to Supabase if possible
      try {
        await supabase.from('profiles').upsert({
          id: syntheticUserId,
          role: 'farm_manager' as UserRole,
          full_name: fullName,
          is_active: true,
          email: `${cleanDigits}@phone.alpasfarm.local`,
        }, { onConflict: 'id' });
      } catch {
        // non-fatal
      }

      // Initialize farm settings
      if (farmName) {
        try {
          await supabase.from('settings').upsert({
            user_id: syntheticUserId,
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
          // non-fatal
        }
      }

      const syntheticSession: any = {
        user: {
          id: syntheticUserId,
          phone: formatted.e164,
          email: `${cleanDigits}@phone.alpasfarm.local`,
          app_metadata: {},
          user_metadata: { full_name: fullName },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        },
        access_token: `sms_${cleanDigits}_${Date.now()}`,
        refresh_token: `refresh_${cleanDigits}`,
        expires_in: 604800,
        token_type: 'bearer',
      };

      // Save to localStorage for phone session persistence
      localStorage.setItem('alpas_phone_user', JSON.stringify({
        id: syntheticUserId,
        phone: formatted.e164,
        full_name: fullName,
        role: 'farm_manager',
      }));

      setSession(syntheticSession);
      setProfile(userProfile);

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error verifying SMS OTP.' };
    }
  };

  // ── Resend Phone OTP ────────────────────────────────────────────────────────
  const resendPhoneOtp = async (phone: string): Promise<{ error: string | null; message?: string }> => {
    const formatted = formatPhoneNumber(phone);
    if (!formatted.valid) return { error: 'Invalid phone number.' };

    try {
      const res = await sendSmsOtp({ phone: formatted.e164 });
      if (!res.success) {
        return { error: res.message || 'Unable to resend SMS.' };
      }
      return { error: null, message: res.message };
    } catch (err: any) {
      return { error: err?.message || 'Network error while resending SMS.' };
    }
  };

  // ── Sign out ─────────────────────────────────────────────────────────────────
  const signOut = async () => {
    localStorage.removeItem('alpas_phone_user');
    setProfile(null);
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Local state already cleared
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
        signInWithPhoneOtp,
        signUpWithPhoneOtp,
        verifyPhoneOtp,
        resendPhoneOtp,
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
