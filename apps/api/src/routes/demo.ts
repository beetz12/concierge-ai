import { FastifyInstance } from "fastify";
import { isDemoMode } from "../config/demo.js";

export default async function demoRoutes(fastify: FastifyInstance) {
  fastify.get("/status", async () => {
    return {
      demoMode: isDemoMode(),
      features: {
        database: isDemoMode() ? "in-memory" : "supabase",
        calls: isDemoMode() ? "gemini-simulated" : "vapi-live",
        auth: isDemoMode() ? "bypassed" : "supabase-jwt",
      },
    };
  });
}
