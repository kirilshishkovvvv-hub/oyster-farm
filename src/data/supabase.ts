import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until .env is filled in; the app then shows setup instructions. */
export const supabaseConfigured = !!url && !!key && !url.includes('YOUR-PROJECT');

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'oyster-farm-auth' },
});
