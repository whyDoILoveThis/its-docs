import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key.
// This bypasses RLS and should NEVER be exposed to the browser.
let _supabaseAdmin: SupabaseClient | null = null;

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    }
    return (_supabaseAdmin as Record<string, unknown>)[prop as string];
  },
});
