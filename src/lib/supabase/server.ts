import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "@/lib/env";

/** Per-request Supabase client acting as the signed-in user (RLS applies). */
export async function createClient() {
  // Read cookies first: this marks the calling route as per-request (never prerendered).
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes sessions.
        }
      },
    },
  });
}

/** Returns the verified user (validated with Supabase Auth, not just the cookie) or null. */
export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}
