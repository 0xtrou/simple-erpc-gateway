#!/usr/bin/env node

import fastify from 'fastify';
import fs from 'fs';
import path from 'path';

import { AppConfig, JsonRpcRequest } from './types';
import { DefaultRoutingStrategy } from './strategy/RoutingStrategy';
import { UpstreamService } from './services/UpstreamService';
import { BlockNumberExtractor } from './services/BlockNumberExtractor';
import { NodeStatusService } from './services/NodeStatusService';

// Import routing operations
import { PriorityRoutingOps } from './operations/PriorityRoutingOps';
import { BlockBasedRoutingOps } from './operations/BlockBasedRoutingOps';
import { FallbackArchivalRoutingOps } from './operations/FallbackArchivalRoutingOps';
import { ErrorRatesOps } from './operations/ErrorRatesOps';

// Global state
let config: AppConfig;
let strategy: DefaultRoutingStrategy;
let upstreamService: UpstreamService;
let nodeStatusService: NodeStatusService;

// Create Fastify server
const server = fastify({ logger: true });

// Load configuration
function loadConfig(): void {
  try {
    const configPath = path.join(__dirname, '../config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('✅ Configuration loaded successfully');
    initializeServices();
  } catch (error) {
    console.error('❌ Failed to load configuration:', error);
    process.exit(1);
  }
}

// Initialize services and strategy
function initializeServices(): void {
  // Create services
  upstreamService = new UpstreamService(config);
  const blockExtractor = new BlockNumberExtractor(config);
  nodeStatusService = new NodeStatusService(config);

  // Create strategy
  strategy = new DefaultRoutingStrategy(upstreamService, blockExtractor, nodeStatusService);

  // Register pipeline operations in order
  const operations = [
    new PriorityRoutingOps(),
    new BlockBasedRoutingOps(),
    new FallbackArchivalRoutingOps(),
    new ErrorRatesOps()
  ];

  strategy.registerPipe(operations);

  console.log('✅ Services and routing strategy initialized');
  console.log(`📋 Registered ${operations.length} routing operations:`, operations.map(op => op.name));
}

// Main request handler
async function handleRequest(request: any, reply: any): Promise<void> {
  const requestBody: JsonRpcRequest = request.body;

  try {
    // Validate JSON-RPC request
    if (!requestBody || !requestBody.method) {
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: requestBody?.id || null
      });
    }

    console.log(`🔄 Processing ${requestBody.method} request${request.query?.debug === '1' ? ' (DEBUG MODE)' : ''}`);

    // Execute routing strategy with request object for debug support
    await strategy.execute(requestBody, reply, request);

  } catch (error) {
    console.error('💥 Request handling error:', error);
    return reply.code(500).send({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal error' },
      id: requestBody?.id || null
    });
  }
}

// Health check endpoint
server.get('/health', async () => {
  const status = {
    upstreams: upstreamService.getHealthStatus(),
    localNode: await nodeStatusService.getStatus(),
    timestamp: new Date().toISOString()
  };

  return status;
});

// Metrics endpoint
server.get('/metrics', async () => {
  const metrics = {
    upstreams: upstreamService.getHealthStatus(),
    localNode: await nodeStatusService.getStatus(),
    config: {
      errorRateThreshold: config.errorRateThreshold,
      blockHeightBuffer: config.blockHeightBuffer
    }
  };

  return metrics;
});

// Main RPC endpoint
server.post('/', {
  handler: handleRequest
});

// Graceful shutdown
async function gracefulShutdown(): Promise<void> {
  console.log('🔄 Shutting down gracefully...');
  try {
    await server.close();
    console.log('✅ Server closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
async function start(): Promise<void> {
  try {
    loadConfig();

    await server.listen({
      host: config.server.host,
      port: config.server.port
    });

    console.log(`🚀 Simple eRPC Gateway running on ${config.server.host}:${config.server.port}`);
    console.log(`📊 Health endpoint: http://${config.server.host}:${config.server.port}/health`);
    console.log(`📈 Metrics endpoint: http://${config.server.host}:${config.server.port}/metrics`);

    // Initial status check
    await nodeStatusService.getStatus();

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

export { server, start, loadConfig };