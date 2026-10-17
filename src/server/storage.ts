import { seedPractice, type DbState, type Clock } from './service';

export const PRACTICE_STORAGE_KEY = 'chog-legacy:practice:v1';

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function savePracticeDb(state: DbState): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), db: state }));
  } catch {
    // Quota/serialization failures leave the in-memory state authoritative for this session.
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeDb(db: DbState): DbState {
  return {
    ...db,
    characters: asArray(db.characters),
    epochs: asArray(db.epochs),
    events: asArray(db.events),
    budgets: asArray(db.budgets),
    instances: asArray(db.instances),
    receipts: asArray(db.receipts),
    sequences: db.sequences && typeof db.sequences === 'object' ? db.sequences : {},
    consequences: asArray(db.consequences),
  };
}

export function loadPracticeDb(clock: Clock): DbState {
  if (storageAvailable()) {
    try {
      const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { db?: DbState };
        if (parsed.db && Array.isArray(parsed.db.characters) && parsed.db.characters.length > 0) {
          return normalizeDb(parsed.db);
        }
      }
    } catch {
      // Corrupt payloads reseed rather than crash; practice is disposable by design.
    }
  }
  const seeded = seedPractice(clock.now());
  savePracticeDb(seeded);
  return seeded;
}

export function clearPracticeDb(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(PRACTICE_STORAGE_KEY);
  } catch {
    // Ignore: reset proceeds from the reseeded in-memory state.
  }
}
