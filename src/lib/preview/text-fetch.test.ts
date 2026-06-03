import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchTextWithCap } from './text-fetch';
import { TEXT_PREVIEW_MAX_BYTES } from './constants';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchTextWithCap', () => {
  it('returns tooLarge when content-length header exceeds cap', async () => {
    const bigSize = TEXT_PREVIEW_MAX_BYTES + 1;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => h === 'content-length' ? String(bigSize) : null },
      body: null,
    }));

    const result = await fetchTextWithCap('http://example.com/file.txt');
    expect(result).toEqual({ ok: false, reason: 'tooLarge', sizeBytes: bigSize });
  });

  it('returns tooLarge when streamed bytes exceed cap (no content-length)', async () => {
    const oversize = TEXT_PREVIEW_MAX_BYTES + 1;
    const chunk = new Uint8Array(oversize).fill(65);
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: chunk })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      body: { getReader: () => mockReader },
    }));

    const result = await fetchTextWithCap('http://example.com/file.txt');
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'tooLarge') {
      expect(result.sizeBytes).toBeGreaterThan(TEXT_PREVIEW_MAX_BYTES);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it('returns ok with decoded text for a small valid response', async () => {
    const text = 'hello world';
    const bytes = new TextEncoder().encode(text);
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: bytes })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      body: { getReader: () => mockReader },
    }));

    const result = await fetchTextWithCap('http://example.com/file.txt');
    expect(result).toEqual({ ok: true, text: 'hello world' });
  });

  it('returns error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const result = await fetchTextWithCap('http://example.com/file.txt');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('error');
    }
  });

  it('returns error when body bytes fail UTF-8 decoding', async () => {
    const invalidBytes = new Uint8Array([0xff, 0xfe, 0xfd]);
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: invalidBytes })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      body: { getReader: () => mockReader },
    }));

    const result = await fetchTextWithCap('http://example.com/file.txt');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('error');
    }
  });
});
