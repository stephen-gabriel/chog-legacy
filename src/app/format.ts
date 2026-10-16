export function formatResetLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })} (local time)`;
}

export function relativePast(iso: string, now: Date = new Date(), suffix = ''): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  const tail = suffix ? ` ${suffix}` : '';
  if (min < 1) return `just now${tail}`;
  if (min < 60) return `${min} min ago${tail}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago${tail}`;
  return `${Math.floor(h / 24)}d ago${tail}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
