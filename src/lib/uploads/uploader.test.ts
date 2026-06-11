import { describe, it, expect, vi } from "vitest";
import { FileUploader, type UploaderDeps } from "./uploader";
import type { UploadTarget } from "./types";

const target: UploadTarget = {
  connectionId: "conn-1",
  bucket: "bucket-1",
  key: "folder/test.bin",
};

function makeFile(size: number): File {
  return new File([new Uint8Array(size)], "test.bin", {
    type: "application/octet-stream",
  });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type PendingPut = {
  url: string;
  blob: Blob;
  resolve: (etag: string | null) => void;
  reject: (err: unknown) => void;
};

/** putBlob fake whose resolution the test controls; rejects with AbortError on signal abort. */
function makeControlledPut() {
  const pending: PendingPut[] = [];
  const putBlob = vi.fn(
    (
      url: string,
      blob: Blob,
      opts: { signal: AbortSignal; onProgress: (n: number) => void }
    ) =>
      new Promise<{ etag: string | null }>((resolve, reject) => {
        opts.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
        pending.push({
          url,
          blob,
          resolve: (etag) => resolve({ etag }),
          reject,
        });
      })
  );
  return { putBlob, pending };
}

function makeDeps(overrides: Partial<UploaderDeps> = {}): UploaderDeps {
  return {
    createUpload: vi.fn(async () => ({
      mode: "multipart" as const,
      uploadId: "up-1",
      partSize: 4,
    })),
    signParts: vi.fn(async (params: { partNumbers: number[] }) => ({
      urls: Object.fromEntries(
        params.partNumbers.map((n) => [n, `https://signed/${n}`])
      ),
    })),
    putBlob: vi.fn(async () => ({ etag: "etag-x" })),
    completeUpload: vi.fn(async () => ({ success: true })),
    abortUpload: vi.fn(async () => {}),
    ...overrides,
  } as unknown as UploaderDeps;
}

function collectStatuses() {
  const statuses: Array<{ status: string; error?: string }> = [];
  return {
    statuses,
    cb: {
      onProgress: vi.fn(),
      onStatus: (status: string, error?: string) => {
        statuses.push({ status, error });
      },
    },
  };
}

describe("FileUploader — single PUT mode", () => {
  it("uploads small files with one PUT and completes without uploadId", async () => {
    const deps = makeDeps({
      createUpload: vi.fn(async () => ({
        mode: "single" as const,
        url: "https://signed/put",
      })),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(5), target, deps, cb);

    await uploader.start();

    expect(deps.putBlob).toHaveBeenCalledTimes(1);
    expect(deps.completeUpload).toHaveBeenCalledWith({ ...target });
    expect(statuses.map((s) => s.status)).toEqual(["uploading", "completed"]);
  });
});

describe("FileUploader — single PUT mode (pause/resume)", () => {
  it("re-creates the upload on resume after a paused single PUT", async () => {
    const { putBlob, pending } = makeControlledPut();
    const deps = makeDeps({
      createUpload: vi.fn(async () => ({
        mode: "single" as const,
        url: "https://signed/put",
      })),
      putBlob: putBlob as unknown as UploaderDeps["putBlob"],
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(5), target, deps, cb);

    const run = uploader.start();
    await flush();
    expect(pending.length).toBe(1);

    uploader.pause();
    await run;
    expect(statuses.at(-1)?.status).toBe("paused");

    const resumed = uploader.start();
    await flush();
    expect(deps.createUpload).toHaveBeenCalledTimes(2); // URL re-signed
    pending[1].resolve("etag-1");
    await resumed;
    expect(statuses.at(-1)?.status).toBe("completed");
  });
});

describe("FileUploader — multipart mode", () => {
  it("uploads all parts and completes with ordered part list", async () => {
    let counter = 0;
    const deps = makeDeps({
      putBlob: vi.fn(async () => ({ etag: `etag-${++counter}` })),
    });
    const { statuses, cb } = collectStatuses();
    // 10 bytes / partSize 4 => 3 parts
    const uploader = new FileUploader(makeFile(10), target, deps, cb);

    await uploader.start();

    expect(deps.putBlob).toHaveBeenCalledTimes(3);
    const completeArgs = (deps.completeUpload as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(completeArgs.uploadId).toBe("up-1");
    expect(completeArgs.parts.map((p: { partNumber: number }) => p.partNumber)).toEqual([1, 2, 3]);
    expect(completeArgs.parts.every((p: { etag: string }) => p.etag.startsWith("etag-"))).toBe(true);
    expect(statuses.at(-1)?.status).toBe("completed");
  });

  it("slices the file into correct part blobs", async () => {
    const blobs: Blob[] = [];
    const deps = makeDeps({
      putBlob: vi.fn(async (_url: string, blob: Blob) => {
        blobs.push(blob);
        return { etag: "e" };
      }),
    });
    const { cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(10), target, deps, cb);
    await uploader.start();
    const sizes = blobs.map((b) => b.size).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 4, 4]); // 4 + 4 + 2 = 10
  });

  it("retries a failed part and succeeds", async () => {
    let attempt = 0;
    const deps = makeDeps({
      putBlob: vi.fn(async () => {
        attempt++;
        if (attempt === 1) throw new Error("transient");
        return { etag: `etag-${attempt}` };
      }),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(4), target, deps, cb);
    await uploader.start();
    expect(deps.putBlob).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)?.status).toBe("completed");
  });

  it("fails with an error status after exhausting part retries", async () => {
    const deps = makeDeps({
      putBlob: vi.fn(async () => {
        throw new Error("hard failure");
      }),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(4), target, deps, cb);
    await uploader.start();
    expect(deps.putBlob).toHaveBeenCalledTimes(3);
    expect(statuses.at(-1)).toEqual({ status: "error", error: "hard failure" });
  });

  it("reports a CORS-specific error when S3 returns no ETag", async () => {
    const deps = makeDeps({
      putBlob: vi.fn(async () => ({ etag: null })),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(4), target, deps, cb);
    await uploader.start();
    expect(statuses.at(-1)?.status).toBe("error");
    expect(statuses.at(-1)?.error).toContain("ExposeHeaders");
    expect(deps.putBlob).toHaveBeenCalledTimes(1); // hard error — no retries
  });

  it("pause keeps completed parts; resume uploads only the remainder", async () => {
    const { putBlob, pending } = makeControlledPut();
    const deps = makeDeps({ putBlob: putBlob as unknown as UploaderDeps["putBlob"] });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(10), target, deps, cb);

    const run = uploader.start();
    await flush();
    expect(pending.length).toBe(3); // all 3 parts in flight (concurrency 4)

    pending[0].resolve("etag-1"); // part 1 finishes
    await flush();

    uploader.pause();
    await run;
    expect(statuses.at(-1)?.status).toBe("paused");

    // Resume: only parts 2 and 3 remain.
    const resumed = uploader.start();
    await flush();
    expect(pending.length).toBe(5); // 3 original + 2 resumed
    pending[3].resolve("etag-2");
    pending[4].resolve("etag-3");
    await resumed;

    expect(statuses.at(-1)?.status).toBe("completed");
    const completeArgs = (deps.completeUpload as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(completeArgs.parts).toHaveLength(3);
    // createUpload must NOT be called again on resume
    expect(deps.createUpload).toHaveBeenCalledTimes(1);
  });

  it("cancel aborts the remote multipart upload and reports canceled", async () => {
    const { putBlob, pending } = makeControlledPut();
    const deps = makeDeps({ putBlob: putBlob as unknown as UploaderDeps["putBlob"] });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(10), target, deps, cb);

    const run = uploader.start();
    await flush();
    expect(pending.length).toBe(3);

    await uploader.cancel();
    await run;

    expect(deps.abortUpload).toHaveBeenCalledWith({ ...target, uploadId: "up-1" });
    expect(statuses.at(-1)?.status).toBe("canceled");
    expect(deps.completeUpload).not.toHaveBeenCalled();
  });

  it("pause during signParts aborts promptly and resume recovers", async () => {
    let rejectSign!: (err: unknown) => void;
    let signCalls = 0;
    const deps = makeDeps({
      signParts: vi.fn(
        (
          _params: { partNumbers: number[] },
          signal?: AbortSignal
        ) =>
          new Promise<{ urls: Record<number, string> }>((resolve, reject) => {
            signCalls++;
            if (signCalls === 1) {
              rejectSign = reject;
              signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true }
              );
            } else {
              resolve({
                urls: Object.fromEntries(
                  _params.partNumbers.map((n) => [n, `https://signed/${n}`])
                ),
              });
            }
          })
      ),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(10), target, deps, cb);

    const run = uploader.start();
    await flush();
    uploader.pause(); // abort while signParts is in flight
    await run;
    expect(statuses.at(-1)?.status).toBe("paused");
    void rejectSign;

    await uploader.start();
    expect(statuses.at(-1)?.status).toBe("completed");
  });

  it("late cancel during completeUpload suppresses the completed status", async () => {
    let resolveComplete!: () => void;
    const deps = makeDeps({
      completeUpload: vi.fn(
        () =>
          new Promise<{ success: boolean }>((resolve) => {
            resolveComplete = () => resolve({ success: true });
          })
      ),
    });
    const { statuses, cb } = collectStatuses();
    const uploader = new FileUploader(makeFile(10), target, deps, cb);

    const run = uploader.start();
    await flush();
    // all parts done instantly (default putBlob fake); completeUpload now hanging
    expect(deps.completeUpload).toHaveBeenCalledTimes(1);

    await uploader.cancel();
    resolveComplete();
    await run;

    expect(statuses.filter((s) => s.status === "completed")).toHaveLength(0);
    expect(statuses.at(-1)?.status).toBe("canceled");
  });
});
