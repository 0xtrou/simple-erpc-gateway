import { RoutingOperation, RoutingContext, RoutingResult } from '../types';

export class MethodRoutingOps implements RoutingOperation {
  name = 'MethodRouting';

  private isMethodIgnored(method: string, ignoredMethods: string[]): boolean {
    return ignoredMethods.some(ignoredMethod => {
      if (ignoredMethod.endsWith('*')) {
        // Wildcard pattern matching (e.g., "debug_*" matches "debug_traceTransaction")
        const prefix = ignoredMethod.slice(0, -1);
        return method.startsWith(prefix);
      }
      // Exact match
      return method === ignoredMethod;
    });
  }

  async execute(context: RoutingContext): Promise<RoutingResult> {
    const { request, availableUpstreams } = context;

    // Filter upstreams that support this method
    const filteredUpstreams = availableUpstreams.filter(upstream => {
      // Include upstream if it doesn't have ignoredMethods or if it doesn't ignore this method
      if (!upstream.ignoredMethods) {
        return true;
      }
      return !this.isMethodIgnored(request.method, upstream.ignoredMethods);
    });

    const filteredCount = filteredUpstreams.length;
    const totalCount = availableUpstreams.length;

    return {
      filteredUpstreams,
      reason: `Filtered ${filteredCount}/${totalCount} upstreams that support method ${request.method}`,
      shouldContinue: filteredCount > 0
    };
  }
}