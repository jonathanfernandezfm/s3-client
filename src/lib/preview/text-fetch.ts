import { TEXT_PREVIEW_MAX_BYTES } from './constants';

export type TextFetchResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'tooLarge'; sizeBytes: number }
  | { ok: false; reason: 'error'; message: string };

export async function fetchTextWithCap(url: string): Promise<TextFetchResult> {
  try {
    const response = await fetch(url);

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > TEXT_PREVIEW_MAX_BYTES) {
        return { ok: false, reason: 'tooLarge', sizeBytes: contentLength };
      }
    }

    if (!response.body) {
      return { ok: false, reason: 'error', message: 'Response body is null' };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > TEXT_PREVIEW_MAX_BYTES) {
          await reader.cancel();
          return { ok: false, reason: 'tooLarge', sizeBytes: totalBytes };
        }
        chunks.push(value);
      }
    }

    const allBytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      allBytes.set(chunk, offset);
      offset += chunk.length;
    }

    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(allBytes);
      return { ok: true, text };
    } catch {
      return { ok: false, reason: 'error', message: "File doesn't appear to be text." };
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Failed to fetch file',
    };
  }
}
