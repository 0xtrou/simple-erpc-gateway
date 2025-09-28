import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class BlockBasedRoutingOps implements RoutingOperation {
  name = 'BlockBasedRouting';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { blockNumber, nodeStatus, availableUpstreams, request, appConfig } = context;

    if (availableUpstreams.length === 0) {
      return {
        filteredUpstreams: [],
        reason: 'No upstreams available for block-based filtering',
        shouldContinue: false
      };
    }

    // Determine if this is a historical method that requires special handling
    const isHistoricalMethod = appConfig.historicalMethods.includes(request.method);

    // For non-historical methods or when block number is null/latest, prefer non-archive nodes
    if (!isHistoricalMethod || blockNumber === null || blockNumber === 'latest') {
      // Filter to prefer non-archive nodes for cost optimization, but keep archives as fallback
      const nonArchiveUpstreams = availableUpstreams.filter(u => u.type !== 'archive');
      const filteredUpstreams = nonArchiveUpstreams.length > 0 ? nonArchiveUpstreams : availableUpstreams;

      return {
        filteredUpstreams,
        reason: `Block-based filter: ${filteredUpstreams.length}/${availableUpstreams.length} upstreams for ${blockNumber || 'non-block'} request`,
        shouldContinue: true
      };
    }

    // For historical methods with numbered blocks, determine if block is old or recent
    if (!nodeStatus) {
      // Without node status, prefer archive nodes for historical methods
      const archiveUpstreams = availableUpstreams.filter(u => u.type === 'archive');
      const filteredUpstreams = archiveUpstreams.length > 0 ? archiveUpstreams : availableUpstreams;

      return {
        filteredUpstreams,
        reason: `Block-based filter: ${filteredUpstreams.length}/${availableUpstreams.length} upstreams for historical method (no node status)`,
        shouldContinue: true
      };
    }

    const minAvailableBlock = nodeStatus.earliestBlockHeight + context.config.blockHeightBuffer;

    // If block is too old, strongly prefer archive nodes
    if (blockNumber < minAvailableBlock) {
      const archiveUpstreams = availableUpstreams.filter(u => u.type === 'archive');
      if (archiveUpstreams.length > 0) {
        return {
          filteredUpstreams: archiveUpstreams,
          reason: `Block-based filter: ${archiveUpstreams.length}/${availableUpstreams.length} archive upstreams for old block ${blockNumber} < ${minAvailableBlock}`,
          shouldContinue: true
        };
      }
      // Fallback to any available upstream if no archive nodes
      return {
        filteredUpstreams: availableUpstreams,
        reason: `Block-based filter: ${availableUpstreams.length} upstreams for old block ${blockNumber} (no archive nodes available)`,
        shouldContinue: true
      };
    }

    // Block is recent enough - prefer non-archive nodes for cost optimization
    const nonArchiveUpstreams = availableUpstreams.filter(u => u.type !== 'archive');
    const filteredUpstreams = nonArchiveUpstreams.length > 0 ? nonArchiveUpstreams : availableUpstreams;

    return {
      filteredUpstreams,
      reason: `Block-based filter: ${filteredUpstreams.length}/${availableUpstreams.length} non-archive upstreams for recent block ${blockNumber} >= ${minAvailableBlock}`,
      shouldContinue: true
    };
  }
}