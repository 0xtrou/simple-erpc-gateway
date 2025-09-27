import { LoggingConfig } from '../types';

export class Logger {
  private static instance: Logger;
  private config: LoggingConfig;

  private constructor(config: LoggingConfig) {
    this.config = config;
  }

  static initialize(config: LoggingConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      // Fallback config if not initialized
      Logger.instance = new Logger({
        level: 'info',
        enableColors: true,
        logRequests: true,
        logUpstreamHealth: true,
        logRoutingDecisions: true
      });
    }
    return Logger.instance;
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.level);
    const messageLevel = levels.indexOf(level);
    return messageLevel >= configLevel;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const prefix = this.config.enableColors ? this.getColoredPrefix(level) : `[${level.toUpperCase()}]`;
    return `${timestamp} ${prefix} ${message}`;
  }

  private getColoredPrefix(level: string): string {
    const colors = {
      debug: '\x1b[36m[DEBUG]\x1b[0m',  // Cyan
      info: '\x1b[32m[INFO]\x1b[0m',    // Green
      warn: '\x1b[33m[WARN]\x1b[0m',    // Yellow
      error: '\x1b[31m[ERROR]\x1b[0m'   // Red
    };
    return colors[level as keyof typeof colors] || `[${level.toUpperCase()}]`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }

  // Specific logging methods for different concerns
  logRequest(method: string, debugMode: boolean = false): void {
    if (this.config.logRequests) {
      this.info(`🔄 Processing ${method} request${debugMode ? ' (DEBUG MODE)' : ''}`);
    }
  }

  logRoutingDecision(operationName: string, reason: string, success: boolean): void {
    if (this.config.logRoutingDecisions) {
      if (success) {
        this.info(`✅ ${operationName}: ${reason}`);
      } else {
        this.info(`⏭️  ${operationName}: ${reason} - continuing pipeline`);
      }
    }
  }

  logRoutingStop(operationName: string, reason: string): void {
    if (this.config.logRoutingDecisions) {
      this.info(`🔴 ${operationName}: ${reason} - stopping pipeline`);
    }
  }

  logRoutingError(operationName: string, error: Error): void {
    if (this.config.logRoutingDecisions) {
      this.error(`💥 ${operationName}: Error - ${error.message}`);
    }
  }

  logUpstreamHealth(upstreamId: string, isHealthy: boolean, errorRate?: number, consecutiveErrors?: number): void {
    if (this.config.logUpstreamHealth) {
      if (isHealthy) {
        this.info(`Upstream ${upstreamId} marked as healthy${errorRate !== undefined ? `. Error rate: ${errorRate.toFixed(3)}` : ''}`);
      } else {
        this.warn(`Upstream ${upstreamId} marked as unhealthy${errorRate !== undefined ? `. Error rate: ${errorRate.toFixed(3)}` : ''}${consecutiveErrors !== undefined ? `, consecutive errors: ${consecutiveErrors}` : ''}`);
      }
    }
  }

  logRequestFailure(upstreamId: string, error: string): void {
    this.warn(`❌ Request to ${upstreamId} failed - ${error}`);
  }

  logRequestSuccess(operationName: string, reason: string): void {
    if (this.config.logRoutingDecisions) {
      this.info(`✅ ${operationName}: ${reason}`);
    }
  }

  logUpstreamRecovery(upstreamId: string): void {
    if (this.config.logUpstreamHealth) {
      this.info(`Upstream ${upstreamId} recovered, marking as healthy`);
    }
  }

  logNodeStatus(earliestBlock: number, latestBlock: number, catchingUp: boolean): void {
    this.info(`Local node status: earliest=${earliestBlock}, latest=${latestBlock}, catching_up=${catchingUp}`);
  }
}