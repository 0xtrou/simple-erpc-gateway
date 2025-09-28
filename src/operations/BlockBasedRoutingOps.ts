import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class BlockBasedRoutingOps implements RoutingOperation {
  name = 'BlockBasedSelector';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { blockNumber, nodeStatus, availableUpstreams, request, appConfig } = context;

    if (availableUpstreams.length === 0) {
      return {
        filteredUpstreams: [],
        reason: 'No upstreams available for selection',
        shouldContinue: false
      };
    }

    // Determine if this is a historical method that requires special handling
    const isHistoricalMethod = appConfig.historicalMethods.includes(request.method);

    // For non-historical methods or when block number is null/latest, use first available upstream
    if (!isHistoricalMethod || blockNumber === null || blockNumber === 'latest') {
      // Prefer non-archive nodes for cost optimization
      const nonArchiveUpstreams = availableUpstreams.filter(u => u.type !== 'archive');
      const selectedUpstream = nonArchiveUpstreams.length > 0 ? nonArchiveUpstreams[0] : availableUpstreams[0];

      return {
        filteredUpstreams: availableUpstreams,
        selectedUpstream,
        reason: `Selected ${selectedUpstream.id} for ${blockNumber || 'non-block'} request - type: ${selectedUpstream.type}, priority: ${selectedUpstream.priority}`,
        shouldContinue: false
      };
    }

    // For historical methods with numbered blocks, determine if block is old or recent
    if (!nodeStatus) {
      // Without node status, prefer archive nodes for historical methods
      const archiveUpstreams = availableUpstreams.filter(u => u.type === 'archive');
      const selectedUpstream = archiveUpstreams.length > 0 ? archiveUpstreams[0] : availableUpstreams[0];

      return {
        filteredUpstreams: availableUpstreams,
        selectedUpstream,
        reason: `Selected ${selectedUpstream.id} for historical method (no node status) - type: ${selectedUpstream.type}`,
        shouldContinue: false
      };
    }

    const minAvailableBlock = nodeStatus.earliestBlockHeight + context.config.blockHeightBuffer;

    // If block is too old, prefer archive nodes
    if (blockNumber < minAvailableBlock) {
      const archiveUpstreams = availableUpstreams.filter(u => u.type === 'archive');
      if (archiveUpstreams.length > 0) {
        return {
          filteredUpstreams: availableUpstreams,
          selectedUpstream: archiveUpstreams[0],
          reason: `Selected archive ${archiveUpstreams[0].id} for old block ${blockNumber} < ${minAvailableBlock}`,
          shouldContinue: false
        };
      }
      // Fallback to any available upstream if no archive nodes
      return {
        filteredUpstreams: availableUpstreams,
        selectedUpstream: availableUpstreams[0],
        reason: `Selected ${availableUpstreams[0].id} for old block ${blockNumber} (no archive nodes available)`,
        shouldContinue: false
      };
    }

    // Block is recent enough - prefer non-archive nodes for cost optimization
    const nonArchiveUpstreams = availableUpstreams.filter(u => u.type !== 'archive');
    const selectedUpstream = nonArchiveUpstreams.length > 0 ? nonArchiveUpstreams[0] : availableUpstreams[0];

    return {
      filteredUpstreams: availableUpstreams,
      selectedUpstream,
      reason: `Selected ${selectedUpstream.id} for recent block ${blockNumber} >= ${minAvailableBlock} - type: ${selectedUpstream.type}`,
      shouldContinue: false
    };
  }
}