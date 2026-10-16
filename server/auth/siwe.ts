import type { Pool } from 'pg';
import type { Config } from '../config';
import { AppError } from '../../src/server/errors';
import {
  SIWE_STATEMENT,
  SIWE_VERSION,
  buildSiweMessage,
  isAllowedAppOrigin,
  parseSiweMessage,
} from '../../src/shared/siwe';
import { hashSecret, randomHex, recoverSigner } from './crypto';

export interface IssuedNonce {
  message: string;
  nonce: string;
  expiresAt: string;
  domain: string;
  uri: string;
  chainId: number;
}

export async function issueNonce(
  pool: Pool,
  config: Config,
  opts: { wallet: string; uri?: string; now: Date },
): Promise<IssuedNonce> {
  const { wallet, now } = opts;
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    throw new AppError('INVALID_INPUT', 'wallet must be a 0x address');
  }
  const uri = opts.uri ?? config.appOrigin;
  if (!isAllowedAppOrigin(uri, config.appOrigin, { allowLocalhost: !config.production })) {
    throw new AppError('INVALID_INPUT', 'uri must be this application origin');
  }
  const domain = new URL(uri).host;
  const nonce = randomHex(16);
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + config.nonceTtlMs).toISOString();
  await pool.query(
    `INSERT INTO auth_nonces (nonce_hash, wallet, domain, uri, chain_id, issued_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [hashSecret(nonce, config.sessionSecret), wallet, domain, uri, String(config.mainnetChainId), issuedAt, expiresAt],
  );
  const message = buildSiweMessage({
    domain,
    address: wallet,
    statement: SIWE_STATEMENT,
    uri,
    version: SIWE_VERSION,
    chainId: config.mainnetChainId,
    nonce,
    issuedAt,
    expirationTime: expiresAt,
  });
  return { message, nonce, expiresAt, domain, uri, chainId: config.mainnetChainId };
}

export async function verifySignIn(
  pool: Pool,
  config: Config,
  input: { message: string; signature: string },
  now: Date,
): Promise<string> {
  const parsed = parseSiweMessage(input.message);
  if (!parsed) {
    throw new AppError('INVALID_INPUT', 'Message is not a valid EIP-4361 sign-in message');
  }
  if (parsed.version !== SIWE_VERSION) throw new AppError('SIGN_IN_REQUIRED', 'Unsupported sign-in message version');
  if (parsed.statement !== SIWE_STATEMENT) {
    throw new AppError('SIGN_IN_REQUIRED', 'Sign-in message statement does not identify this application');
  }
  if (parsed.chainId !== config.mainnetChainId) {
    throw new AppError('SIGN_IN_REQUIRED', 'Sign-in message is bound to the wrong chain');
  }
  if (
    !isAllowedAppOrigin(parsed.uri, config.appOrigin, { allowLocalhost: !config.production }) ||
    new URL(parsed.uri).host !== parsed.domain
  ) {
    throw new AppError('SIGN_IN_REQUIRED', 'Sign-in message domain or uri is not this application');
  }
  if (parsed.expirationTime && now.getTime() > Date.parse(parsed.expirationTime)) {
    throw new AppError('SIGN_IN_REQUIRED', 'Sign-in message expired');
  }
  const address = parsed.address.toLowerCase();
  const nonceHash = hashSecret(parsed.nonce, config.sessionSecret);

  const { rows } = await pool.query<{ wallet: string; domain: string; uri: string; chain_id: string | number }>(
    `SELECT wallet, domain, uri, chain_id FROM auth_nonces
     WHERE nonce_hash = $1 AND consumed_at IS NULL AND expires_at > $2`,
    [nonceHash, now.toISOString()],
  );
  const row = rows[0];
  if (!row) throw new AppError('SIGN_IN_REQUIRED', 'Nonce is unknown, expired or already used');
  if (row.wallet.toLowerCase() !== address) {
    throw new AppError('SIGN_IN_REQUIRED', 'Sign-in message wallet does not match the issued nonce');
  }
  if (row.domain !== parsed.domain || row.uri !== parsed.uri || Number(row.chain_id) !== parsed.chainId) {
    throw new AppError('SIGN_IN_REQUIRED', 'Sign-in message does not match the issued nonce');
  }

  const signer = recoverSigner(input.message, input.signature ?? '');
  if (!signer) throw new AppError('SIGN_IN_REQUIRED', 'Unsupported or malformed signature');
  if (signer !== address) throw new AppError('SIGN_IN_REQUIRED', 'Signature does not match the signing wallet');

  const consumed = await pool.query(
    `UPDATE auth_nonces SET consumed_at = $2
     WHERE nonce_hash = $1 AND consumed_at IS NULL AND expires_at > $2
     RETURNING id`,
    [nonceHash, now.toISOString()],
  );
  if ((consumed.rowCount ?? 0) === 0) {
    throw new AppError('SIGN_IN_REQUIRED', 'Nonce is unknown, expired or already used');
  }
  return address;
}
