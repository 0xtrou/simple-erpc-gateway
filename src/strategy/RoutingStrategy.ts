import { FastifyReply, FastifyRequest } from 'fastify';
import { RoutingOperation, RoutingContext, JsonRpcRequest, RoutingStrategy, DebugResponse } from '../types';
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
    private nodeStatusService: NodeStatusService
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
    const availableUpstreams = this.upstreamService.getAvailableUpstreams();
    const upstreamHealth = this.upstreamService.getHealthMap();

    const context: RoutingContext = {
      request,
      blockNumber,
      nodeStatus,
      availableUpstreams,
      upstreamHealth,
      config: this.upstreamService['config'],
    };

    // Execute operations in pipeline until one returns an upstream
    for (const operation of this.operations) {
      const operationStartTime = this.instrumentation.logOperationStart(requestId, operation.name, context);

      try {
        const result = await operation.execute(context);
        this.instrumentation.logOperationResult(requestId, operation.name, result, operationStartTime);

        if (result.upstream) {
          console.log(`✅ ${operation.name}: ${result.reason}`);
          context.selectedUpstream = result.upstream;

          // Execute request and return response
          const response = await this.upstreamService.proxyRequest(result.upstream, request);
          this.instrumentation.logRequestProxy(requestId, result.upstream.id, response.success, response.error);

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
            // Continue to next operation if this upstream failed
            console.warn(`❌ ${operation.name}: Request failed - ${response.error}`);
            continue;
          }
        }

        if (!result.shouldContinue) {
          console.log(`🔴 ${operation.name}: ${result.reason} - stopping pipeline`);
          break;
        }

        console.log(`⏭️  ${operation.name}: ${result.reason} - continuing pipeline`);
      } catch (error) {
        console.error(`💥 ${operation.name}: Error -`, error);
        this.instrumentation.logOperationError(requestId, operation.name, error as Error, operationStartTime);
        context.error = error as Error;
      }
    }

    // If we reach here, all operations failed
    const debugInfo = this.instrumentation.finishRequest(requestId, context);
    const errorResponse = {
      jsonrpc: '2.0',
      error: { code: -32603, message: 'All upstreams failed' },
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