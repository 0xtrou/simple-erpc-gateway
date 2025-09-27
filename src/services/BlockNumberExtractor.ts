import { AppConfig } from '../types';

export class BlockNumberExtractor {
  constructor(private config: AppConfig) {}

  extract(method: string, params?: any[]): number | 'latest' | null {
    if (!params || !Array.isArray(params)) return null;

    // Check if this method has block number parameters
    if (!this.config.historicalMethods.includes(method)) return null;

    const blockNumberMethods: Record<string, number> = {
      'eth_getBlockByNumber': 0,
      'eth_getBlockTransactionCountByNumber': 0,
      'eth_getTransactionByBlockNumberAndIndex': 0,
      'eth_getUncleByBlockNumberAndIndex': 0,
      'eth_getUncleCountByBlockNumber': 0,
      'debug_traceBlockByNumber': 0,
      'trace_block': 0,
      'trace_blockByNumber': 0
    };

    // Handle methods with block number parameter
    if (blockNumberMethods.hasOwnProperty(method)) {
      const blockParam = params[blockNumberMethods[method]];
      if (blockParam === 'latest' || blockParam === 'pending') {
        return 'latest';
      }
      if (blockParam === 'earliest') {
        return 0;
      }
      if (typeof blockParam === 'string') {
        const blockNum = parseInt(blockParam, 16);
        return isNaN(blockNum) ? null : blockNum;
      }
      return blockParam;
    }

    // Handle eth_getLogs with block range
    if (method === 'eth_getLogs' && params[0] && typeof params[0] === 'object') {
      const filter = params[0];
      if (filter.fromBlock && filter.fromBlock !== 'latest' && filter.fromBlock !== 'pending') {
        const blockNum = parseInt(filter.fromBlock, 16);
        return isNaN(blockNum) ? null : blockNum;
      }
    }

    return null;
  }
}