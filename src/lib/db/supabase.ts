import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browser: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (browser) return browser;
  browser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  );
  return browser;
}

export function supabaseService(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service env missing — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false } });
}
