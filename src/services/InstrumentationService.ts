import { DebugEvent, InstrumentationContext, RoutingContext } from '../types';

export class InstrumentationService {
  private static instance: InstrumentationService;
  private activeContexts = new Map<string, InstrumentationContext>();

  static getInstance(): InstrumentationService {
    if (!InstrumentationService.instance) {
      InstrumentationService.instance = new InstrumentationService();
    }
    return InstrumentationService.instance;
  }

  startRequest(requestId: string, isDebugEnabled: boolean): InstrumentationContext {
    const context: InstrumentationContext = {
      requestId,
      startTime: Date.now(),
      events: [],
      isDebugEnabled
    };

    this.activeContexts.set(requestId, context);

    if (isDebugEnabled) {
      this.logEvent(requestId, 'pipeline', 'start', {
        message: 'Starting strategy pipeline execution'
      });
    }

    return context;
  }

  logEvent(requestId: string, operation: string, action: DebugEvent['action'], data: any, startTime?: number): void {
    const context = this.activeContexts.get(requestId);
    if (!context || !context.isDebugEnabled) return;

    const now = Date.now();
    const event: DebugEvent = {
      timestamp: now,
      operation,
      action,
      data,
      duration: startTime ? now - startTime : undefined
    };

    context.events.push(event);
  }

  logOperationStart(requestId: string, operationName: string, routingContext: RoutingContext): number {
    const startTime = Date.now();

    this.logEvent(requestId, operationName, 'start', {
      blockNumber: routingContext.blockNumber,
      availableUpstreams: routingContext.availableUpstreams.map(u => u.id),
      healthyUpstreams: routingContext.availableUpstreams
        .filter(u => routingContext.upstreamHealth.get(u.id)?.isHealthy)
        .map(u => u.id)
    });

    return startTime;
  }

  logOperationResult(requestId: string, operationName: string, result: any, startTime: number): void {
    this.logEvent(requestId, operationName, 'result', {
      filteredUpstreams: result.filteredUpstreams?.map((u: any) => u.id) || [],
      selectedUpstream: result.selectedUpstream?.id || null,
      reason: result.reason,
      shouldContinue: result.shouldContinue
    }, startTime);
  }

  logOperationError(requestId: string, operationName: string, error: Error, startTime: number): void {
    this.logEvent(requestId, operationName, 'error', {
      message: error.message,
      stack: error.stack
    }, startTime);
  }

  logRequestProxy(requestId: string, upstreamId: string, success: boolean, error?: string): void {
    this.logEvent(requestId, 'request_proxy', success ? 'result' : 'error', {
      upstream: upstreamId,
      success,
      error
    });
  }

  finishRequest(requestId: string, routingContext: RoutingContext): any {
    const context = this.activeContexts.get(requestId);
    if (!context || !context.isDebugEnabled) {
      this.activeContexts.delete(requestId);
      return null;
    }

    const totalDuration = Date.now() - context.startTime;

    this.logEvent(requestId, 'pipeline', 'result', {
      message: 'Strategy pipeline execution completed',
      selectedUpstream: routingContext.selectedUpstream?.id || null
    });

    const debugInfo = {
      requestId,
      totalDuration,
      strategy: {
        pipeline: [...new Set(context.events.map(e => e.operation))],
        events: context.events
      },
      context: {
        blockNumber: routingContext.blockNumber,
        availableUpstreams: routingContext.availableUpstreams.map(u => u.id),
        healthyUpstreams: routingContext.availableUpstreams
          .filter(u => routingContext.upstreamHealth.get(u.id)?.isHealthy)
          .map(u => u.id),
        selectedUpstream: routingContext.selectedUpstream?.id || null
      }
    };

    this.activeContexts.delete(requestId);
    return debugInfo;
  }

  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}