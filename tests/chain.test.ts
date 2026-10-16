import { describe, expect, it } from 'vitest';
import {
  SELECTOR_OWNER_OF,
  decodeAddress,
  decodeString,
  decodeUint,
  encodeTokenCall,
  isRevertError,
  tokenIdTopic,
} from '../server/chain/abi';
import { IPFS_GATEWAYS, ipfsToHttp, resolveMetadata } from '../server/chain/metadata';
import { AppError } from '../src/server/errors';

function encodeAbiString(s: string): string {
  const bytes = Array.from(s, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const len = s.length.toString(16).padStart(64, '0');
  const padded = bytes.padEnd(64, '0');
  return '0x' + '0'.repeat(64) + len + padded;
}

function addressWord(addr: string): string {
  return addr.toLowerCase().replace('0x', '').padStart(64, '0');
}

describe('chain ABI encoding and decoding', () => {
  it('encodes ownerOf(1425) call data', () => {
    expect(encodeTokenCall(SELECTOR_OWNER_OF, '1425')).toBe(SELECTOR_OWNER_OF + (1425).toString(16).padStart(64, '0'));
  });

  it('decodes a returned owner address', () => {
    const word = addressWord('0x601634f3d0746b550e68439286c1ad022a5f2b88');
    expect(decodeAddress('0x' + word)).toBe('0x601634f3d0746b550e68439286c1ad022a5f2b88');
    expect(decodeAddress('0x')).toBeNull();
    expect(decodeAddress(null)).toBeNull();
  });

  it('decodes uint and addressless sentinel results', () => {
    expect(decodeUint('0x' + (1425).toString(16).padStart(64, '0'))).toBe(1425n);
    expect(decodeUint('0x')).toBeNull();
    expect(decodeAddress('0x' + '0'.repeat(64))).toBe('0x0000000000000000000000000000000000000000');
  });

  it('decodes ABI strings including ipfs token URIs', () => {
    expect(decodeString(encodeAbiString('Chog'))).toBe('Chog');
    expect(decodeString(encodeAbiString('ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/917.json'))).toBe(
      'ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/917.json',
    );
    expect(decodeString('0x')).toBeNull();
    expect(decodeString('0x' + '0'.repeat(64))).toBeNull();
  });

  it('builds the tokenId topic for getLogs filters', () => {
    expect(tokenIdTopic('1425')).toBe('0x' + (1425).toString(16).padStart(64, '0'));
  });

  it('classifies revert-style provider errors', () => {
    expect(isRevertError(new Error('execution reverted: ERC721: invalid token ID'))).toBe(true);
    expect(isRevertError(new Error('connection refused'))).toBe(false);
  });

  it('maps AppError codes onto the error contract', () => {
    const e = new AppError('TOKEN_NOT_FOUND', 'gone');
    expect(e.code).toBe('TOKEN_NOT_FOUND');
    expect(e.message).toBe('gone');
  });
});

describe('metadata resolution', () => {
  it('converts ipfs URIs through a gateway', () => {
    expect(ipfsToHttp('ipfs://bafy/1.json')).toBe(IPFS_GATEWAYS[0] + 'bafy/1.json');
    expect(ipfsToHttp('https://example.com/m.json')).toBe('https://example.com/m.json');
  });

  it('falls back across gateways when the first one fails', async () => {
    const seen: string[] = [];
    const result = await resolveMetadata('ipfs://bafy/1425.json', {
      gateways: ['https://one/', 'https://two/'],
      fetchImpl: async uri => {
        seen.push(uri);
        if (uri.startsWith('https://one/')) return { ok: false, error: 'HTTP 429' };
        return { ok: true, json: { name: 'Chog', image: 'ipfs://bafy/img.png', attributes: [{ trait_type: 'Era', value: 3 }] } };
      },
    });
    expect(seen).toEqual(['https://one/bafy/1425.json', 'https://two/bafy/1425.json']);
    expect(result).toMatchObject({
      ok: true,
      name: 'Chog',
      imageUri: 'ipfs://bafy/img.png',
      traits: [{ trait_type: 'Era', value: 3 }],
      error: null,
    });
  });

  it('fails closed with per-gateway errors when every gateway fails', async () => {
    const result = await resolveMetadata('ipfs://bafy/1425.json', {
      gateways: ['https://one/', 'https://two/'],
      fetchImpl: async () => ({ ok: false, error: 'timeout' }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('https://one: timeout');
    expect(result.error).toContain('https://two: timeout');
  });

  it('parses data-URI metadata without a network hop', async () => {
    const json = JSON.stringify({ name: 'Data Chog', image: 'data:image/png;base64,AAAA' });
    const uri = 'data:application/json;base64,' + Buffer.from(json).toString('base64');
    const result = await resolveMetadata(uri, { fetchImpl: async () => ({ ok: false, error: 'must not be called' }) });
    expect(result).toMatchObject({ ok: true, name: 'Data Chog', imageUri: 'data:image/png;base64,AAAA' });
  });

  it('fetches https metadata and drops malformed attribute entries', async () => {
    const result = await resolveMetadata('https://example.com/1425.json', {
      fetchImpl: async () => ({
        ok: true,
        json: {
          name: 'Https Chog',
          attributes: [
            { trait_type: 'Era', value: 'First' },
            { nope: true },
            { trait_type: 'Mood', value: { nested: true } },
          ],
        },
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.traits).toEqual([{ trait_type: 'Era', value: 'First' }]);
  });

  it('reports missing token URIs honestly', async () => {
    const result = await resolveMetadata(null);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no token uri');
  });

  it('rejects unsupported URI schemes', async () => {
    const result = await resolveMetadata('ftp://example.com/m.json');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unsupported');
  });
});
