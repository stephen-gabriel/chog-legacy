import type { ApiHealth, ApiNonceResponse, ApiSessionInfo } from '@/shared/apiTypes';
import type { ErrorCode } from '@/ui/types';

export class ApiCallError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiCallError';
    this.code = code;
  }
}

const FETCH_INIT: RequestInit = { credentials: 'include', headers: { accept: 'application/json' } };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...FETCH_INIT,
      ...init,
      headers: { ...FETCH_INIT.headers, ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
    });
  } catch {
    throw new ApiCallError('STORAGE_UNAVAILABLE', 'Could not reach the Chog API. Start it with npm run api.');
  }
  const body = (await res.json().catch(() => null)) as T | { error?: { code?: ErrorCode; message?: string } } | null;
  if (res.ok) return body as T;
  const err = (body as { error?: { code?: ErrorCode; message?: string } } | null)?.error;
  throw new ApiCallError(err?.code ?? (res.status === 401 ? 'SIGN_IN_REQUIRED' : 'INVALID_INPUT'), err?.message ?? `HTTP ${res.status}`);
}

export async function getHealth(): Promise<ApiHealth> {
  return call<ApiHealth>('/api/health');
}

export async function getNonce(wallet: string, uri: string): Promise<ApiNonceResponse> {
  return call<ApiNonceResponse>('/api/auth/nonce', { method: 'POST', body: JSON.stringify({ wallet, uri }) });
}

export async function postVerify(message: string, signature: string): Promise<ApiSessionInfo> {
  return call<ApiSessionInfo>('/api/auth/verify', { method: 'POST', body: JSON.stringify({ message, signature }) });
}

export async function getSession(): Promise<ApiSessionInfo> {
  return call<ApiSessionInfo>('/api/auth/session');
}

export async function postLogout(): Promise<ApiSessionInfo> {
  return call<ApiSessionInfo>('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
}
