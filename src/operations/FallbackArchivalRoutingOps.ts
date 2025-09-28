import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class FallbackArchivalRoutingOps implements RoutingOperation {
  name = 'ArchiveFilter';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { availableUpstreams, blockNumber, request, appConfig } = context;

    // If we reach this point, it means previous filters didn't work
    // This is an emergency filter that tries to provide archive nodes as fallback

    const isHistoricalMethod = appConfig.historicalMethods.includes(request.method);

    if (isHistoricalMethod && typeof blockNumber === 'number') {
      // For historical methods with numbered blocks, strongly prefer archive nodes
      const archiveUpstreams = availableUpstreams.filter(u => u.type === 'archive');

      if (archiveUpstreams.length > 0) {
        return {
          filteredUpstreams: archiveUpstreams,
          reason: `Emergency archive filter: ${archiveUpstreams.length} archive nodes for historical block ${blockNumber}`,
          shouldContinue: true
        };
      }
    }

    // If no archive nodes or not a historical method, pass through all available upstreams
    return {
      filteredUpstreams: availableUpstreams,
      reason: `Emergency fallback: passing through ${availableUpstreams.length} available upstreams`,
      shouldContinue: availableUpstreams.length > 0
    };
  }
}