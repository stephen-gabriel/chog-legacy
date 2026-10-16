export interface WalletProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
}

const ALLOWED_METHODS = new Set(['eth_requestAccounts', 'personal_sign', 'eth_chainId']);

export class WalletError extends Error {
  readonly method: string;
  constructor(method: string, message: string) {
    super(message);
    this.name = 'WalletError';
    this.method = method;
  }
}

export function getProvider(): WalletProvider | null {
  const w = window as unknown as { ethereum?: WalletProvider };
  return w.ethereum ?? null;
}

async function call(p: WalletProvider, method: string, params?: unknown[]): Promise<unknown> {
  if (!ALLOWED_METHODS.has(method)) throw new WalletError(method, `Blocked wallet method: ${method}`);
  try {
    return await p.request(params ? { method, params } : { method });
  } catch (e) {
    throw new WalletError(method, e instanceof Error ? e.message : String(e));
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
