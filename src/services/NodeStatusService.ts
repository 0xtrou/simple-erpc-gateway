import fetch from 'node-fetch';
import { LocalNodeStatus, AppConfig } from '../types';

export class NodeStatusService {
  private localNodeStatus: LocalNodeStatus | null = null;
  private lastStatusCheck = 0;

  constructor(private config: AppConfig) {}

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
        // No status URL configured - assume node is caught up with full block range
        this.localNodeStatus = {
          earliestBlockHeight: 1, // Assume we have blocks from genesis
          latestBlockHeight: 999999999, // Assume we're always up to date
          catchingUp: false,
          lastUpdated: now
        };
        this.lastStatusCheck = now;
        console.log('No status URL configured - assuming node is caught up with full block range');
        return this.localNodeStatus;
      }

      const response = await fetch(statusUrl, {
        timeout: this.config.health.nodeStatusTimeoutMs
      } as any);

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      const data = await response.json() as any;
      this.localNodeStatus = {
        earliestBlockHeight: parseInt(data.result.sync_info.earliest_block_height),
        latestBlockHeight: parseInt(data.result.sync_info.latest_block_height),
        catchingUp: data.result.sync_info.catching_up,
        lastUpdated: now
      };

      this.lastStatusCheck = now;
      console.log(`Local node status: earliest=${this.localNodeStatus.earliestBlockHeight}, latest=${this.localNodeStatus.latestBlockHeight}, catching_up=${this.localNodeStatus.catchingUp}`);

      return this.localNodeStatus;
    } catch (error) {
      console.error('Failed to check local node status:', (error as Error).message);
      return null;
    }
  }
}