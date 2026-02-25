/**
 * IP Blacklist Configuration
 *
 * 2025 Best Practices:
 * - Use Set for O(1) lookups
 * - Block at onRequest hook (earliest lifecycle point)
 * - Return 403 Forbidden (not 401 or 429)
 * - Log all blocked attempts for security auditing
 *
 * For production, consider:
 * - Loading from Redis for multi-instance deployments
 * - Using a reverse proxy (nginx/Cloudflare) for infrastructure-level blocking
 * - Implementing CIDR range matching for subnet blocks
 */

// Hardcoded blacklist - known malicious IPs
// In production, load from database/Redis/external service
const BLACKLISTED_IPS: string[] = [
  // Example malicious IPs (fictional for demo)
  "192.168.100.50", // Known scanner
  "10.0.0.99", // Repeated abuse
  "203.0.113.42", // Documented attacker (TEST-NET-3)
  "198.51.100.100", // Suspicious activity (TEST-NET-2)
  "172.16.99.1", // Internal threat actor
];

// Use Set for O(1) lookup performance
export const ipBlacklist = new Set<string>(BLACKLISTED_IPS);

// Allowlist for trusted IPs that bypass all checks
// Useful for monitoring systems, internal services, etc.
const ALLOWED_IPS: string[] = [
  "127.0.0.1", // Localhost
  "::1", // IPv6 localhost
];

export const ipAllowlist = new Set<string>(ALLOWED_IPS);

/**
 * Extract the real client IP from a request
 * Handles proxied requests (nginx, Cloudflare, etc.)
 *
 * SECURITY: Only trust proxy headers in production if you control the proxy
 */
export function extractClientIp(request: {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
}): string {
  // Check for proxy headers (in order of trust)
  const xForwardedFor = request.headers["x-forwarded-for"];
  if (xForwardedFor) {
    // Take the first IP (original client) from comma-separated list
    const forwarded = Array.isArray(xForwardedFor)
      ? xForwardedFor[0]
      : xForwardedFor;
    const clientIp = forwarded?.split(",")[0]?.trim();
    if (clientIp) return clientIp;
  }

  // Nginx real IP header
  const xRealIp = request.headers["x-real-ip"];
  if (xRealIp) {
    const ip = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
    if (ip) return ip;
  }

  // Cloudflare header
  const cfConnectingIp = request.headers["cf-connecting-ip"];
  if (cfConnectingIp) {
    const ip = Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
    if (ip) return ip;
  }

  // Fallback to direct IP
  return request.ip;
}

/**
 * Check if an IP is blacklisted
 */
export function isBlacklisted(ip: string): boolean {
  return ipBlacklist.has(ip);
}

/**
 * Check if an IP is allowlisted (bypasses all security checks)
 */
export function isAllowlisted(ip: string): boolean {
  return ipAllowlist.has(ip);
}

/**
 * Add an IP to the blacklist at runtime
 * Useful for dynamic blocking based on abuse detection
 */
export function addToBlacklist(ip: string): void {
  ipBlacklist.add(ip);
}

/**
 * Remove an IP from the blacklist
 */
export function removeFromBlacklist(ip: string): void {
  ipBlacklist.delete(ip);
}

/**
 * Get current blacklist size (for monitoring/metrics)
 */
export function getBlacklistSize(): number {
  return ipBlacklist.size;
}
