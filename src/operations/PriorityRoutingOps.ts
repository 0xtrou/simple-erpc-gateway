import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class PriorityRoutingOps implements RoutingOperation {
  name = 'HealthFiltering';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { availableUpstreams, upstreamHealth } = context;

    // Filter healthy upstreams and sort by priority
    const healthyUpstreams = availableUpstreams
      .filter(upstream => {
        const health = upstreamHealth.get(upstream.id);
        return health?.isHealthy === true;
      })
      .sort((a, b) => a.priority - b.priority); // Sort by priority (lower number = higher priority)

    const healthyCount = healthyUpstreams.length;
    const totalCount = availableUpstreams.length;

    return {
      filteredUpstreams: healthyUpstreams,
      reason: `Filtered ${healthyCount}/${totalCount} healthy upstreams, sorted by priority`,
      shouldContinue: healthyCount > 0
    };
  }
}