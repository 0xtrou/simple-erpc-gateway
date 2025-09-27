import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class PriorityRoutingOps implements RoutingOperation {
  name = 'PriorityRouting';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { request, availableUpstreams, upstreamHealth, appConfig } = context;

    // Only handle non-block methods - let BlockBasedRouting handle methods with block parameters
    const isHistoricalMethod = appConfig.historicalMethods.includes(request.method);
    if (isHistoricalMethod) {
      return {
        upstream: null,
        reason: `Skipping priority routing for block method ${request.method} - delegating to BlockBasedRouting`,
        shouldContinue: true
      };
    }

    // Try upstreams in priority order, skip archive nodes in first pass
    for (const upstream of availableUpstreams) {
      // Skip expensive archive nodes in first pass
      if (upstream.type === 'archive') continue;

      const health = upstreamHealth.get(upstream.id);
      if (health?.isHealthy) {
        return {
          upstream,
          reason: `Selected ${upstream.id} by priority (${upstream.priority}) for non-block method - type: ${upstream.type}`,
          shouldContinue: false
        };
      }
    }

    return {
      upstream: null,
      reason: 'No healthy cheap upstreams available by priority',
      shouldContinue: true
    };
  }
}