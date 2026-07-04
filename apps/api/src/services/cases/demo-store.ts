/**
 * DEMO_MODE cases store (SaaS slice 8).
 *
 * In demo mode the API runs without Supabase (see plugins/supabase.ts), so
 * case routes and the dispatch attach-to-case path share one process-wide
 * in-memory CasesDbClient. Reuses the FakeCasesDb query fake that already
 * backs the case-service unit tests - identical query semantics, zero
 * duplicate code.
 */

import { FakeCasesDb } from "./fake-cases-db.js";
import type { CasesDbClient } from "./types.js";

let demoDb: FakeCasesDb | null = null;

/** Process-wide singleton so all routes see the same demo cases. */
export function getDemoCasesDb(): CasesDbClient {
  demoDb ??= new FakeCasesDb();
  return demoDb as unknown as CasesDbClient;
}
