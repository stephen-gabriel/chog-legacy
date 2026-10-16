export const SELECTOR_OWNER_OF = '0x6352211e';
export const SELECTOR_TOKEN_URI = '0xc87b56dd';
export const SELECTOR_NAME = '0x06fdde03';
export const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function encodeUint256Arg(value: string | number | bigint): string {
  return BigInt(value).toString(16).padStart(64, '0');
}

export function encodeTokenCall(selector: string, tokenId: string): string {
  return selector + encodeUint256Arg(tokenId);
}

export function tokenIdTopic(tokenId: string): string {
  return '0x' + encodeUint256Arg(tokenId);
}

export function decodeAddress(hex: string | null | undefined): string | null {
  if (!hex || hex === '0x' || hex.length < 66) return null;
  return ('0x' + hex.slice(26)).toLowerCase();
}

export function decodeUint(hex: string | null | undefined): bigint | null {
  if (!hex || hex === '0x') return null;
  return BigInt(hex);
}

export function decodeString(hex: string | null | undefined): string | null {
  if (!hex || hex === '0x') return null;
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (body.length < 128) return null;
  const len = Number(BigInt('0x' + body.slice(64, 128)));
  if (!Number.isFinite(len) || len < 0 || len > 1_000_000) return null;
  const data = body.slice(128, 128 + len * 2);
  if (data.length < len * 2) return null;
  let out = '';
  for (let i = 0; i < data.length; i += 2) {
    out += String.fromCharCode(parseInt(data.slice(i, i + 2), 16));
  }
  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}

export function isRevertError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /revert|execution reverted|does not exist|invalid token/i.test(msg);
}
