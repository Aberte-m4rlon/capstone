import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bsotlxbvanpwengftfli.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzb3RseGJ2YW5wd2VuZmd0ZmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY0MDUsImV4cCI6MjEwMjMzMjQwNX0.v_33C4O79lV3oyvXrBm9ZbTiP2EYzxu09C80Re1MAgU';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
