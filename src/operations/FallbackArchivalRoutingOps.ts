import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class FallbackArchivalRoutingOps implements RoutingOperation {
  name = 'FallbackArchivalRouting';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { availableUpstreams, upstreamHealth, blockNumber } = context;

    // Try archive nodes for historical blocks or as fallback
    for (const upstream of availableUpstreams) {
      if (upstream.type !== 'archive') continue;

      const health = upstreamHealth.get(upstream.id);
      if (health?.isHealthy) {
        const reason = blockNumber !== null && blockNumber !== 'latest'
          ? `Using archive node ${upstream.id} for historical block ${blockNumber}`
          : `Fallback to archive node ${upstream.id}`;

        return {
          upstream,
          reason,
          shouldContinue: false
        };
      }
    }

    return {
      upstream: null,
      reason: 'No healthy archive nodes available',
      shouldContinue: true
    };
  }
}