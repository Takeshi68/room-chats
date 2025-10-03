'use client';
import { createClient } from '@supabase/supabase-js';

/** Environment flags (client-side, build-time) */
export const IS_SUPABASE_ENABLED = process.env.NEXT_PUBLIC_DISABLE_SUPABASE !== 'true'
  && !!process.env.NEXT_PUBLIC_SUPABASE_URL
  && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Create real client only when enabled */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const realClient = IS_SUPABASE_ENABLED
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Lightweight stub to avoid crashes when Supabase is disabled */
function createStub() {
  const noop = () => ({ then: () => ({}) });
  return {
    from() { return { select: noop, insert: noop, update: noop, delete: noop, eq: () => this }; },
    storage: { from() { return { upload: noop, getPublicUrl: () => ({ data: { publicUrl: '' } }) }; } },
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } } as any),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithOAuth: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
    },
    channel() { return { on(){ return this }, subscribe(){ return { data:{}, error:null } }, unsubscribe(){} } as any; },
  } as any;
}

export const supabase = (realClient ?? createStub());
