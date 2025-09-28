import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class FallbackArchivalRoutingOps implements RoutingOperation {
  name = 'ArchiveFilter';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { availableUpstreams, allUpstreams } = context;

    // Emergency fallback: ONLY add archive upstreams if no upstreams are available
    if (availableUpstreams.length === 0) {
      const archiveUpstreams = allUpstreams.filter(u => u.type === 'archive');

      if (archiveUpstreams.length > 0) {
        return {
          filteredUpstreams: archiveUpstreams,
          reason: `Emergency archive fallback: added ${archiveUpstreams.length} archive upstreams as last resort`,
          shouldContinue: true
        };
      }

      // No upstreams available at all
      return {
        filteredUpstreams: [],
        reason: 'No upstreams available, including archives',
        shouldContinue: false
      };
    }

    // Normal case: if we have upstreams, pass them through without adding expensive archives
    return {
      filteredUpstreams: availableUpstreams,
      reason: `Archive filter: passing through ${availableUpstreams.length} upstreams (no emergency fallback needed)`,
      shouldContinue: true
    };
  }
}