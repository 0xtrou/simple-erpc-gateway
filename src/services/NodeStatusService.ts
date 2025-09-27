import fetch from 'node-fetch';
import { LocalNodeStatus, ProjectConfig } from '../types';

export class NodeStatusService {
  private localNodeStatus: LocalNodeStatus | null = null;
  private lastStatusCheck = 0;

  constructor(private config: ProjectConfig) {}

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
        // Most full nodes only keep recent blocks (last ~6 months)
        const estimatedCurrentBlock = 169500000; // Approximate current block
        const blocksIn6Months = 5256000; // ~6 months of blocks (assuming 1 block/3s)

        this.localNodeStatus = {
          earliestBlockHeight: estimatedCurrentBlock - blocksIn6Months,
          latestBlockHeight: estimatedCurrentBlock,
          catchingUp: false,
          lastUpdated: now
        };
        this.lastStatusCheck = now;
        console.log(`No status URL configured - assuming recent full node with blocks ${this.localNodeStatus.earliestBlockHeight} to ${this.localNodeStatus.latestBlockHeight}`);
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

      // Fallback to default status if fetching fails
      // Assume recent full node (not archive) when status fetch fails
      const estimatedCurrentBlock = 169500000; // Approximate current block
      const blocksIn6Months = 5256000; // ~6 months of blocks (assuming 1 block/3s)

      this.localNodeStatus = {
        earliestBlockHeight: estimatedCurrentBlock - blocksIn6Months,
        latestBlockHeight: estimatedCurrentBlock,
        catchingUp: false,
        lastUpdated: now
      };
      this.lastStatusCheck = now;
      console.log(`Using fallback node status due to fetch error - assuming blocks ${this.localNodeStatus.earliestBlockHeight} to ${this.localNodeStatus.latestBlockHeight}`);
      return this.localNodeStatus;
    }
  }
}