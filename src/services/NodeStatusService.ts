import fetch from 'node-fetch';
import { LocalNodeStatus, ProjectConfig, AppConfig } from '../types';
import { UpstreamService } from './UpstreamService';

export class NodeStatusService {
  private localNodeStatus: LocalNodeStatus | null = null;
  private lastStatusCheck = 0;
  private upstreamService: UpstreamService | null = null;

  constructor(private config: ProjectConfig, private appConfig: AppConfig) {}

  // Set the upstream service reference for health tracking
  setUpstreamService(upstreamService: UpstreamService) {
    this.upstreamService = upstreamService;
  }

  async getStatus(): Promise<LocalNodeStatus | null> {
    const now = Date.now();
    if (now - this.lastStatusCheck < this.config.statusCheckInterval) {
      return this.localNodeStatus;
    }

    try {
      // Find the first upstream with a statusUrl (usually local node)
      const localUpstream = this.config.upstreams.find(u => u.statusUrl);
      const statusUrl = localUpstream?.statusUrl;

      if (!statusUrl) {
        // No status URL configured - assume node is a recent full node (not archive)
        // Most full nodes only keep recent blocks based on configuration
        const estimatedCurrentBlock = this.appConfig.blockchain.estimatedCurrentBlock;
        const secondsInMonth = 30 * 24 * 60 * 60; // 30 days per month
        const blocksInRetentionPeriod = Math.floor(
          (this.appConfig.blockchain.fullNodeRetentionMonths * secondsInMonth) /
          this.appConfig.blockchain.blockTimeSeconds
        );

        this.localNodeStatus = {
          earliestBlockHeight: estimatedCurrentBlock - blocksInRetentionPeriod,
          latestBlockHeight: estimatedCurrentBlock,
          catchingUp: false,
          lastUpdated: now
        };
        this.lastStatusCheck = now;
        console.log(`No status URL configured - assuming recent full node with blocks ${this.localNodeStatus.earliestBlockHeight} to ${this.localNodeStatus.latestBlockHeight} (${this.appConfig.blockchain.fullNodeRetentionMonths} month retention)`);
        return this.localNodeStatus;
      }

      const timeoutMs = Math.min(this.config.health.nodeStatusTimeoutMs, this.appConfig.timeouts.maxErrorTimeoutMs);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(statusUrl, {
          signal: controller.signal,
          timeout: timeoutMs
        } as any);

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }

        const data = await response.json() as any;
        this.localNodeStatus = {
          earliestBlockHeight: parseInt(data.sync_info.earliest_block_height),
          latestBlockHeight: parseInt(data.sync_info.latest_block_height),
          catchingUp: data.sync_info.catching_up,
          lastUpdated: now
        };

        this.lastStatusCheck = now;
        console.log(`Local node status: earliest=${this.localNodeStatus.earliestBlockHeight}, latest=${this.localNodeStatus.latestBlockHeight}, catching_up=${this.localNodeStatus.catchingUp}`);

        // Mark the local upstream as healthy since status check succeeded
        if (this.upstreamService && localUpstream) {
          this.upstreamService.recordRequestResult(localUpstream.id, true);
        }

        return this.localNodeStatus;
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Mark the local upstream as unhealthy on timeout/error
        if (this.upstreamService && localUpstream) {
          this.upstreamService.recordRequestResult(localUpstream.id, false);

          // Special handling for timeout/abort errors
          if (fetchError instanceof Error &&
              (fetchError.name === 'AbortError' ||
               fetchError.message.includes('timeout') ||
               fetchError.message.includes('ECONNREFUSED'))) {
            console.warn(`Local node status check timeout/connection failed for ${localUpstream.id} after ${timeoutMs}ms - marked as unhealthy`);
          }
        }

        throw fetchError;
      }
    } catch (error) {
      console.error('Failed to check local node status:', (error as Error).message);

      // Fallback to default status if fetching fails
      // Assume recent full node (not archive) when status fetch fails
      const estimatedCurrentBlock = this.appConfig.blockchain.estimatedCurrentBlock;
      const secondsInMonth = 30 * 24 * 60 * 60; // 30 days per month
      const blocksInRetentionPeriod = Math.floor(
        (this.appConfig.blockchain.fullNodeRetentionMonths * secondsInMonth) /
        this.appConfig.blockchain.blockTimeSeconds
      );

      this.localNodeStatus = {
        earliestBlockHeight: estimatedCurrentBlock - blocksInRetentionPeriod,
        latestBlockHeight: estimatedCurrentBlock,
        catchingUp: false,
        lastUpdated: now
      };
      this.lastStatusCheck = now;
      console.log(`Using fallback node status due to fetch error - assuming blocks ${this.localNodeStatus.earliestBlockHeight} to ${this.localNodeStatus.latestBlockHeight} (${this.appConfig.blockchain.fullNodeRetentionMonths} month retention)`);
      return this.localNodeStatus;
    }
  }
}