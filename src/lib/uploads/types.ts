export interface UploadTarget {
  connectionId: string;
  bucket: string;
  key: string;
}

export type CreateUploadResponse =
  | { mode: "single"; url: string }
  | { mode: "multipart"; uploadId: string; partSize: number };

export interface CompletedPart {
  partNumber: number;
  etag: string;
}
