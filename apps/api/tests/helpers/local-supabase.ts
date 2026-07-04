import { execFileSync } from "node:child_process";

/**
 * Resolve the local Supabase stack URL + keys for the live-DB integration
 * tests, WITHOUT hardcoding any key literal in source.
 *
 * Resolution order:
 *   1. `RLS_TEST_SUPABASE_URL` / `RLS_TEST_SUPABASE_ANON_KEY` /
 *      `RLS_TEST_SUPABASE_SERVICE_KEY` env vars (CI / non-default setups).
 *   2. `supabase status -o env` for the running local stack.
 *
 * The keys are local-dev credentials for an ephemeral 127.0.0.1 Postgres, but
 * we keep them out of the repo so secret scanners do not flag them and so the
 * tests always match whatever stack is actually running.
 */
export interface LocalSupabaseKeys {
  url: string;
  anonKey: string;
  serviceKey: string;
}

let cached: LocalSupabaseKeys | null = null;

export function resolveLocalSupabaseKeys(): LocalSupabaseKeys {
  if (cached) return cached;

  const envUrl = process.env.RLS_TEST_SUPABASE_URL;
  const envAnon = process.env.RLS_TEST_SUPABASE_ANON_KEY;
  const envService = process.env.RLS_TEST_SUPABASE_SERVICE_KEY;

  if (envUrl && envAnon && envService) {
    cached = { url: envUrl, anonKey: envAnon, serviceKey: envService };
    return cached;
  }

  const status = readSupabaseStatusEnv();
  cached = {
    url: envUrl ?? status.API_URL ?? "http://127.0.0.1:56341",
    anonKey: envAnon ?? status.ANON_KEY ?? "",
    serviceKey: envService ?? status.SERVICE_ROLE_KEY ?? "",
  };
  return cached;
}

/** Parse `supabase status -o env` (KEY="value" lines) into a record. */
function readSupabaseStatusEnv(): Record<string, string> {
  try {
    const out = execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const result: Record<string, string> = {};
    for (const line of out.split("\n")) {
      const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (match && match[1]) {
        result[match[1]] = match[2] ?? "";
      }
    }
    return result;
  } catch {
    // supabase CLI unavailable or stack down; caller's env vars (if any) or the
    // reachability guard in the test's before() hook will surface the problem.
    return {};
  }
}
