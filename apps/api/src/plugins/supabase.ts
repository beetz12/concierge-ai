import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { isDemoMode } from "../config/demo.js";

// Extend Fastify types to include Supabase decorator
declare module "fastify" {
  interface FastifyInstance {
    supabase: SupabaseClient;
  }
  interface FastifyRequest {
    supabase: SupabaseClient;
  }
}

/**
 * Supabase Fastify Plugin
 *
 * This plugin makes the Supabase admin client available via:
 * - fastify.supabase (instance decorator)
 * - request.supabase (request decorator)
 *
 * Usage:
 * - In routes: const { data } = await request.supabase.from('users').select('*');
 * - In server: const { data } = await fastify.supabase.from('users').select('*');
 */
const supabasePlugin: FastifyPluginAsync = async (fastify) => {
  if (isDemoMode()) {
    fastify.log.info("⚡ DEMO MODE: Skipping Supabase - using in-memory storage");
    const mockSupabase = {
      from: () => ({
        select: () => ({ data: [], error: null, single: () => ({ data: null, error: null }), limit: () => ({ data: [], error: null }) }),
        insert: () => ({ select: () => ({ data: [], error: null, single: () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: () => ({ select: () => ({ data: null, error: null, single: () => ({ data: null, error: null }) }) }) }),
        delete: () => ({ eq: () => ({ data: null, error: null }) }),
        upsert: () => ({ data: null, error: null }),
      }),
    } as any;
    fastify.decorate("supabase", mockSupabase);
    fastify.decorateRequest("supabase", { getter: () => mockSupabase });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    // Test the connection by querying a system table
    const { error } = await supabase
      .from("service_requests")
      .select("id")
      .limit(1);

    // PGRST116 = no rows (fine), PGRST204/PGRST205 = table doesn't exist (need migration)
    if (error) {
      const isTableMissing =
        error.code === "PGRST204" ||
        error.code === "PGRST205" ||
        error.message.includes("does not exist") ||
        error.message.includes("Could not find");

      if (isTableMissing) {
        fastify.log.warn(
          "⚠ Database tables not found. Please run the migrations first.",
        );
      } else {
        fastify.log.warn(
          { error },
          "Supabase connection test returned an unexpected error",
        );
      }
    } else {
      fastify.log.info("✓ Supabase database connection verified");
    }

    // Decorate the Fastify instance
    fastify.decorate("supabase", supabase);

    // Decorate each request
    fastify.decorateRequest("supabase", {
      getter() {
        return supabase;
      },
    });

    fastify.log.info("✓ Supabase plugin initialized successfully");
  } catch (error) {
    fastify.log.error({ error }, "Failed to initialize Supabase plugin");
    throw error;
  }
};

export default fp(supabasePlugin, {
  name: "supabase",
  fastify: ">=5.x",
});
