import { FastifyReply } from 'fastify';
import { RoutingOperation, RoutingContext, JsonRpcRequest, RoutingStrategy } from '../types';
import { UpstreamService } from '../services/UpstreamService';
import { BlockNumberExtractor } from '../services/BlockNumberExtractor';
import { NodeStatusService } from '../services/NodeStatusService';

export class DefaultRoutingStrategy implements RoutingStrategy {
  private operations: RoutingOperation[] = [];

  constructor(
    private upstreamService: UpstreamService,
    private blockExtractor: BlockNumberExtractor,
    private nodeStatusService: NodeStatusService
  ) {}

  registerPipe(operations: RoutingOperation[]): void {
    this.operations = operations;
  }

  async execute(request: JsonRpcRequest, reply: FastifyReply): Promise<void> {
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
      config: this.upstreamService['config'], // Access config from upstreamService
    };

    // Execute operations in pipeline until one returns an upstream
    for (const operation of this.operations) {
      try {
        const result = await operation.execute(context);

        if (result.upstream) {
          console.log(`✅ ${operation.name}: ${result.reason}`);
          context.selectedUpstream = result.upstream;

          // Execute request and return response
          const response = await this.upstreamService.proxyRequest(result.upstream, request);
          if (response.success) {
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
        context.error = error as Error;
      }
    }

    // If we reach here, all operations failed
    return reply.code(502).send({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'All upstreams failed' },
      id: request.id
    });
  }
}