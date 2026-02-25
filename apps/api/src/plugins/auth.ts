import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { jwtHandler, AuthUser } from "../lib/jwt.js";
import { isDemoMode } from "../config/demo.js";

// Extend Fastify types to include auth decorators
declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
    requireAuth: () => Promise<AuthUser>;
  }
}

/**
 * Auth Fastify Plugin
 *
 * Provides authentication utilities via request decorators:
 * - request.user: The authenticated user (null if not authenticated)
 * - request.requireAuth(): Throws 401 if not authenticated, returns user
 *
 * Supports development bypass with REQUIRE_AUTH=false
 *
 * Usage:
 * ```typescript
 * // Optional auth - check if user is logged in
 * fastify.get('/profile', async (request) => {
 *   if (request.user) {
 *     return { user: request.user };
 *   }
 *   return { user: null };
 * });
 *
 * // Required auth - throws 401 if not authenticated
 * fastify.get('/dashboard', async (request) => {
 *   const user = await request.requireAuth();
 *   return { message: `Hello ${user.email}` };
 * });
 * ```
 */
const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate request with null user initially
  fastify.decorateRequest("user", null);

  // Decorate request with requireAuth method
  fastify.decorateRequest("requireAuth", async function (this: FastifyRequest) {
    if (!this.user) {
      const error = new Error("Authentication required") as Error & {
        statusCode: number;
      };
      error.statusCode = 401;
      throw error;
    }
    return this.user;
  });

  // Hook to extract user from Authorization header on every request
  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (isDemoMode()) {
        request.user = {
          id: "demo-user-000",
          email: "demo@concierge-ai.com",
          role: "authenticated",
          firstName: "Demo",
          lastName: "User",
        };
        return;
      }

      // Skip auth for certain routes
      const skipPaths = ["/health", "/docs", "/docs/"];
      if (skipPaths.some((path) => request.url.startsWith(path))) {
        return;
      }

      // Check for development bypass mode
      if (!jwtHandler.isAuthRequired()) {
        request.user = jwtHandler.getDevUser();
        fastify.log.debug(
          { user: request.user },
          "Auth bypassed - using dev user"
        );
        return;
      }

      // Extract token from Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        request.user = null;
        return;
      }

      const token = authHeader.slice(7); // Remove "Bearer " prefix

      try {
        const payload = await jwtHandler.verifyToken(token);
        request.user = jwtHandler.extractUser(payload);
        fastify.log.debug(
          { userId: request.user.id },
          "User authenticated successfully"
        );
      } catch (error) {
        fastify.log.debug({ error }, "Token verification failed");
        request.user = null;
      }
    }
  );

  fastify.log.info(
    `✓ Auth plugin initialized (require_auth=${jwtHandler.isAuthRequired()})`
  );
};

export default fp(authPlugin, {
  name: "auth",
  dependencies: ["supabase"],
  fastify: ">=5.x",
});

// Export helper for protecting routes
export function requireAuth(
  handler: (
    request: FastifyRequest,
    reply: FastifyReply,
    user: AuthUser
  ) => Promise<unknown>
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await request.requireAuth();
    return handler(request, reply, user);
  };
}
