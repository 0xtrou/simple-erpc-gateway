import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class BlockBasedRoutingOps implements RoutingOperation {
  name = 'BlockBasedRouting';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { blockNumber, nodeStatus, availableUpstreams, request, appConfig } = context;

    if (availableUpstreams.length === 0) {
      return {
        filteredUpstreams: [],
        reason: 'No upstreams available for block-based filtering',
        shouldContinue: true
      };
    }

    // Apply EVM start block filtering for any method with a block parameter
    let evmCompatibleUpstreams = availableUpstreams;
    if (typeof blockNumber === 'number') {
      evmCompatibleUpstreams = availableUpstreams.filter(upstream => {
        if (upstream.evmStartBlock && blockNumber < upstream.evmStartBlock) {
          return false; // This upstream doesn't support this pre-EVM block
        }
        return true;
      });

      // If no upstreams support this block due to EVM limitations, continue to next operation
      if (evmCompatibleUpstreams.length === 0) {
        return {
          filteredUpstreams: [],
          reason: `No upstreams support block ${blockNumber} (before EVM start blocks)`,
          shouldContinue: true
        };
      }
    }

    // Determine if this is a historical method that requires special handling
    const isHistoricalMethod = appConfig.historicalMethods.includes(request.method);

    // For non-historical methods or when block number is null/latest, prefer non-archive nodes
    if (!isHistoricalMethod || blockNumber === null || blockNumber === 'latest') {
      // Filter to prefer non-archive nodes for cost optimization, but keep archives as fallback
      const nonArchiveUpstreams = evmCompatibleUpstreams.filter(u => u.type !== 'archive');
      const filteredUpstreams = nonArchiveUpstreams.length > 0 ? nonArchiveUpstreams : evmCompatibleUpstreams;

      return {
        filteredUpstreams,
        reason: `Block-based filter: ${filteredUpstreams.length}/${availableUpstreams.length} upstreams for ${blockNumber || 'non-block'} request`,
        shouldContinue: true
      };
    }

    // For historical methods, prefer archive nodes for old blocks, non-archive for recent blocks
    if (typeof blockNumber === 'number' && blockNumber < 169000000) {
      // Old block - prefer archive nodes
      const archiveUpstreams = evmCompatibleUpstreams.filter(u => u.type === 'archive');
      if (archiveUpstreams.length > 0) {
        return {
          filteredUpstreams: archiveUpstreams,
          reason: `Block-based filter: ${archiveUpstreams.length}/${availableUpstreams.length} archive upstreams for old block ${blockNumber}`,
          shouldContinue: true
        };
      }
    }

    // Recent block or no archive preference - use compatible upstreams, prefer non-archive for cost
    const nonArchiveUpstreams = evmCompatibleUpstreams.filter(u => u.type !== 'archive');
    const filteredUpstreams = nonArchiveUpstreams.length > 0 ? nonArchiveUpstreams : evmCompatibleUpstreams;

    return {
      filteredUpstreams,
      reason: `Block-based filter: ${filteredUpstreams.length}/${availableUpstreams.length} upstreams for block ${blockNumber}`,
      shouldContinue: true
    };
  }
}