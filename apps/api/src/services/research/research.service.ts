/**
 * Research Service
 * Main orchestrator for provider research
 * Routes between Kestra and Direct Gemini based on availability
 */

import { KestraResearchClient } from './kestra-research.client.js';
import { DirectResearchClient } from './direct-research.client.js';
import type { ResearchRequest, ResearchResult, SystemStatus } from './types.js';

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export class ResearchService {
  private kestraClient: KestraResearchClient;
  private directClient: DirectResearchClient;

  constructor(private logger: Logger) {
    this.kestraClient = new KestraResearchClient(logger);
    this.directClient = new DirectResearchClient(logger);
  }

  /**
   * Main research method - intelligently routes to best available method
   */
  async search(request: ResearchRequest): Promise<ResearchResult> {
    this.logger.info({
      service: request.service,
      location: request.location,
      serviceRequestId: request.serviceRequestId
    }, 'Starting provider research');

    try {
      // Check if we should use Kestra
      const useKestra = await this.shouldUseKestra();

      if (useKestra) {
        this.logger.info({ method: 'kestra' }, 'Using Kestra for research');
        return await this.kestraClient.research(request);
      } else {
        this.logger.info({ method: 'direct_gemini' }, 'Using Direct Gemini for research');
        return await this.directClient.research(request);
      }
    } catch (error) {
      this.logger.error({ error, request }, 'Research failed, attempting fallback');

      // If primary method fails, try the other one
      try {
        const useKestra = await this.shouldUseKestra();
        if (useKestra) {
          this.logger.warn({}, 'Kestra failed, falling back to Direct Gemini');
          return await this.directClient.research(request);
        } else {
          this.logger.warn({}, 'Direct Gemini failed, attempting Kestra fallback');
          const kestraHealthy = await this.kestraClient.healthCheck();
          if (kestraHealthy) {
            return await this.kestraClient.research(request);
          }
        }
      } catch (fallbackError) {
        this.logger.error({ error: fallbackError }, 'Fallback research also failed');
      }

      // Both methods failed
      return {
        status: 'error',
        method: 'direct_gemini',
        providers: [],
        error: error instanceof Error ? error.message : 'Research failed'
      };
    }
  }

  /**
   * Determine if Kestra should be used for research
   */
  async shouldUseKestra(): Promise<boolean> {
    // Check environment variable
    const kestraEnabled = process.env.KESTRA_ENABLED === 'true';

    if (!kestraEnabled) {
      this.logger.debug({}, 'Kestra disabled via KESTRA_ENABLED env var');
      return false;
    }

    // Check if Kestra URL is configured
    const kestraUrl = process.env.KESTRA_URL;
    if (!kestraUrl) {
      this.logger.debug({}, 'Kestra URL not configured');
      return false;
    }

    // Check Kestra health
    try {
      const healthy = await this.kestraClient.healthCheck();
      this.logger.debug({ healthy }, 'Kestra health check result');
      return healthy;
    } catch (error) {
      this.logger.debug({ error }, 'Kestra health check failed');
      return false;
    }
  }

  /**
   * Get system status for diagnostics
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const kestraEnabled = process.env.KESTRA_ENABLED === 'true';
    const kestraUrl = process.env.KESTRA_URL || null;
    const geminiConfigured = !!process.env.GEMINI_API_KEY;

    let kestraHealthy = false;
    if (kestraEnabled && kestraUrl) {
      try {
        kestraHealthy = await this.kestraClient.healthCheck();
      } catch (error) {
        this.logger.debug({ error }, 'Health check failed during status check');
      }
    }

    const activeResearchMethod: 'kestra' | 'direct_gemini' =
      kestraEnabled && kestraHealthy ? 'kestra' : 'direct_gemini';

    return {
      kestraEnabled,
      kestraUrl,
      kestraHealthy,
      geminiConfigured,
      activeResearchMethod
    };
  }
}
