export interface PutBlobOptions {
  contentType?: string;
  signal: AbortSignal;
  onProgress: (loadedBytes: number) => void;
}

export interface PutBlobResult {
  etag: string | null;
}

/**
 * PUT a blob to a presigned URL via XHR (fetch cannot report upload progress).
 * Rejects with DOMException("Aborted", "AbortError") when the signal aborts.
 */
export function putBlob(
  url: string,
  blob: Blob,
  opts: PutBlobOptions
): Promise<PutBlobResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (opts.contentType) {
      xhr.setRequestHeader("Content-Type", opts.contentType);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader("ETag") });
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Network error during upload. If this persists, check the bucket's CORS configuration — it must allow PUT from this origin and expose the ETag header (see docs/DIRECT_UPLOADS_CORS.md)."
        )
      );
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}
