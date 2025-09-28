import { FastifyReply, FastifyRequest } from 'fastify';
import { RoutingOperation, RoutingContext, JsonRpcRequest, RoutingStrategy, DebugResponse, AppConfig } from '../types';
import { UpstreamService } from '../services/UpstreamService';
import { BlockNumberExtractor } from '../services/BlockNumberExtractor';
import { NodeStatusService } from '../services/NodeStatusService';
import { InstrumentationService } from '../services/InstrumentationService';

export class DefaultRoutingStrategy implements RoutingStrategy {
  private operations: RoutingOperation[] = [];
  private instrumentation = InstrumentationService.getInstance();

  constructor(
    private upstreamService: UpstreamService,
    private blockExtractor: BlockNumberExtractor,
    private nodeStatusService: NodeStatusService,
    private appConfig: AppConfig
  ) {}

  registerPipe(operations: RoutingOperation[]): void {
    this.operations = operations;
  }

  async execute(request: JsonRpcRequest, reply: FastifyReply, fastifyRequest?: FastifyRequest): Promise<void> {
    // Check if debug mode is enabled
    const isDebugEnabled = fastifyRequest?.query &&
      (fastifyRequest.query as any).debug === '1';

    // Start instrumentation
    const requestId = this.instrumentation.generateRequestId();
    this.instrumentation.startRequest(requestId, !!isDebugEnabled);

    const blockNumber = this.blockExtractor.extract(request.method, request.params);
    const nodeStatus = await this.nodeStatusService.getStatus();
    let availableUpstreams = this.upstreamService.getAvailableUpstreams();
    const upstreamHealth = this.upstreamService.getHealthMap();

    const context: RoutingContext = {
      request,
      blockNumber,
      nodeStatus,
      availableUpstreams,
      upstreamHealth,
      config: this.upstreamService['config'],
      appConfig: this.appConfig,
    };

    let selectedUpstream: any = null;

    // Execute operations in pipeline as filters (map-reduce pattern)
    for (const operation of this.operations) {
      const operationStartTime = this.instrumentation.logOperationStart(requestId, operation.name, context);

      try {
        // Update context with current filtered upstreams
        context.availableUpstreams = availableUpstreams;

        const result = await operation.execute(context);
        this.instrumentation.logOperationResult(requestId, operation.name, result, operationStartTime);

        // Log operation result in debug mode
        if (isDebugEnabled) {
          console.log(`🔄 ${operation.name}: ${result.reason}`);
        }

        // If operation selected an upstream, we're done with filtering
        if (result.selectedUpstream) {
          selectedUpstream = result.selectedUpstream;
          context.selectedUpstream = selectedUpstream;

          if (isDebugEnabled) {
            console.log(`✅ ${operation.name}: Selected ${selectedUpstream.id}`);
          }
          break;
        }

        // Update available upstreams for next operation
        availableUpstreams = result.filteredUpstreams;

        // If no upstreams left or operation says stop, break
        if (!result.shouldContinue || availableUpstreams.length === 0) {
          if (isDebugEnabled) {
            console.log(`🔴 ${operation.name}: Pipeline stopped - ${availableUpstreams.length} upstreams remaining`);
          }
          break;
        }

      } catch (error) {
        console.error(`💥 ${operation.name}: Error -`, error);
        this.instrumentation.logOperationError(requestId, operation.name, error as Error, operationStartTime);
        context.error = error as Error;
      }
    }

    // If no upstream was selected, try first available as last resort
    if (!selectedUpstream && availableUpstreams.length > 0) {
      selectedUpstream = availableUpstreams[0];
      context.selectedUpstream = selectedUpstream;

      if (isDebugEnabled) {
        console.log(`🆘 Last resort: Using ${selectedUpstream.id}`);
      }
    }

    // If we have a selected upstream, execute the request
    if (selectedUpstream) {
      const response = await this.upstreamService.proxyRequest(selectedUpstream, request);
      this.instrumentation.logRequestProxy(requestId, selectedUpstream.id, response.success, response.error);

      if (response.success) {
        const debugInfo = this.instrumentation.finishRequest(requestId, context);

        if (isDebugEnabled && debugInfo) {
          const debugResponse: DebugResponse = {
            ...response.data,
            debug: debugInfo
          };
          return reply.send(debugResponse);
        }

        return reply.send(response.data);
      } else {
        // Request failed, return error
        if (isDebugEnabled) {
          console.warn(`❌ Request to ${selectedUpstream.id} failed: ${response.error}`);
        }
      }
    }

    // If we reach here, no upstreams available or all failed
    const debugInfo = this.instrumentation.finishRequest(requestId, context);
    const errorResponse = {
      jsonrpc: '2.0',
      error: { code: -32603, message: 'No upstreams available or all upstreams failed' },
      id: request.id
    };

    if (isDebugEnabled && debugInfo) {
      const debugErrorResponse: DebugResponse = {
        ...errorResponse,
        debug: debugInfo
      };
      return reply.code(502).send(debugErrorResponse);
    }

    return reply.code(502).send(errorResponse);
  }
}