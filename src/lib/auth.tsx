import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

const DEMO_USER_ID = 'd586af66-5435-4d29-b727-d93d3a9ab479';

export interface LocalAuthUser {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    role?: string;
    avatar_url?: string;
    [key: string]: any;
  };
}


interface AuthContextValue {
  session: Session | null;
  user: User | LocalAuthUser | null;
  loading: boolean;
  signInWithPass: (email?: string, name?: string) => Promise<{ error: string | null }>;
  sendOtpToEmail: (email: string) => Promise<{ error: string | null }>;
  sendOtpToPhone: (phone: string) => Promise<{ error: string | null }>;
  verifyEmailOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [localUser, setLocalUser] = useState<LocalAuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('alpasfarm_local_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithPass = async (email?: string, name?: string) => {
    const userEmail = email?.trim() || 'farmer@alpasfarm.com';
    const userName = name?.trim() || 'Farm Manager';
    const mockUser: LocalAuthUser = {
      id: DEMO_USER_ID,
      email: userEmail,
      user_metadata: {
        full_name: userName,
        role: userEmail.toLowerCase().includes('admin') || userEmail === 'marlonaberte00@gmail.com' ? 'Admin' : 'Farmer',
      },
    };
    localStorage.setItem('alpasfarm_local_user', JSON.stringify(mockUser));
    setLocalUser(mockUser);
    return { error: null };
  };

  const sendOtpToEmail = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    return { error: error?.message ?? null };
  };

  const sendOtpToPhone = async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        shouldCreateUser: true,
      },
    });
    return { error: error?.message ?? null };
  };

  const verifyEmailOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    return { error: error?.message ?? null };
  };

  const verifyPhoneOtp = async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    localStorage.removeItem('alpasfarm_local_user');
    setLocalUser(null);
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  };

  const effectiveUser = localUser || session?.user || null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user: effectiveUser,
        loading,
        signInWithPass,
        sendOtpToEmail,
        sendOtpToPhone,
        verifyEmailOtp,
        verifyPhoneOtp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

