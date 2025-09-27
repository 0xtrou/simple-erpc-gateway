import fetch from 'node-fetch';
import { UpstreamConfig, UpstreamHealth, JsonRpcRequest, AppConfig } from '../types';

export interface ProxyResult {
  success: boolean;
  data?: any;
  error?: string;
  responseTime: number;
}

export class UpstreamService {
  private upstreamHealth: Map<string, UpstreamHealth> = new Map();

  constructor(private config: AppConfig) {
    this.initializeHealth();
  }

  private initializeHealth(): void {
    this.config.upstreams.forEach(upstream => {
      this.upstreamHealth.set(upstream.id, {
        errors: [],
        totalRequests: 0,
        totalErrors: 0,
        consecutiveErrors: 0,
        lastError: null,
        lastSuccessfulRequest: Date.now(),
        isHealthy: true,
        failoverUntil: 0,
        responseTime: 0
      });
    });
  }

  getAvailableUpstreams(): UpstreamConfig[] {
    return this.config.upstreams.sort((a, b) => a.priority - b.priority);
  }

  getHealthMap(): Map<string, UpstreamHealth> {
    return this.upstreamHealth;
  }

  private calculateErrorRate(upstreamId: string): number {
    const health = this.upstreamHealth.get(upstreamId);
    if (!health || health.totalRequests === 0) return 0;

    const windowMs = this.config.health.errorRateWindowMs;
    const now = Date.now();

    // Filter errors within the time window
    const recentErrors = health.errors.filter(errorTime => now - errorTime < windowMs);
    health.errors = recentErrors; // Clean up old errors

    if (health.totalRequests === 0) return 0;
    return recentErrors.length / Math.max(health.totalRequests, 1);
  }

  private recordRequestResult(upstreamId: string, success: boolean, responseTime = 0): void {
    const health = this.upstreamHealth.get(upstreamId);
    if (!health) return;

    health.totalRequests++;
    health.responseTime = responseTime;

    if (success) {
      health.consecutiveErrors = 0;
      health.lastSuccessfulRequest = Date.now();
    } else {
      health.totalErrors++;
      health.consecutiveErrors++;
      health.lastError = Date.now();
      health.errors.push(Date.now());

      // Check if should mark as unhealthy
      const errorRate = this.calculateErrorRate(upstreamId);
      if (errorRate > this.config.errorRateThreshold || health.consecutiveErrors >= this.config.health.maxConsecutiveErrors) {
        health.isHealthy = false;
        health.failoverUntil = Date.now() + this.config.health.failoverCooldownMs;
        console.warn(`Upstream ${upstreamId} marked as unhealthy. Error rate: ${errorRate.toFixed(3)}, consecutive errors: ${health.consecutiveErrors}`);
      }
    }

    // Check if should mark as healthy again
    if (success && health.failoverUntil < Date.now()) {
      const errorRate = this.calculateErrorRate(upstreamId);
      if (errorRate < this.config.errorRateThreshold && health.consecutiveErrors === 0) {
        health.isHealthy = true;
        console.info(`Upstream ${upstreamId} marked as healthy again. Error rate: ${errorRate.toFixed(3)}`);
      }
    }
  }

  async proxyRequest(upstream: UpstreamConfig, requestBody: JsonRpcRequest): Promise<ProxyResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(upstream.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        timeout: this.config.responseTimeout
      } as any);

      const responseTime = Date.now() - startTime;
      const responseBody = await response.json() as any;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.recordRequestResult(upstream.id, true, responseTime);
      return { success: true, data: responseBody, responseTime };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordRequestResult(upstream.id, false, responseTime);
      console.error(`Request to ${upstream.id} failed:`, (error as Error).message);
      return { success: false, error: (error as Error).message, responseTime };
    }
  }

  isUpstreamHealthy(upstreamId: string): boolean {
    const health = this.upstreamHealth.get(upstreamId);
    return health?.isHealthy ?? false;
  }

  markUpstreamRecovered(upstreamId: string): void {
    const health = this.upstreamHealth.get(upstreamId);
    if (!health) return;

    const now = Date.now();
    if (!health.isHealthy && health.failoverUntil < now) {
      const errorRate = this.calculateErrorRate(upstreamId);
      if (errorRate < this.config.errorRateThreshold) {
        health.isHealthy = true;
        console.info(`Upstream ${upstreamId} recovered, marking as healthy`);
      }
    }
  }

  getHealthStatus() {
    const status: Record<string, any> = {};

    this.config.upstreams.forEach(upstream => {
      const health = this.upstreamHealth.get(upstream.id);
      status[upstream.id] = {
        healthy: health?.isHealthy || false,
        errorRate: this.calculateErrorRate(upstream.id),
        totalRequests: health?.totalRequests || 0,
        totalErrors: health?.totalErrors || 0,
        consecutiveErrors: health?.consecutiveErrors || 0,
        lastSuccessfulRequest: health?.lastSuccessfulRequest || null,
        responseTime: health?.responseTime || 0,
        type: upstream.type,
        priority: upstream.priority
      };
    });

    return status;
  }
}