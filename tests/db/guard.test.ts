import { describe, expect, it } from 'vitest';
import { gateDb } from './helpers';

describe('database test gate', () => {
  it('blocks when DATABASE_URL_TEST is missing', () => {
    const g = gateDb({});
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/DATABASE_URL_TEST is not set/);
  });

  it('blocks when the database name does not look like a test database', () => {
    const g = gateDb({ DATABASE_URL_TEST: 'postgres://user:pw@127.0.0.1:5432/production' });
    expect(g.ok).toBe(false);
    expect(g.reason).toContain('does not contain "test"');
  });

  it('blocks when the URL is not postgres', () => {
    const g = gateDb({ DATABASE_URL_TEST: 'mysql://user:pw@127.0.0.1:3306/chog_test' });
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/protocol/);
  });

  it('allows a postgres URL whose database name contains "test"', () => {
    const g = gateDb({ DATABASE_URL_TEST: 'postgres://user:pw@127.0.0.1:5432/chog_test' });
    expect(g.ok).toBe(true);
    expect(g.url).toContain('chog_test');
  });
});
