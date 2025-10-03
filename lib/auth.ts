'use client';

import { supabase, IS_SUPABASE_ENABLED } from '@/lib/supabase';

export interface User {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

function mapSupabaseUser(u: any | null): User | null {
  if (!u) return null;
  const username = u.user_metadata?.user_name || u.user_metadata?.full_name || (u.email?.split('@')[0]) || 'user';
  return {
    id: u.id,
    username,
    email: u.email || undefined,
    avatarUrl: u.user_metadata?.avatar_url || undefined,
  };
}

// --- Local guest auth (when Supabase/GitHub disabled) ---
const LS_KEY = 'guest_user';

function getGuest(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) as User : null;
  } catch { return null; }
}

function setGuest(u: User | null) {
  if (typeof window === 'undefined') return;
  if (u) localStorage.setItem(LS_KEY, JSON.stringify(u));
  else localStorage.removeItem(LS_KEY);
}

export const authService = {
  async loginWithGithub(usernameHint?: string): Promise<void> {
    const disableGithub = process.env.NEXT_PUBLIC_DISABLE_GITHUB === 'true';
    if (!IS_SUPABASE_ENABLED || disableGithub) {
      // Guest flow
      const u = getGuest() ?? {
        id: 'guest-' + (Math.random().toString(36).slice(2)),
        username: usernameHint || 'guest',
      };
      setGuest(u);
      return;
    }
    // Supabase OAuth GitHub (only if enabled)
    const { error } = await (supabase as any).auth.signInWithOAuth({ provider: 'github' });
    if (error) throw error;
  },

  async logout(): Promise<void> {
    if (!IS_SUPABASE_ENABLED || process.env.NEXT_PUBLIC_DISABLE_GITHUB === 'true') {
      setGuest(null);
      return;
    }
    await (supabase as any).auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    if (!IS_SUPABASE_ENABLED || process.env.NEXT_PUBLIC_DISABLE_GITHUB === 'true') {
      return getGuest();
    }
    const { data, error } = await (supabase as any).auth.getUser();
    if (error) return null;
    return mapSupabaseUser(data.user ?? null);
  },

  onAuthStateChange(callback: (state: AuthState) => void): () => void {
    if (!IS_SUPABASE_ENABLED || process.env.NEXT_PUBLIC_DISABLE_GITHUB === 'true') {
      // Local polling (fallback)
      const u = getGuest();
      callback({ user: u, isAuthenticated: !!u });
      const id = setInterval(() => {
        const u2 = getGuest();
        callback({ user: u2, isAuthenticated: !!u2 });
      }, 1000);
      return () => clearInterval(id);
    }
    const { data } = (supabase as any).auth.onAuthStateChange((_event: any, session: any) => {
      const u = mapSupabaseUser(session?.user ?? null);
      callback({ user: u, isAuthenticated: !!u });
    });
    return () => (data as any).subscription.unsubscribe();
  },
};
