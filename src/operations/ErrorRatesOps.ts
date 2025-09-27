import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class ErrorRatesOps implements RoutingOperation {
  name = 'ErrorRatesRecovery';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { availableUpstreams, upstreamHealth, config } = context;

    console.warn('All preferred upstreams failed, checking for recovered upstreams');

    // Check if any upstreams have recovered from cooldown
    const now = Date.now();
    let recoveredUpstream = null;

    for (const upstream of availableUpstreams) {
      const health = upstreamHealth.get(upstream.id);
      if (health && !health.isHealthy && health.failoverUntil < now) {
        // Check if error rate has improved
        const windowMs = config.health.errorRateWindowMs;
        const recentErrors = health.errors.filter(errorTime => now - errorTime < windowMs);
        const errorRate = recentErrors.length / Math.max(health.totalRequests, 1);

        if (errorRate < config.errorRateThreshold) {
          health.isHealthy = true;
          recoveredUpstream = upstream;
          console.info(`Upstream ${upstream.id} recovered, marking as healthy`);
          break;
        }
      }
    }

    if (recoveredUpstream) {
      return {
        upstream: recoveredUpstream,
        reason: `Recovered upstream ${recoveredUpstream.id} after error rate improvement`,
        shouldContinue: false
      };
    }

    // If no recovered upstreams, try any available upstream as last resort
    const lastResortUpstream = availableUpstreams[0];
    if (lastResortUpstream) {
      return {
        upstream: lastResortUpstream,
        reason: `Last resort: using ${lastResortUpstream.id} despite potential health issues`,
        shouldContinue: false
      };
    }

    return {
      upstream: null,
      reason: 'No upstreams available at all',
      shouldContinue: false
    };
  }
}