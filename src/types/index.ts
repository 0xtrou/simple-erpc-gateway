export interface UpstreamConfig {
  id: string;
  rpcUrl: string;
  statusUrl?: string;
  type: 'full' | 'archive';
  priority: number;
}

export interface ServerConfig {
  host: string;
  port: number;
}

export interface HealthConfig {
  errorRateWindowMs: number;
  maxConsecutiveErrors: number;
  failoverCooldownMs: number;
  nodeStatusTimeoutMs: number;
}

export interface TestingConfig {
  testAddress: string;
  historicalBlockHex: string;
  historicalBlockNumber: number;
  veryOldBlockHex: string;
  veryOldBlockNumber: number;
  timeout: number;
  maxDurationMs: number;
  minDurationMs: number;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  enableColors: boolean;
  logRequests: boolean;
  logUpstreamHealth: boolean;
  logRoutingDecisions: boolean;
  debug: boolean;
}

export interface TimeoutConfig {
  maxErrorTimeoutMs: number;
  defaultResponseTimeoutMs: number;
  defaultNodeStatusTimeoutMs: number;
}

export interface BlockchainConfig {
  estimatedCurrentBlock: number;
  blockTimeSeconds: number;
  fullNodeRetentionMonths: number;
}

export interface ProjectConfig {
  id: string;
  description?: string;
  upstreams: UpstreamConfig[];
  blockHeightBuffer: number;
  errorRateThreshold: number;
  statusCheckInterval: number;
  responseTimeout: number;
  health: HealthConfig;
}

export interface AppConfig {
  server: ServerConfig;
  timeouts: TimeoutConfig;
  blockchain: BlockchainConfig;
  historicalMethods: string[];
  projects: ProjectConfig[];
  defaultProject: string;
  testing: TestingConfig;
  logging: LoggingConfig;
}

export interface UpstreamHealth {
  errors: number[];
  totalRequests: number;
  totalErrors: number;
  consecutiveErrors: number;
  lastError: number | null;
  lastSuccessfulRequest: number;
  isHealthy: boolean;
  failoverUntil: number;
  responseTime: number;
}

export interface LocalNodeStatus {
  earliestBlockHeight: number;
  latestBlockHeight: number;
  catchingUp: boolean;
  lastUpdated: number;
}

export interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: any[];
  id: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}

export interface RoutingContext {
  request: JsonRpcRequest;
  blockNumber: number | 'latest' | null;
  nodeStatus: LocalNodeStatus | null;
  availableUpstreams: UpstreamConfig[];
  upstreamHealth: Map<string, UpstreamHealth>;
  config: ProjectConfig;
  appConfig: AppConfig; // Reference to full app config for global settings
  selectedUpstream?: UpstreamConfig;
  error?: Error;
}

export interface RoutingResult {
  upstream: UpstreamConfig | null;
  reason: string;
  shouldContinue: boolean;
}

export interface RoutingOperation {
  name: string;
  execute(context: RoutingContext): Promise<RoutingResult>;
}

export interface RoutingStrategy {
  registerPipe(operations: RoutingOperation[]): void;
  execute(request: JsonRpcRequest, response: any): Promise<void>;
}

export interface DebugEvent {
  timestamp: number;
  operation: string;
  action: 'start' | 'result' | 'error' | 'skip';
  data: any;
  duration?: number;
}

export interface InstrumentationContext {
  requestId: string;
  startTime: number;
  events: DebugEvent[];
  isDebugEnabled: boolean;
}

export interface DebugResponse extends JsonRpcResponse {
  debug?: {
    requestId: string;
    totalDuration: number;
    strategy: {
      pipeline: string[];
      events: DebugEvent[];
    };
    context: {
      blockNumber: number | 'latest' | null;
      availableUpstreams: string[];
      healthyUpstreams: string[];
      selectedUpstream?: string;
    };
  };
}