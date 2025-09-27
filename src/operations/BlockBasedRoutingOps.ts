import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class BlockBasedRoutingOps implements RoutingOperation {
  name = 'BlockBasedRouting';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { blockNumber, nodeStatus, availableUpstreams, upstreamHealth } = context;

    // Only apply block-based routing if we have a block number and node status
    if (blockNumber === null || blockNumber === 'latest' || !nodeStatus) {
      return {
        upstream: null,
        reason: 'No block number or node status available for block-based routing',
        shouldContinue: true
      };
    }

    const minAvailableBlock = nodeStatus.earliestBlockHeight + context.config.blockHeightBuffer;

    // If block is too old, we need archive node - skip for now
    if (blockNumber < minAvailableBlock) {
      return {
        upstream: null,
        reason: `Block ${blockNumber} < ${minAvailableBlock} (requires archive node)`,
        shouldContinue: true
      };
    }

    // Block is recent enough - try cheap nodes by priority
    for (const upstream of availableUpstreams) {
      if (upstream.type === 'archive') continue; // Skip archive nodes

      const health = upstreamHealth.get(upstream.id);
      if (health?.isHealthy) {
        return {
          upstream,
          reason: `Block ${blockNumber} >= ${minAvailableBlock} - using cheap node ${upstream.id}`,
          shouldContinue: false
        };
      }
    }

    return {
      upstream: null,
      reason: 'No healthy cheap nodes available for recent block',
      shouldContinue: true
    };
  }
}