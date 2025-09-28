import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class MetricsHandlingOps implements RoutingOperation {
  name = 'MetricsHandling';

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { availableUpstreams, upstreamHealth, request, selectedUpstream } = context;

    // This is the final operation that always runs to collect metrics and health data
    // Focus on the selected upstream that will actually handle the request

    if (selectedUpstream) {
      const health = upstreamHealth.get(selectedUpstream.id);
      if (health) {
        // Increment total requests counter for the selected upstream
        health.totalRequests = (health.totalRequests || 0) + 1;

        // Record method-specific metrics for detailed analytics
        if (!health.methodStats) {
          health.methodStats = new Map();
        }
        const currentCount = health.methodStats.get(request.method) || 0;
        health.methodStats.set(request.method, currentCount + 1);
      }

      return {
        filteredUpstreams: [selectedUpstream], // Return only the selected upstream
        selectedUpstream,
        reason: `Metrics collected for selected upstream: ${selectedUpstream.id}, method: ${request.method}`,
        shouldContinue: true
      };
    }

    // Fallback if no upstream was selected (shouldn't happen in normal flow)
    return {
      filteredUpstreams: availableUpstreams,
      reason: `No upstream selected - metrics collection skipped`,
      shouldContinue: false
    };
  }
}