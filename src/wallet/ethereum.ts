export interface WalletProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
}

const ALLOWED_METHODS = new Set([
  'eth_requestAccounts',
  'personal_sign',
  'eth_chainId',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
]);

export const MONAD_MAINNET_CHAIN_ID = 143;

export const MONAD_MAINNET_ADD_CHAIN_PARAMS = {
  chainId: '0x8f',
  chainName: 'Monad Mainnet',
  rpcUrls: ['https://rpc.monad.xyz'],
  blockExplorerUrls: ['https://monadvision.com'],
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
};

export class WalletError extends Error {
  readonly method: string;
  readonly code: number | undefined;
  constructor(method: string, message: string, code?: number) {
    super(message);
    this.name = 'WalletError';
    this.method = method;
    this.code = typeof code === 'number' ? code : undefined;
  }
}

async function call(p: WalletProvider, method: string, params?: unknown[]): Promise<unknown> {
  if (!ALLOWED_METHODS.has(method)) throw new WalletError(method, `Blocked wallet method: ${method}`);
  try {
    return await p.request(params ? { method, params } : { method });
  } catch (e) {
    const code =
      typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'number'
        ? (e as { code: number }).code
        : undefined;
    throw new WalletError(method, e instanceof Error ? e.message : String(e), code);
  }
}

export async function connectAccounts(p: WalletProvider): Promise<string[]> {
  const accounts = await call(p, 'eth_requestAccounts');
  return Array.isArray(accounts) ? accounts.filter((a): a is string => typeof a === 'string') : [];
}

export async function getWalletChainId(p: WalletProvider): Promise<string | null> {
  const chain = await call(p, 'eth_chainId');
  return typeof chain === 'string' ? chain : null;
}

export function chainIdToHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

function isChainMissing(e: unknown): boolean {
  const code = e instanceof WalletError ? e.code : undefined;
  if (code === 4902 || code === 404) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /unrecognized chain id|unknown chain|chain .*not (been )?added|not added/i.test(msg);
}

export async function switchChain(
  p: WalletProvider,
  chainIdHex: string,
  addChainParams?: object,
): Promise<void> {
  try {
    await call(p, 'wallet_switchEthereumChain', [{ chainId: chainIdHex }]);
  } catch (e) {
    if (isChainMissing(e) && addChainParams) {
      await call(p, 'wallet_addEthereumChain', [addChainParams]);
      return;
    }
    throw e;
  }
}

export function toHexMessage(message: string): string {
  let out = '0x';
  for (const b of new TextEncoder().encode(message)) out += b.toString(16).padStart(2, '0');
  return out;
}

export async function personalSign(p: WalletProvider, address: string, message: string): Promise<string> {
  const sig = await call(p, 'personal_sign', [toHexMessage(message), address]);
  if (typeof sig !== 'string' || sig.length === 0) throw new WalletError('personal_sign', 'Wallet returned no signature');
  return sig;
}

export function isRejection(e: unknown): boolean {
  if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 4001) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /reject|denied|cancel/i.test(msg);
}

export function onAccountsChanged(p: WalletProvider, cb: (accounts: string[]) => void): () => void {
  const handler = ((...args: unknown[]) => {
    const list = args[0];
    cb(Array.isArray(list) ? list.filter((a): a is string => typeof a === 'string') : []);
  }) as (...args: unknown[]) => void;
  p.on?.('accountsChanged', handler);
  return () => p.removeListener?.('accountsChanged', handler);
}

export function onChainChanged(p: WalletProvider, cb: (chainId: string) => void): () => void {
  const handler = ((...args: unknown[]) => {
    const v = args[0];
    if (typeof v === 'string') cb(v);
  }) as (...args: unknown[]) => void;
  p.on?.('chainChanged', handler);
  return () => p.removeListener?.('chainChanged', handler);
}
