import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import type { ApiProfile } from '@/shared/apiTypes';

const OWNER = '0x601634f3d0746b550e68439286c1ad022a5f2b88';
const TOKEN_URI = 'ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/917.json';

function makeProfile(): ApiProfile {
  return {
    identity: { namespace: 'chog-mainnet', chainId: 143, contract: '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763', tokenId: '1425' },
    ownership: {
      status: 'fresh',
      owner: OWNER,
      observedAt: '2026-10-15T12:00:00.000Z',
      verificationBlock: 113000000,
      chainError: null,
    },
    metadata: {
      tokenUri: TOKEN_URI,
      name: 'CHOG #917',
      imageUri: 'ipfs://bafybeigwyimage/917.png',
      traits: [
        { trait_type: 'Type', value: 'Ashen' },
        { trait_type: 'Mood', value: 'Wary' },
      ],
      retrievedAt: '2026-10-15T12:00:00.000Z',
      stale: false,
      error: null,
    },
    game: null,
    chronicle: [
      {
        id: 'evt_1',
        sequence: 1,
        type: 'game',
        actor: 'controller',
        templateId: 1,
        choiceId: 'stand',
        text: 'You kept the disputed cache.',
        titleBefore: 'The Unwritten',
        titleAfter: 'The Unwritten',
        rulesetVersion: 'ashen-v1',
        createdAt: '2026-10-15T12:01:00.000Z',
      },
    ],
    provenance: [
      {
        txHash: '0xaaaabbbbccccdddd',
        blockNumber: 101997010,
        logIndex: 0,
        kind: 'mint',
        from: '0x0000000000000000000000000000000000000000',
        to: OWNER,
        tokenId: '1425',
        observedAt: '2024-05-01T00:00:00.000Z',
      },
    ],
    historySync: {
      startBlock: 101997010,
      lastIndexedBlock: 102000000,
      latestKnownBlock: 113656437,
      status: 'partial',
      updatedAt: '2026-10-15T12:00:00.000Z',
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const SESSION_JSON = { authenticated: false, wallet: null, expiresAt: null, expired: false, chainId: 143 };
const HEALTH_JSON = {
  ok: true,
  db: true,
  chain: { ok: true, blockNumber: 1, error: null },
  contract: '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763',
  contractName: null,
  chainId: 143,
};

type RouteResponse = Response | (() => Response | Promise<Response>);

interface RouteHandlers {
  profile?: RouteResponse;
  refresh?: RouteResponse;
}

function resolveRoute(h: RouteResponse): Response | Promise<Response> {
  return typeof h === 'function' ? h() : h.clone();
}

function routeFetch(handlers: RouteHandlers) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.startsWith('/api/auth/session')) return jsonResponse(SESSION_JSON);
    if (url.startsWith('/api/health')) return jsonResponse(HEALTH_JSON);
    if (url.startsWith('/api/profile/refresh')) {
      const h = handlers.refresh;
      if (!h) throw new Error('unexpected refresh call');
      return resolveRoute(h);
    }
    if (url.startsWith('/api/profile')) {
      const h = handlers.profile;
      if (!h) throw new Error('unexpected profile call');
      return resolveRoute(h);
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
}

function profileCallsOf(fetchMock: ReturnType<typeof vi.fn>): Array<[string, RequestInit]> {
  return fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/profile?')) as Array<[string, RequestInit]>;
}

describe('real profile page with a live API', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.history.pushState({}, '', '/chog/1425');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders chain facts, metadata traits and chronicle from GET /api/profile without mutating', async () => {
    fetchMock.mockImplementation(routeFetch({ profile: () => jsonResponse(makeProfile()) }));
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'The character journal.' })).toBeInTheDocument();
    expect(screen.getByText(/Real Chog · Monad mainnet · token 1425/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'CHOG #917' })).toBeInTheDocument();
    expect(screen.getByText('Current owner: 0x6016…2b88')).toBeInTheDocument();
    expect(screen.getByText(/Ownership fresh ·/)).toBeInTheDocument();
    expect(screen.getByText(/Ownership observed at block 113,000,000/)).toBeInTheDocument();
    expect(screen.getByText('Type: Ashen')).toBeInTheDocument();
    expect(screen.getByText('Mood: Wary')).toBeInTheDocument();

    const metadataLink = screen.getByRole('link', { name: 'Metadata source' });
    expect(metadataLink.getAttribute('href')).toBe('https://gateway.pinata.cloud/ipfs/' + TOKEN_URI.slice(7));

    expect(screen.getByRole('heading', { name: 'Chronicle' })).toBeInTheDocument();
    expect(screen.getByText(/You kept the disputed cache/)).toBeInTheDocument();
    expect(screen.getByText(/Minted to 0x6016…2b88/)).toBeInTheDocument();
    expect(screen.getByText(/Partial chain history · indexed to block 102000000/)).toBeInTheDocument();
    expect(screen.getByText(/Indexed from block 101,997,010 to 102,000,000\. Coverage: partial\./)).toBeInTheDocument();
    expect(screen.getByText(/No chapters yet\. Its first verified owner can begin the story/)).toBeInTheDocument();

    const calls = profileCallsOf(fetchMock);
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe('/api/profile?tokenId=1425');
    expect(init.method ?? 'GET').toBe('GET');
    const writes = fetchMock.mock.calls.filter(
      ([u, i]) => String(u).startsWith('/api/') && ((i as RequestInit | undefined)?.method ?? 'GET') === 'POST' && String(u) !== '/api/profile/refresh',
    );
    expect(writes).toHaveLength(0);
  });

  it('refresh posts to /api/profile/refresh and shows a button pending state', async () => {
    let resolveRefresh: (r: Response) => void = () => {};
    fetchMock.mockImplementation(
      routeFetch({
        profile: () => jsonResponse(makeProfile()),
        refresh: () =>
          new Promise<Response>(resolve => {
            resolveRefresh = resolve;
          }),
      }),
    );
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: 'The character journal.' });
    await user.click(screen.getByRole('button', { name: 'Refresh chain data' }));

    expect(await screen.findByRole('button', { name: 'Refreshing…' })).toBeDisabled();

    resolveRefresh(jsonResponse(makeProfile()));
    expect(await screen.findByRole('button', { name: 'Refresh chain data' })).toBeEnabled();
    expect(screen.getByText(/Current owner:/)).toBeInTheDocument();

    const refreshCalls = fetchMock.mock.calls.filter(([u]) => String(u) === '/api/profile/refresh');
    expect(refreshCalls).toHaveLength(1);
    const init = refreshCalls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ tokenId: '1425' });
  });

  it('shows the refresh failure as a notice without dropping observed data', async () => {
    fetchMock.mockImplementation(
      routeFetch({
        profile: () => jsonResponse(makeProfile()),
        refresh: () => jsonResponse({ error: { code: 'CHAIN_UNAVAILABLE', message: 'Monad RPC is unreachable.' } }, 503),
      }),
    );
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: 'The character journal.' });
    await user.click(screen.getByRole('button', { name: 'Refresh chain data' }));

    expect(await screen.findByText(/Monad RPC is unreachable/)).toBeInTheDocument();
    expect(screen.getByText('Current owner: 0x6016…2b88')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh chain data' })).toBeEnabled());
  });
});
