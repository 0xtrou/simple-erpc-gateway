import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class ErrorRatesOps implements RoutingOperation {
  name = 'RecoveryFilter';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { availableUpstreams, upstreamHealth, config } = context;

    // This is the last resort filter that tries to recover unhealthy upstreams
    // and includes them in the filtered list if they've improved

    const now = Date.now();
    const allUpstreams = [...availableUpstreams];
    const recoveredUpstreams: typeof availableUpstreams = [];

    // Check for recovered upstreams that were previously marked unhealthy
    for (const upstream of allUpstreams) {
      const health = upstreamHealth.get(upstream.id);

      if (health && !health.isHealthy && health.failoverUntil < now) {
        // Check if error rate has improved
        const windowMs = config.health.errorRateWindowMs;
        const recentErrors = health.errors.filter(errorTime => now - errorTime < windowMs);
        const errorRate = recentErrors.length / Math.max(health.totalRequests, 1);

        if (errorRate < config.errorRateThreshold) {
          health.isHealthy = true;
          recoveredUpstreams.push(upstream);
          console.info(`Upstream ${upstream.id} recovered, marking as healthy`);
        }
      }
    }

    // Include recovered upstreams in the result
    const finalUpstreams = availableUpstreams.length > 0
      ? availableUpstreams
      : recoveredUpstreams;

    if (finalUpstreams.length === 0) {
      console.warn('No upstreams available after recovery attempt');
      return {
        filteredUpstreams: allUpstreams, // Last resort: include all upstreams
        reason: 'Last resort: including all upstreams despite health issues',
        shouldContinue: allUpstreams.length > 0
      };
    }

    return {
      filteredUpstreams: finalUpstreams,
      reason: recoveredUpstreams.length > 0
        ? `Recovery filter: ${recoveredUpstreams.length} upstreams recovered, ${finalUpstreams.length} total available`
        : `Recovery filter: ${finalUpstreams.length} upstreams passed through`,
      shouldContinue: true
    };
  }
}