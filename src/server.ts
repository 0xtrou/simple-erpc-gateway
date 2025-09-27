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
let projectServices: Map<string, {
  upstreamService: UpstreamService;
  nodeStatusService: NodeStatusService;
  strategy: DefaultRoutingStrategy;
}> = new Map();

// Create Fastify server
const server = fastify({ logger: true });

// Load configuration
function loadConfig(): void {
  try {
    // Determine config path based on execution context
    // In dev mode (ts-node): __dirname = /Users/.../erpc/src -> ../config.json
    // In prod mode: __dirname = /Users/.../erpc/dist/src -> ../../config.json
    const isDev = __dirname.includes('/src') && !__dirname.includes('/dist/src');
    const configPath = isDev
      ? path.join(__dirname, '../config.json')
      : path.join(__dirname, '../../config.json');

    console.log(`🔍 Loading config from: ${configPath}`);
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('✅ Configuration loaded successfully');
    initializeServices();
  } catch (error) {
    console.error('❌ Failed to load configuration:', error);
    process.exit(1);
  }
}

// Initialize services and strategy for each project
function initializeServices(): void {
  console.log(`🔧 Initializing services for ${config.projects.length} projects...`);

  for (const project of config.projects) {
    console.log(`📋 Setting up project: ${project.id} - ${project.description || 'No description'}`);

    // Create services for this project
    const upstreamService = new UpstreamService(project);
    const blockExtractor = new BlockNumberExtractor(project);
    const nodeStatusService = new NodeStatusService(project);

    // Create strategy
    const strategy = new DefaultRoutingStrategy(upstreamService, blockExtractor, nodeStatusService);

    // Register pipeline operations in order
    const operations = [
      new PriorityRoutingOps(),
      new BlockBasedRoutingOps(),
      new FallbackArchivalRoutingOps(),
      new ErrorRatesOps()
    ];

    strategy.registerPipe(operations);

    // Store project services
    projectServices.set(project.id, {
      upstreamService,
      nodeStatusService,
      strategy
    });

    console.log(`   ✅ Project ${project.id}: ${project.upstreams.length} upstreams, ${operations.length} routing operations`);
  }

  console.log(`✅ All projects initialized. Default project: ${config.defaultProject}`);
}

// Project-specific request handler factory
function createProjectHandler(projectId: string) {
  return async function handleProjectRequest(request: any, reply: any): Promise<void> {
    const requestBody: JsonRpcRequest = request.body;
    const projectService = projectServices.get(projectId);

    if (!projectService) {
      return reply.code(500).send({
        jsonrpc: '2.0',
        error: { code: -32603, message: `Project ${projectId} not initialized` },
        id: requestBody?.id || null
      });
    }

    try {
      // Validate JSON-RPC request
      if (!requestBody || !requestBody.method) {
        return reply.code(400).send({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
          id: requestBody?.id || null
        });
      }

      console.log(`🔄 Processing ${requestBody.method} request for project ${projectId}${request.query?.debug === '1' ? ' (DEBUG MODE)' : ''}`);

      // Execute routing strategy with request object for debug support
      await projectService.strategy.execute(requestBody, reply, request);

    } catch (error) {
      console.error(`💥 Request handling error for project ${projectId}:`, error);
      return reply.code(500).send({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: requestBody?.id || null
      });
    }
  };
}

// Health check endpoint
server.get('/health', async (request) => {
  const projectId = (request.query as any)?.project || config.defaultProject;
  const projectService = projectServices.get(projectId);

  if (!projectService) {
    return {
      error: `Invalid project: ${projectId}`,
      availableProjects: Array.from(projectServices.keys()),
      timestamp: new Date().toISOString()
    };
  }

  const status = {
    project: projectId,
    upstreams: projectService.upstreamService.getHealthStatus(),
    localNode: await projectService.nodeStatusService.getStatus(),
    timestamp: new Date().toISOString()
  };

  return status;
});

// Metrics endpoint
server.get('/metrics', async (request) => {
  const projectId = (request.query as any)?.project || config.defaultProject;
  const projectService = projectServices.get(projectId);

  if (!projectService) {
    return {
      error: `Invalid project: ${projectId}`,
      availableProjects: Array.from(projectServices.keys()),
      timestamp: new Date().toISOString()
    };
  }

  const projectConfig = config.projects.find(p => p.id === projectId)!;
  const metrics = {
    project: projectId,
    upstreams: projectService.upstreamService.getHealthStatus(),
    localNode: await projectService.nodeStatusService.getStatus(),
    config: {
      errorRateThreshold: projectConfig.errorRateThreshold,
      blockHeightBuffer: projectConfig.blockHeightBuffer,
      responseTimeout: projectConfig.responseTimeout,
      historicalMethods: projectConfig.historicalMethods.length
    }
  };

  return metrics;
});

// Register project-specific endpoints
function registerProjectEndpoints(): void {
  for (const [projectId, services] of projectServices) {
    const projectHandler = createProjectHandler(projectId);

    // Register main project endpoint
    server.post(`/${projectId}`, {
      handler: projectHandler
    });

    // Register project-specific health endpoint
    server.get(`/${projectId}/health`, async (request) => {
      const status = {
        project: projectId,
        upstreams: services.upstreamService.getHealthStatus(),
        localNode: await services.nodeStatusService.getStatus(),
        timestamp: new Date().toISOString()
      };
      return status;
    });

    // Register project-specific metrics endpoint
    server.get(`/${projectId}/metrics`, async (request) => {
      const projectConfig = config.projects.find(p => p.id === projectId)!;
      const metrics = {
        project: projectId,
        upstreams: services.upstreamService.getHealthStatus(),
        localNode: await services.nodeStatusService.getStatus(),
        config: {
          errorRateThreshold: projectConfig.errorRateThreshold,
          blockHeightBuffer: projectConfig.blockHeightBuffer,
          responseTimeout: projectConfig.responseTimeout,
          historicalMethods: projectConfig.historicalMethods.length
        }
      };
      return metrics;
    });

    console.log(`📍 Registered endpoints for project ${projectId}:`);
    console.log(`   POST /${projectId} - RPC requests`);
    console.log(`   GET  /${projectId}/health - Health check`);
    console.log(`   GET  /${projectId}/metrics - Metrics`);
  }

  // Also register default project at root
  const defaultHandler = createProjectHandler(config.defaultProject);
  server.post('/', {
    handler: defaultHandler
  });

  console.log(`📍 Default project (${config.defaultProject}) also available at:`);
  console.log(`   POST / - RPC requests (defaults to ${config.defaultProject})`);
}

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
    registerProjectEndpoints();

    await server.listen({
      host: config.server.host,
      port: config.server.port
    });

    console.log(`🚀 Simple eRPC Gateway running on ${config.server.host}:${config.server.port}`);
    console.log(`📊 Health endpoint: http://${config.server.host}:${config.server.port}/health`);
    console.log(`📈 Metrics endpoint: http://${config.server.host}:${config.server.port}/metrics`);

    // Initial status check for all projects
    for (const [projectId, services] of projectServices) {
      console.log(`📡 Checking status for project ${projectId}...`);
      await services.nodeStatusService.getStatus();
    }

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

export { server, start, loadConfig };