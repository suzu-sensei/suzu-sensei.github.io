import { createClient } from '@supabase/supabase-js';
import { readEnvironment } from '../env';

const env = readEnvironment();

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
