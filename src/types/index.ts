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

export interface AppConfig {
  server: ServerConfig;
  upstreams: UpstreamConfig[];
  blockHeightBuffer: number;
  errorRateThreshold: number;
  statusCheckInterval: number;
  responseTimeout: number;
  health: HealthConfig;
  historicalMethods: string[];
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
  config: AppConfig;
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