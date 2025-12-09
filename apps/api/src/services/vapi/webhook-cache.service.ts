/**
 * Webhook Cache Service
 * In-memory cache for storing VAPI webhook call results
 * Used by Kestra scripts to poll for results instead of directly polling VAPI
 */

import type { CallResult } from './types.js';

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

interface CachedCallResult {
  result: CallResult;
  timestamp: number;
  expiresAt: number;
}

export class WebhookCacheService {
  private cache: Map<string, CachedCallResult> = new Map();
  private readonly DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor(private logger: Logger, ttlMs: number = 30 * 60 * 1000) {
    this.DEFAULT_TTL_MS = ttlMs;

    // Run cleanup every 5 minutes to remove expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);

    this.logger.info({
      ttl: this.DEFAULT_TTL_MS / 1000 / 60
    }, 'WebhookCacheService initialized');
  }

  /**
   * Store a call result in the cache
   */
  set(callId: string, result: CallResult, ttl?: number): void {
    const now = Date.now();
    const expiresAt = now + (ttl || this.DEFAULT_TTL_MS);

    this.cache.set(callId, {
      result,
      timestamp: now,
      expiresAt
    });

    this.logger.debug({
      callId,
      expiresAt: new Date(expiresAt).toISOString(),
      cacheSize: this.cache.size,
      dataStatus: result.dataStatus
    }, 'Call result cached');
  }

  /**
   * Update the fetch status of a cached call result
   */
  updateFetchStatus(
    callId: string,
    status: 'partial' | 'complete' | 'fetching' | 'fetch_failed',
    error?: string
  ): boolean {
    const cached = this.cache.get(callId);
    if (!cached) {
      this.logger.warn({ callId }, 'Cannot update fetch status: call not found in cache');
      return false;
    }

    cached.result.dataStatus = status;
    if (status === 'fetching') {
      cached.result.fetchAttempts = (cached.result.fetchAttempts || 0) + 1;
    }
    if (status === 'complete') {
      cached.result.fetchedAt = new Date().toISOString();
    }
    if (error) {
      cached.result.fetchError = error;
    }

    this.cache.set(callId, cached);

    this.logger.debug({
      callId,
      dataStatus: status,
      fetchAttempts: cached.result.fetchAttempts
    }, 'Fetch status updated');

    return true;
  }

  /**
   * Merge enriched data from VAPI API into existing cache entry
   */
  mergeEnrichedData(callId: string, enrichedData: Partial<CallResult>): boolean {
    const cached = this.cache.get(callId);
    if (!cached) {
      this.logger.warn({ callId }, 'Cannot merge data: call not found in cache');
      return false;
    }

    // Merge transcript (prefer longer/more complete one)
    if (enrichedData.transcript && enrichedData.transcript.length > cached.result.transcript.length) {
      cached.result.transcript = enrichedData.transcript;
    }

    // Merge analysis
    if (enrichedData.analysis) {
      cached.result.analysis = {
        summary: enrichedData.analysis.summary || cached.result.analysis.summary,
        structuredData: {
          ...cached.result.analysis.structuredData,
          ...enrichedData.analysis.structuredData
        },
        successEvaluation: enrichedData.analysis.successEvaluation || cached.result.analysis.successEvaluation
      };
    }

    // Update cost if provided
    if (enrichedData.cost !== undefined) {
      cached.result.cost = enrichedData.cost;
    }

    // Update status fields
    cached.result.dataStatus = 'complete';
    cached.result.fetchedAt = new Date().toISOString();

    this.cache.set(callId, cached);

    this.logger.info({
      callId,
      transcriptLength: cached.result.transcript.length,
      hasSummary: !!cached.result.analysis.summary,
      hasStructuredData: Object.keys(cached.result.analysis.structuredData).length > 0
    }, 'Enriched data merged into cache');

    return true;
  }

  /**
   * Retrieve a call result from the cache
   */
  get(callId: string): CallResult | null {
    const cached = this.cache.get(callId);

    if (!cached) {
      this.logger.debug({ callId }, 'Call result not found in cache');
      return null;
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.logger.debug({ callId }, 'Call result expired, removing from cache');
      this.cache.delete(callId);
      return null;
    }

    this.logger.debug({ callId }, 'Call result retrieved from cache');
    return cached.result;
  }

  /**
   * Check if a call result exists in the cache
   */
  has(callId: string): boolean {
    const cached = this.cache.get(callId);

    if (!cached) {
      return false;
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(callId);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific call result from the cache
   */
  delete(callId: string): boolean {
    const existed = this.cache.delete(callId);

    if (existed) {
      this.logger.debug({ callId }, 'Call result removed from cache');
    }

    return existed;
  }

  /**
   * Get all cached call IDs (useful for debugging)
   */
  getAllCallIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    entries: Array<{ callId: string; timestamp: number; expiresAt: number }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([callId, cached]) => ({
      callId,
      timestamp: cached.timestamp,
      expiresAt: cached.expiresAt
    }));

    return {
      size: this.cache.size,
      entries
    };
  }

  /**
   * Remove expired entries from the cache
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [callId, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(callId);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.info({
        removed,
        remainingSize: this.cache.size
      }, 'Cache cleanup completed');
    }
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.info({ clearedEntries: size }, 'Cache cleared');
  }

  /**
   * Stop the cleanup interval (call when shutting down)
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);
    this.logger.info({}, 'WebhookCacheService shutdown');
  }
}
