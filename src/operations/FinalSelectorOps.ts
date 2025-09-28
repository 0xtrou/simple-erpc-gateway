import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class FinalSelectorOps implements RoutingOperation {
  name = 'FinalSelector';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { availableUpstreams } = context;

    if (availableUpstreams.length === 0) {
      return {
        filteredUpstreams: [],
        reason: 'No upstreams available for final selection',
        shouldContinue: false
      };
    }

    // Simple strategy: pick the first upstream (they should be sorted by priority by now)
    const selectedUpstream = availableUpstreams[0];

    return {
      filteredUpstreams: availableUpstreams,
      selectedUpstream,
      reason: `Final selection: chose ${selectedUpstream.id} from ${availableUpstreams.length} candidates`,
      shouldContinue: true // Continue to MetricsHandlingOps
    };
  }
}