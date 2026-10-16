import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import type { Pool } from 'pg';
import { ConfigError, loadConfig, type Config } from './config';
import { createPool } from './db/pool';
import { runMigrations } from './db/migrate';
import { createRpcAdapter, type ChainAdapter } from './chain/adapter';
import { handleApi, STATUS_BY_ERROR, type ApiDeps, type ApiRequest } from './api/handlers';
import { RateLimiter } from './api/ratelimit';
import { parseCookieHeader } from './auth/session';
import { AppError, isAppError } from '../src/server/errors';

const MAX_BODY = 64 * 1024;

const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export interface RunningServer {
  port: number;
  pool: Pool;
  close(): Promise<void>;
}

function corsHeaders(req: IncomingMessage, config: Config): Record<string, string> | null {
  const origin = req.headers.origin;
  if (!origin) return null;
  const localhostDev = !config.production && /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (origin !== config.appOrigin && !localhostDev) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new AppError('INVALID_INPUT', 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch {
        reject(new AppError('INVALID_INPUT', 'Body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req: IncomingMessage, config: Config): string {
  if (config.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    if (typeof raw === 'string' && raw.trim()) return raw.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function serveStatic(config: Config, res: ServerResponse, url: URL, cors: Record<string, string> | null): boolean {
  const rootDir = resolve(process.cwd(), config.staticDir);
  const indexPath = join(rootDir, 'index.html');
  if (!existsSync(indexPath)) return false;
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  if (pathname.includes('\0')) return false;
  const rel = normalize(pathname).replace(/^[/\\]+/, '');
  let filePath = resolve(rootDir, rel);
  if (filePath !== rootDir && !filePath.startsWith(rootDir + sep)) return false;
  let isFile = false;
  try {
    isFile = statSync(filePath).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) {
    filePath = indexPath;
  }
  const ext = filePath === indexPath ? '.html' : filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  const type = STATIC_TYPES[ext] ?? 'application/octet-stream';
  const cache = filePath === indexPath || !url.pathname.startsWith('/assets/')
    ? 'no-store'
    : 'public, max-age=31536000, immutable';
  const body = readFileSync(filePath);
  res.writeHead(200, {
    'content-type': type,
    'content-length': body.length,
    'cache-control': cache,
    ...(cors ?? {}),
  });
  res.end(body);
  return true;
}

function send(res: ServerResponse, status: number, json: unknown, cors: Record<string, string> | null): void {
  const payload = JSON.stringify(json);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...(cors ?? {}),
  });
  res.end(payload);
}

export async function startServer(overrides?: Record<string, string | undefined>): Promise<RunningServer> {
  const config = loadConfig(overrides);
  const pool = createPool(config);
  const applied = await runMigrations(pool);
  if (applied.length > 0) console.log(`[chog-api] applied migrations: ${applied.join(', ')}`);

  const chain: ChainAdapter = createRpcAdapter(config);
  const deps: ApiDeps = { pool, chain, config, now: () => new Date() };

  const refreshLimiter = new RateLimiter(60_000, 10);
  const authLimiter = new RateLimiter(60_000, 30);
  const defaultLimiter = new RateLimiter(60_000, 240);

  const server = createServer((req, res) => {
    void handle(req, res).catch(e => {
      if (!res.headersSent) {
        const code = isAppError(e) ? e.code : 'STORAGE_UNAVAILABLE';
        send(res, isAppError(e) ? (STATUS_BY_ERROR[code] ?? 500) : 500, { error: { code, message: isAppError(e) ? e.message : 'Unexpected server error' } }, corsHeaders(req, config));
      } else {
        res.destroy();
      }
    });

    async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const cors = corsHeaders(req, config);
      const url = new URL(req.url ?? '/', 'http://localhost');
      const method = req.method ?? 'GET';

      if (method === 'OPTIONS') {
        res.writeHead(cors ? 204 : 403, cors ?? {});
        res.end();
        return;
      }

      if (!url.pathname.startsWith('/api/')) {
        if (method === 'GET' && serveStatic(config, res, url, cors)) return;
        send(res, 404, { error: { code: 'INVALID_INPUT', message: 'Not an API route' } }, cors);
        return;
      }

      const ip = clientIp(req, config);
      const limiter = url.pathname.startsWith('/api/auth/')
        ? authLimiter
        : url.pathname === '/api/profile/refresh'
          ? refreshLimiter
          : defaultLimiter;
      limiter.check(`${ip}:${url.pathname}`);

      const body = method === 'POST' ? await readBody(req) : undefined;
      const apiReq: ApiRequest = {
        method,
        path: url.pathname,
        query: url.searchParams,
        body,
        headers: {
          get: (name: string) => {
            const v = req.headers[name.toLowerCase()];
            return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null;
          },
        },
        cookies: parseCookieHeader(req.headers.cookie),
        ip,
      };
      const out = await handleApi(deps, apiReq);
      if (out.setCookie) res.setHeader('set-cookie', out.setCookie);
      send(res, out.status, out.json, cors);
    }
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(config.apiPort, config.host, () => {
      server.removeListener('error', reject);
      resolveListen();
    });
  });
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : config.apiPort;
  console.log(`[chog-api] listening on http://${config.host}:${port} (origin ${config.appOrigin})`);

  return {
    port,
    pool,
    close: async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await pool.end();
    },
  };
}

const isDirectRun = process.argv[1] !== undefined && /server[\\/]main\.(ts|js)$/.test(process.argv[1]);
if (isDirectRun) {
  startServer().catch(e => {
    if (e instanceof ConfigError) {
      console.error(`[chog-api] configuration error: ${e.message}`);
      process.exit(1);
    }
    console.error('[chog-api] failed to start:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
