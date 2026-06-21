import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime } from './format-time';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeTime', () => {
  it('returns "just now" for a timestamp ~30s ago', () => {
    const now = new Date('2026-06-05T12:00:00.000Z');
    vi.setSystemTime(now);
    const past = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(past)).toBe('just now');
  });

  it('returns "5m ago" for a timestamp ~5 minutes ago', () => {
    const now = new Date('2026-06-05T12:00:00.000Z');
    vi.setSystemTime(now);
    const past = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(past)).toBe('5m ago');
  });

  it('returns a string containing the year for an old date', () => {
    const result = formatRelativeTime('2024-01-15T00:00:00.000Z');
    expect(result).toContain('2024');
  });
});
