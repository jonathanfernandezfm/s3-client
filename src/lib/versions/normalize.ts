import type { S3ObjectVersion } from "@/types/s3";

interface SdkVersion {
  Key?: string;
  VersionId?: string;
  IsLatest?: boolean;
  LastModified?: Date;
  Size?: number;
  ETag?: string;
  StorageClass?: string;
  Owner?: { ID?: string; DisplayName?: string };
}

interface SdkDeleteMarker {
  Key?: string;
  VersionId?: string;
  IsLatest?: boolean;
  LastModified?: Date;
  Owner?: { ID?: string; DisplayName?: string };
}

interface SdkListResponse {
  Versions?: SdkVersion[];
  DeleteMarkers?: SdkDeleteMarker[];
}

export function normalizeVersions(input: SdkListResponse): S3ObjectVersion[] {
  const versions: S3ObjectVersion[] = (input.Versions ?? [])
    .filter((v): v is SdkVersion & { Key: string; VersionId: string } => !!v.Key && !!v.VersionId)
    .map((v) => ({
      key: v.Key,
      versionId: v.VersionId,
      isLatest: v.IsLatest ?? false,
      isDeleteMarker: false,
      lastModified: v.LastModified,
      size: v.Size,
      etag: v.ETag,
      storageClass: v.StorageClass,
      owner: v.Owner ? { id: v.Owner.ID, displayName: v.Owner.DisplayName } : undefined,
    }));

  const deleteMarkers: S3ObjectVersion[] = (input.DeleteMarkers ?? [])
    .filter((m): m is SdkDeleteMarker & { Key: string; VersionId: string } => !!m.Key && !!m.VersionId)
    .map((m) => ({
      key: m.Key,
      versionId: m.VersionId,
      isLatest: m.IsLatest ?? false,
      isDeleteMarker: true,
      lastModified: m.LastModified,
      size: undefined,
      etag: undefined,
      storageClass: undefined,
      owner: m.Owner ? { id: m.Owner.ID, displayName: m.Owner.DisplayName } : undefined,
    }));

  const all = [...versions, ...deleteMarkers];

  const byKey = new Map<string, S3ObjectVersion[]>();
  for (const v of all) {
    const arr = byKey.get(v.key) ?? [];
    arr.push(v);
    byKey.set(v.key, arr);
  }

  const sortedKeys = [...byKey.keys()].sort();
  const result: S3ObjectVersion[] = [];
  for (const k of sortedKeys) {
    const group = byKey.get(k)!;
    group.sort((a, b) => {
      const at = a.lastModified?.getTime() ?? 0;
      const bt = b.lastModified?.getTime() ?? 0;
      return bt - at;
    });
    result.push(...group);
  }
  return result;
}
