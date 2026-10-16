export const SIWE_VERSION = '1';

export const SIWE_STATEMENT =
  'Sign in to Chog Legacy. This free message proves wallet ownership for authentication only. It is not a transaction, approval or transfer.';

export interface SiweMessage {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEADER_RE = /^(.+) wants you to sign in with your Ethereum account:$/;

export function buildSiweMessage(m: SiweMessage): string {
  const lines: string[] = [
    `${m.domain} wants you to sign in with your Ethereum account:`,
    m.address,
    '',
    m.statement,
    '',
    `URI: ${m.uri}`,
    `Version: ${m.version}`,
    `Chain ID: ${m.chainId}`,
    `Nonce: ${m.nonce}`,
    `Issued At: ${m.issuedAt}`,
  ];
  if (m.expirationTime) lines.push(`Expiration Time: ${m.expirationTime}`);
  return lines.join('\n');
}

const KNOWN_KEYS = new Set(['URI', 'Version', 'Chain ID', 'Nonce', 'Issued At', 'Expiration Time', 'Not Before', 'Request ID', 'Resources']);

export function parseSiweMessage(text: string): SiweMessage | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 4096) return null;
  const lines = text.split('\n');
  if (lines.length < 8) return null;
  const header = HEADER_RE.exec(lines[0]);
  if (!header) return null;
  const domain = header[1];
  if (!domain || /\s/.test(domain)) return null;
  const address = lines[1];
  if (!ADDRESS_RE.test(address)) return null;
  if (lines[2] !== '') return null;

  let idx = 3;
  let statement = '';
  if (lines[idx] === '') {
    idx += 1;
  } else {
    const stmt: string[] = [];
    while (idx < lines.length && lines[idx] !== '') stmt.push(lines[idx++]);
    if (stmt.length === 0) return null;
    statement = stmt.join('\n');
    idx += 1;
  }

  const fields = new Map<string, string>();
  while (idx < lines.length) {
    const line = lines[idx++];
    if (line === '') return null;
    const sep = line.indexOf(': ');
    if (sep < 0) return null;
    const key = line.slice(0, sep);
    if (!KNOWN_KEYS.has(key)) return null;
    if (fields.has(key)) return null;
    fields.set(key, line.slice(sep + 2));
  }

  const uri = fields.get('URI');
  const version = fields.get('Version');
  const chainRaw = fields.get('Chain ID');
  const nonce = fields.get('Nonce');
  const issuedAt = fields.get('Issued At');
  if (!uri || !version || !chainRaw || !nonce || !issuedAt) return null;
  if (!/^https?:\/\/[^\s]+$/.test(uri)) return null;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(nonce)) return null;
  const chainId = Number(chainRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) return null;
  for (const [k, v] of fields) {
    if ((k === 'Issued At' || k === 'Expiration Time' || k === 'Not Before') && Number.isNaN(Date.parse(v))) return null;
    if (k === 'Resources' && !v.startsWith('[')) return null;
  }
  const expirationTime = fields.get('Expiration Time');
  return {
    domain,
    address,
    statement,
    uri,
    version,
    chainId,
    nonce,
    issuedAt,
    expirationTime,
  };
}

export function canonicalOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

export function isAllowedAppOrigin(raw: string, appOrigin: string): boolean {
  const origin = canonicalOrigin(raw);
  if (!origin) return false;
  if (origin === canonicalOrigin(appOrigin)) return true;
  return /^http:\/\/localhost(:\d+)?$/.test(origin);
}
