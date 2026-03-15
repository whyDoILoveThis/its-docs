import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key.
// This bypasses RLS and should NEVER be exposed to the browser.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
