import { computePartCount } from "./part-math";
import type { CompletedPart, CreateUploadResponse, UploadTarget } from "./types";

export type UploaderStatus =
  | "uploading"
  | "paused"
  | "completed"
  | "error"
  | "canceled";

export interface UploaderCallbacks {
  onProgress: (loadedBytes: number) => void;
  onStatus: (status: UploaderStatus, error?: string) => void;
}

export interface UploaderDeps {
  createUpload: (
    params: UploadTarget & { fileSize: number; contentType: string }
  ) => Promise<CreateUploadResponse>;
  signParts: (
    params: UploadTarget & { uploadId: string; partNumbers: number[] }
  ) => Promise<{ urls: Record<number, string> }>;
  putBlob: (
    url: string,
    blob: Blob,
    opts: {
      contentType?: string;
      signal: AbortSignal;
      onProgress: (loadedBytes: number) => void;
    }
  ) => Promise<{ etag: string | null }>;
  completeUpload: (
    params: UploadTarget & { uploadId?: string; parts?: CompletedPart[] }
  ) => Promise<{ success: boolean }>;
  abortUpload: (
    params: UploadTarget & { uploadId: string }
  ) => Promise<void>;
}

const PART_CONCURRENCY = 4;
const PART_ATTEMPTS = 3;
const SIGN_BATCH = 50;

export class FileUploader {
  private created: CreateUploadResponse | null = null;
  private completedParts = new Map<number, string>();
  private partLoaded = new Map<number, number>();
  private abortController: AbortController | null = null;
  private pauseRequested = false;
  private cancelRequested = false;
  private running = false;

  constructor(
    private file: File,
    private target: UploadTarget,
    private deps: UploaderDeps,
    private cb: UploaderCallbacks
  ) {}

  /** Begins the upload, or resumes it after a pause or error. */
  async start(): Promise<void> {
    if (this.running || this.cancelRequested) return;
    this.running = true;
    this.pauseRequested = false;
    this.abortController = new AbortController();
    this.cb.onStatus("uploading");
    try {
      if (!this.created) {
        this.created = await this.deps.createUpload({
          ...this.target,
          fileSize: this.file.size,
          contentType: this.file.type || "application/octet-stream",
        });
      }
      if (this.created.mode === "single") {
        await this.uploadSingle(this.created.url);
        await this.deps.completeUpload({ ...this.target });
      } else {
        await this.uploadParts(this.created.uploadId, this.created.partSize);
        const parts: CompletedPart[] = [...this.completedParts.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([partNumber, etag]) => ({ partNumber, etag }));
        await this.deps.completeUpload({
          ...this.target,
          uploadId: this.created.uploadId,
          parts,
        });
      }
      this.cb.onStatus("completed");
    } catch (err) {
      if (this.cancelRequested) {
        // cancel() reports the canceled status after aborting remotely.
      } else if (this.pauseRequested) {
        this.cb.onStatus("paused");
      } else {
        this.cb.onStatus(
          "error",
          err instanceof Error ? err.message : "Upload failed"
        );
      }
    } finally {
      this.running = false;
    }
  }

  /** Aborts in-flight part uploads; completed parts are kept for resume. */
  pause(): void {
    this.pauseRequested = true;
    this.abortController?.abort();
  }

  /** Aborts in-flight uploads and best-effort aborts the remote multipart upload. */
  async cancel(): Promise<void> {
    this.cancelRequested = true;
    this.abortController?.abort();
    if (this.created?.mode === "multipart") {
      try {
        await this.deps.abortUpload({
          ...this.target,
          uploadId: this.created.uploadId,
        });
      } catch {
        // Best-effort: an orphaned upload remains visible (and abortable)
        // in the bucket's incomplete-uploads tab.
      }
    }
    this.cb.onStatus("canceled");
  }

  private reportProgress(): void {
    let loaded = 0;
    for (const bytes of this.partLoaded.values()) loaded += bytes;
    this.cb.onProgress(Math.min(loaded, this.file.size));
  }

  private async uploadSingle(url: string): Promise<void> {
    // A paused single PUT restarts from zero on resume — there are no parts to keep.
    this.partLoaded.set(0, 0);
    await this.deps.putBlob(url, this.file, {
      contentType: this.file.type || "application/octet-stream",
      signal: this.abortController!.signal,
      onProgress: (bytes) => {
        this.partLoaded.set(0, bytes);
        this.reportProgress();
      },
    });
    this.partLoaded.set(0, this.file.size);
    this.reportProgress();
  }

  private async uploadParts(uploadId: string, partSize: number): Promise<void> {
    const partCount = computePartCount(this.file.size, partSize);
    const pending: number[] = [];
    for (let n = 1; n <= partCount; n++) {
      if (this.completedParts.has(n)) {
        this.partLoaded.set(n, this.partBlob(n, partSize).size);
      } else {
        this.partLoaded.set(n, 0);
        pending.push(n);
      }
    }
    this.reportProgress();

    // Sign lazily in batches so presigned URLs are always fresh, even for
    // uploads that run longer than the 1-hour expiry.
    for (let i = 0; i < pending.length; i += SIGN_BATCH) {
      const batch = pending.slice(i, i + SIGN_BATCH);
      const { urls } = await this.deps.signParts({
        ...this.target,
        uploadId,
        partNumbers: batch,
      });
      await this.runPool(batch, async (partNumber) => {
        const url = urls[partNumber];
        if (!url) {
          throw new Error(`No presigned URL returned for part ${partNumber}`);
        }
        await this.uploadPart(partNumber, url, partSize);
      });
    }
  }

  private partBlob(partNumber: number, partSize: number): Blob {
    const start = (partNumber - 1) * partSize;
    return this.file.slice(start, Math.min(start + partSize, this.file.size));
  }

  private async uploadPart(
    partNumber: number,
    url: string,
    partSize: number
  ): Promise<void> {
    const blob = this.partBlob(partNumber, partSize);
    let lastError: unknown;
    for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
      try {
        const { etag } = await this.deps.putBlob(url, blob, {
          signal: this.abortController!.signal,
          onProgress: (bytes) => {
            this.partLoaded.set(partNumber, bytes);
            this.reportProgress();
          },
        });
        if (!etag) {
          throw new Error(
            "S3 did not return an ETag for an uploaded part. The bucket's CORS configuration must list ETag under ExposeHeaders (see docs/DIRECT_UPLOADS_CORS.md)."
          );
        }
        this.completedParts.set(partNumber, etag);
        this.partLoaded.set(partNumber, blob.size);
        this.reportProgress();
        return;
      } catch (err) {
        if (this.abortController!.signal.aborted) throw err;
        lastError = err;
        this.partLoaded.set(partNumber, 0);
      }
    }
    throw lastError;
  }

  private async runPool(
    items: number[],
    worker: (item: number) => Promise<void>
  ): Promise<void> {
    const queue = [...items];
    const workers = Array.from(
      { length: Math.min(PART_CONCURRENCY, queue.length) },
      async () => {
        for (;;) {
          const item = queue.shift();
          if (item === undefined) return;
          if (this.abortController!.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          await worker(item);
        }
      }
    );
    await Promise.all(workers);
  }
}
