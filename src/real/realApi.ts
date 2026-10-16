import type {
  ApiActivationResult,
  ApiCommitReceipt,
  ApiIntentionResult,
  ApiPlayState,
  ApiProfile,
} from '@/shared/apiTypes';
import type { ErrorCode } from '@/ui/types';

export interface RealLookupResult {
  ok: boolean;
  errorCode?: ErrorCode;
  detail?: string;
  profile?: ApiProfile;
}

export interface ApiCall<T> {
  ok: boolean;
  data?: T;
  errorCode?: ErrorCode;
  detail?: string;
}

const FETCH_HEADERS = { accept: 'application/json' };

async function callApi<T>(path: string, init?: RequestInit): Promise<ApiCall<T>> {
  try {
    const res = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: {
        ...FETCH_HEADERS,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
    const body = (await res.json().catch(() => null)) as T | { error?: { code?: ErrorCode; message?: string } } | null;
    if (res.ok && body && typeof body === 'object' && !('error' in body)) return { ok: true, data: body as T };
    const err = (body as { error?: { code?: ErrorCode; message?: string } } | null)?.error;
    return {
      ok: false,
      errorCode: err?.code ?? (res.status === 401 ? 'SIGN_IN_REQUIRED' : res.status === 503 ? 'CHAIN_UNAVAILABLE' : 'INVALID_INPUT'),
      detail: err?.message ?? `The API returned HTTP ${res.status}.`,
    };
  } catch {
    return {
      ok: false,
      errorCode: 'STORAGE_UNAVAILABLE',
      detail:
        'Could not reach the Chog API. Start it with npm run api — it serves live Monad mainnet reads from Postgres. This page shows nothing until real data is available.',
    };
  }
}

async function requestProfile(url: string, init?: RequestInit): Promise<RealLookupResult> {
  const res = await callApi<ApiProfile>(url, init);
  return res.ok && res.data ? { ok: true, profile: res.data } : { ok: false, errorCode: res.errorCode, detail: res.detail };
}

export async function lookupRealToken(tokenId: string): Promise<RealLookupResult> {
  if (!/^\d+$/.test(tokenId)) {
    return { ok: false, errorCode: 'INVALID_INPUT', detail: 'Token IDs are unsigned integer strings.' };
  }
  return requestProfile(`/api/profile?tokenId=${encodeURIComponent(tokenId)}`);
}

export async function refreshRealToken(tokenId: string): Promise<RealLookupResult> {
  if (!/^\d+$/.test(tokenId)) {
    return { ok: false, errorCode: 'INVALID_INPUT', detail: 'Token IDs are unsigned integer strings.' };
  }
  return requestProfile('/api/profile/refresh', {
    method: 'POST',
    body: JSON.stringify({ tokenId }),
  });
}

export function activateChog(tokenId: string): Promise<ApiCall<ApiActivationResult>> {
  return callApi<ApiActivationResult>('/api/activation', { method: 'POST', body: JSON.stringify({ tokenId }) });
}

export function playChog(tokenId: string): Promise<ApiCall<ApiPlayState>> {
  return callApi<ApiPlayState>('/api/play', { method: 'POST', body: JSON.stringify({ tokenId }) });
}

export function intentionChog(tokenId: string, intention: 'embrace' | 'redeem'): Promise<ApiCall<ApiIntentionResult>> {
  return callApi<ApiIntentionResult>('/api/intention', { method: 'POST', body: JSON.stringify({ tokenId, intention }) });
}

export function actionChog(
  tokenId: string,
  input: { instanceId: string; choiceId: string; expectedVersion: number; idempotencyKey: string },
): Promise<ApiCall<ApiCommitReceipt>> {
  return callApi<ApiCommitReceipt>('/api/action', { method: 'POST', body: JSON.stringify({ tokenId, ...input }) });
}
