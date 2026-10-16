import { AppError } from '../../src/server/errors';
import type { Config } from '../config';
import {
  SELECTOR_NAME,
  SELECTOR_OWNER_OF,
  SELECTOR_TOKEN_URI,
  TOPIC_TRANSFER,
  ZERO_ADDRESS,
  decodeAddress,
  decodeString,
  decodeUint,
  encodeTokenCall,
  tokenIdTopic,
} from './abi';

export interface TransferLog {
  blockNumber: number;
  blockHash: string;
  txHash: string;
  logIndex: number;
  from: string;
  to: string;
  tokenId: string;
  kind: 'mint' | 'transfer' | 'burn';
}

export interface ChainAdapter {
  getHealth(): Promise<{ ok: boolean; blockNumber: number | null; error: string | null }>;
  ownerOf(tokenId: string): Promise<{ owner: string; blockNumber: number }>;
  tokenURI(tokenId: string): Promise<string | null>;
  getTransferLogs(tokenId: string, fromBlock: number, toBlock: number): Promise<TransferLog[]>;
  readonly maxLogRange: number;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(url: string, method: string, params: unknown[], timeoutMs = 10_000): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new AppError('CHAIN_UNAVAILABLE', `RPC HTTP ${res.status}`);
  const body = (await res.json()) as JsonRpcResponse<T>;
  if (body.error) {
    const msg = body.error.message ?? 'RPC error';
    if (/revert|does not exist|invalid token|execution reverted/i.test(msg)) {
      const e = new AppError('TOKEN_NOT_FOUND', msg);
      throw e;
    }
    throw new AppError('CHAIN_UNAVAILABLE', msg);
  }
  if (body.result === undefined) throw new AppError('CHAIN_UNAVAILABLE', 'RPC returned no result');
  return body.result;
}

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: string;
  removed?: boolean;
}

export function createRpcAdapter(config: Config): ChainAdapter {
  const url = config.mainnetRpcUrl;
  const contract = config.chogContract;
  const toHexBlock = (n: number) => '0x' + n.toString(16);

  return {
    maxLogRange: config.maxLogRange,

    async getHealth() {
      try {
        const hex = await rpcCall<string>(url, 'eth_blockNumber', []);
        return { ok: true, blockNumber: Number(BigInt(hex)), error: null };
      } catch (e) {
        return { ok: false, blockNumber: null, error: e instanceof Error ? e.message : String(e) };
      }
    },

    async ownerOf(tokenId: string) {
      let result: string;
      try {
        result = await rpcCall<string>(url, 'eth_call', [{ to: contract, data: encodeTokenCall(SELECTOR_OWNER_OF, tokenId) }, 'latest']);
      } catch (e) {
        if (e instanceof AppError && e.code === 'TOKEN_NOT_FOUND') throw e;
        if (e instanceof Error && /revert|does not exist|invalid token/i.test(e.message)) {
          throw new AppError('TOKEN_NOT_FOUND', 'Token does not exist on this contract');
        }
        throw e instanceof AppError ? e : new AppError('CHAIN_UNAVAILABLE', e instanceof Error ? e.message : String(e));
      }
      const owner = decodeAddress(result);
      if (!owner || owner === ZERO_ADDRESS) throw new AppError('TOKEN_NOT_FOUND', 'ownerOf returned no owner');
      const blockHex = await rpcCall<string>(url, 'eth_blockNumber', []);
      return { owner, blockNumber: Number(BigInt(blockHex)) };
    },

    async tokenURI(tokenId: string) {
      try {
        const result = await rpcCall<string>(url, 'eth_call', [{ to: contract, data: encodeTokenCall(SELECTOR_TOKEN_URI, tokenId) }, 'latest']);
        return decodeString(result);
      } catch (e) {
        if (e instanceof AppError && e.code === 'TOKEN_NOT_FOUND') return null;
        throw e;
      }
    },

    async getTransferLogs(tokenId: string, fromBlock: number, toBlock: number) {
      const span = toBlock - fromBlock + 1;
      if (span <= 0) return [];
      const cappedTo = span > config.maxLogRange ? fromBlock + config.maxLogRange - 1 : toBlock;
      const raw = await rpcCall<RawLog[]>(url, 'eth_getLogs', [
        {
          address: contract,
          topics: [TOPIC_TRANSFER, null, null, tokenIdTopic(tokenId)],
          fromBlock: toHexBlock(fromBlock),
          toBlock: toHexBlock(cappedTo),
        },
      ]);
      const out: TransferLog[] = [];
      for (const l of raw) {
        if (l.removed) continue;
        const tokenIdTopicVal = l.topics[3];
        if (!tokenIdTopicVal) continue;
        const from = decodeAddress(l.topics[1]);
        const to = decodeAddress(l.topics[2]);
        if (!from || !to) continue;
        const kind = from === ZERO_ADDRESS ? 'mint' : to === ZERO_ADDRESS ? 'burn' : 'transfer';
        out.push({
          blockNumber: Number(BigInt(l.blockNumber)),
          blockHash: l.blockHash,
          txHash: l.transactionHash,
          logIndex: Number(BigInt(l.logIndex)),
          from,
          to,
          tokenId: BigInt(tokenIdTopicVal).toString(),
          kind,
        });
      }
      return out;
    },
  };
}

export async function chainName(url: string, contract: string): Promise<string | null> {
  try {
    const result = await rpcCall<string>(url, 'eth_call', [{ to: contract, data: SELECTOR_NAME }, 'latest']);
    return decodeString(result);
  } catch {
    return null;
  }
}

export { decodeUint };
