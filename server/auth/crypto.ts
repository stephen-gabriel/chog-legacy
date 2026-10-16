import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils';
import { secp256k1 } from '@noble/curves/secp256k1';

export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

export function keccak256Hex(data: Uint8Array): string {
  return bytesToHex(keccak_256(data));
}

export function randomHex(byteLength = 32): string {
  return bytesToHex(randomBytes(byteLength));
}

export function hashSecret(raw: string, secret: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(raw)));
}

export function personalMessageHash(message: string): Uint8Array {
  const body = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`);
  return keccak_256(concatBytes(prefix, body));
}

export function addressFromPublicKey(pub: Uint8Array): string {
  const uncompressed = pub.length === 65 ? pub.slice(1) : pub;
  return `0x${bytesToHex(keccak_256(uncompressed)).slice(-40)}`;
}

function normalizeSignature(signatureHex: string): { compact: Uint8Array; recovery: number } | null {
  const raw = signatureHex.startsWith('0x') || signatureHex.startsWith('0X') ? signatureHex.slice(2) : signatureHex;
  if (!/^[0-9a-fA-F]+$/.test(raw)) return null;
  if (raw.length === 130) {
    const bytes = hexToBytes(raw);
    const v = bytes[64];
    let recovery: number;
    if (v === 27 || v === 28) recovery = v - 27;
    else if (v === 0 || v === 1) recovery = v;
    else return null;
    return { compact: bytes.slice(0, 64), recovery };
  }
  if (raw.length === 128) {
    const bytes = hexToBytes(raw);
    const vs = bytes.slice(32);
    const recovery = vs[0] >> 7;
    vs[0] &= 0x7f;
    return { compact: concatBytes(bytes.slice(0, 32), vs), recovery };
  }
  return null;
}

export function recoverSigner(message: string, signatureHex: string): string | null {
  try {
    const sig = normalizeSignature(signatureHex);
    if (!sig) return null;
    const hash = personalMessageHash(message);
    const point = secp256k1.Signature.fromCompact(bytesToHex(sig.compact))
      .addRecoveryBit(sig.recovery)
      .recoverPublicKey(hash);
    return addressFromPublicKey(point.toRawBytes(false));
  } catch {
    return null;
  }
}
