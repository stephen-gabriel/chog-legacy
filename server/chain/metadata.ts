export interface MetadataResult {
  ok: boolean;
  name: string | null;
  imageUri: string | null;
  traits: Array<{ trait_type: string; value: string | number }> | null;
  error: string | null;
}

export const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
  'https://w3s.link/ipfs/',
  'https://ipfs.io/ipfs/',
];

const MAX_BYTES = 256 * 1024;

export function ipfsToHttp(uri: string, gateway = IPFS_GATEWAYS[0]): string {
  if (uri.startsWith('ipfs://')) return gateway + uri.slice(7);
  return uri;
}

async function fetchJson(uri: string, timeoutMs: number): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(uri, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    if (text.length > MAX_BYTES) return { ok: false, error: 'metadata too large' };
    return { ok: true, json: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function decodeDataUri(uri: string): { ok: true; json: unknown } | { ok: false; error: string } | null {
  const m = uri.match(/^data:application\/json;(?:charset=[^;]+;)?base64,(.+)$/);
  if (!m) return null;
  try {
    const json = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as unknown;
    return { ok: true, json };
  } catch {
    return { ok: false, error: 'invalid data uri json' };
  }
}

function extract(json: unknown): Omit<MetadataResult, 'ok' | 'error'> {
  if (typeof json !== 'object' || json === null) return { name: null, imageUri: null, traits: null };
  const o = json as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : null;
  const imageUri = typeof o.image === 'string' ? o.image : null;
  const traits = Array.isArray(o.attributes)
    ? o.attributes
        .filter((a): a is { trait_type: string; value: string | number } =>
          typeof a === 'object' && a !== null && 'trait_type' in a && 'value' in a &&
          typeof (a as { trait_type: unknown }).trait_type === 'string' &&
          (typeof (a as { value: unknown }).value === 'string' || typeof (a as { value: unknown }).value === 'number'),
        )
        .map(a => ({ trait_type: a.trait_type, value: a.value }))
    : null;
  return { name, imageUri, traits };
}

export async function resolveMetadata(
  tokenUri: string | null,
  opts?: { timeoutMs?: number; gateways?: string[]; fetchImpl?: typeof fetchJson },
): Promise<MetadataResult> {
  if (!tokenUri) return { ok: false, name: null, imageUri: null, traits: null, error: 'no token uri' };
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const gateways = opts?.gateways ?? IPFS_GATEWAYS;
  const doFetch = opts?.fetchImpl ?? fetchJson;

  if (tokenUri.startsWith('ipfs://')) {
    const errors: string[] = [];
    for (const gw of gateways) {
      const r = await doFetch(gw + tokenUri.slice(7), timeoutMs);
      if (r.ok) {
        const meta = extract(r.json);
        return { ok: true, error: null, ...meta };
      }
      errors.push(`${gw.replace(/\/$/, '')}: ${r.error}`);
    }
    return { ok: false, name: null, imageUri: null, traits: null, error: errors.join('; ') };
  }

  if (tokenUri.startsWith('data:')) {
    const r = decodeDataUri(tokenUri);
    if (!r) return { ok: false, name: null, imageUri: null, traits: null, error: 'unsupported data uri' };
    if (!r.ok) return { ok: false, name: null, imageUri: null, traits: null, error: r.error };
    return { ok: true, error: null, ...extract(r.json) };
  }

  if (tokenUri.startsWith('https://')) {
    const r = await doFetch(tokenUri, timeoutMs);
    if (!r.ok) return { ok: false, name: null, imageUri: null, traits: null, error: r.error };
    return { ok: true, error: null, ...extract(r.json) };
  }

  return { ok: false, name: null, imageUri: null, traits: null, error: 'unsupported uri scheme' };
}
