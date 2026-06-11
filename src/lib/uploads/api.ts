import type { CompletedPart, CreateUploadResponse, UploadTarget } from "./types";

async function requestJson<T>(
  url: string,
  method: string,
  body: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function createUpload(
  params: UploadTarget & { fileSize: number; contentType: string }
): Promise<CreateUploadResponse> {
  return requestJson("/api/objects/multipart/create", "POST", params);
}

export function signParts(
  params: UploadTarget & { uploadId: string; partNumbers: number[] }
): Promise<{ urls: Record<number, string> }> {
  return requestJson("/api/objects/multipart/sign-parts", "POST", params);
}

export function completeUpload(
  params: UploadTarget & { uploadId?: string; parts?: CompletedPart[] }
): Promise<{ success: boolean }> {
  return requestJson("/api/objects/multipart/complete", "POST", params);
}

export async function abortUpload(
  params: UploadTarget & { uploadId: string }
): Promise<void> {
  await requestJson(
    `/api/buckets/${encodeURIComponent(params.bucket)}/multipart-uploads`,
    "DELETE",
    {
      connectionId: params.connectionId,
      uploads: [{ key: params.key, uploadId: params.uploadId }],
    }
  );
}
