import type { WalletProvider } from './ethereum';

export interface WalletInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface DiscoveredWallet {
  info: WalletInfo;
  provider: WalletProvider;
}

const LEGACY_UUID = 'injected-legacy';

const byUuid = new Map<string, DiscoveredWallet>();
const listeners = new Set<(list: DiscoveredWallet[]) => void>();
let started = false;

function syncLegacy(): void {
  if (typeof window === 'undefined') return;
  const legacy = (window as unknown as { ethereum?: WalletProvider }).ethereum;
  const current = byUuid.get(LEGACY_UUID);
  if (!legacy || typeof legacy.request !== 'function') {
    if (current) byUuid.delete(LEGACY_UUID);
    return;
  }
  for (const [uuid, entry] of byUuid) {
    if (uuid !== LEGACY_UUID && entry.provider === legacy) {
      if (current) byUuid.delete(LEGACY_UUID);
      return;
    }
  }
  if (!current || current.provider !== legacy) {
    byUuid.set(LEGACY_UUID, {
      info: { uuid: LEGACY_UUID, name: 'Browser wallet', icon: '', rdns: '' },
      provider: legacy,
    });
  }
}

function buildList(): DiscoveredWallet[] {
  syncLegacy();
  return [...byUuid.values()].sort(
    (a, b) => Number(a.info.uuid === LEGACY_UUID) - Number(b.info.uuid === LEGACY_UUID),
  );
}

function notify(): void {
  if (listeners.size === 0) return;
  const list = buildList();
  for (const cb of listeners) cb(list);
}

function onAnnounce(event: Event): void {
  const detail = (event as CustomEvent).detail as
    | { info?: Partial<WalletInfo>; provider?: WalletProvider }
    | undefined;
  const info = detail?.info;
  const provider = detail?.provider;
  if (!info || typeof info.uuid !== 'string' || !info.uuid || typeof info.name !== 'string' || !info.name) return;
  if (!provider || typeof provider.request !== 'function') return;
  for (const [uuid, entry] of [...byUuid]) {
    if (uuid !== info.uuid && entry.provider === provider) byUuid.delete(uuid);
  }
  byUuid.set(info.uuid, {
    info: {
      uuid: info.uuid,
      name: info.name,
      icon: typeof info.icon === 'string' ? info.icon : '',
      rdns: typeof info.rdns === 'string' ? info.rdns : '',
    },
    provider,
  });
  notify();
}

function requestDiscovery(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

function start(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('eip6963:announceProvider', onAnnounce as EventListener);
  requestDiscovery();
  window.setTimeout(requestDiscovery, 150);
}

export function subscribeWallets(cb: (list: DiscoveredWallet[]) => void): () => void {
  start();
  listeners.add(cb);
  cb(buildList());
  requestDiscovery();
  return () => {
    listeners.delete(cb);
  };
}

export function resetWalletDiscoveryForTests(): void {
  byUuid.clear();
}
