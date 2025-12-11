import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../types/database";

/**
 * Creates a Supabase client for use in Client Components
 * This client is used for client-side interactions and real-time subscriptions
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Support both naming conventions for the anon/publishable key
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please check your .env.local file.",
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
