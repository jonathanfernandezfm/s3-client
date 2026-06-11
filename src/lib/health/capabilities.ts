// src/lib/health/capabilities.ts
import type { CapabilityKey } from "./probe";

export interface CapabilityDefinition {
  key: CapabilityKey;
  label: string;
  scope: "connection" | "bucket";
  requiredIamActions: string[];
  affects: string[];
  fixAction?: string;
}

export const CAPABILITIES: Record<CapabilityKey, CapabilityDefinition> = {
  "browse-buckets": {
    key: "browse-buckets",
    label: "Browse buckets",
    scope: "connection",
    requiredIamActions: ["s3:ListAllMyBuckets"],
    affects: ["The bucket list page won't show any buckets"],
  },
  "create-buckets": {
    key: "create-buckets",
    label: "Create buckets",
    scope: "connection",
    requiredIamActions: ["s3:CreateBucket"],
    affects: ["The \"+ New bucket\" button will be disabled"],
  },
  "delete-buckets": {
    key: "delete-buckets",
    label: "Delete buckets",
    scope: "connection",
    requiredIamActions: ["s3:DeleteBucket"],
    affects: ["The \"Delete bucket\" action will be disabled"],
  },
  "browse-objects": {
    key: "browse-objects",
    label: "Browse objects",
    scope: "bucket",
    requiredIamActions: ["s3:ListBucket"],
    affects: ["The file browser will show \"No access to list objects\""],
  },
  "download-objects": {
    key: "download-objects",
    label: "Download objects",
    scope: "bucket",
    requiredIamActions: ["s3:GetObject"],
    affects: ["Download buttons and bulk download will be disabled"],
  },
  "upload-objects": {
    key: "upload-objects",
    label: "Upload objects",
    scope: "bucket",
    requiredIamActions: ["s3:PutObject"],
    affects: [
      "Upload button, drag-drop zone, and \"+ New folder\" will be disabled",
    ],
  },
  "delete-objects": {
    key: "delete-objects",
    label: "Delete objects",
    scope: "bucket",
    requiredIamActions: ["s3:DeleteObject"],
    affects: ["Per-row delete and bulk delete will be disabled"],
  },
  "copy-objects": {
    key: "copy-objects",
    label: "Copy / Rename / Move",
    scope: "bucket",
    requiredIamActions: ["s3:GetObject", "s3:PutObject"],
    affects: [
      "Rename, Copy, and Move context-menu entries will be disabled",
      "Move also requires s3:DeleteObject",
    ],
  },
  "object-tagging": {
    key: "object-tagging",
    label: "Object tags",
    scope: "bucket",
    requiredIamActions: ["s3:GetObjectTagging", "s3:PutObjectTagging"],
    affects: ["The Tags panel in object detail will be disabled"],
  },
  "list-versions": {
    key: "list-versions",
    label: "List object versions",
    scope: "bucket",
    requiredIamActions: ["s3:ListBucketVersions"],
    affects: ["The Versions tab will be disabled"],
  },
  "manage-versioning": {
    key: "manage-versioning",
    label: "Manage bucket versioning",
    scope: "bucket",
    requiredIamActions: ["s3:GetBucketVersioning", "s3:PutBucketVersioning"],
    affects: ["The Versioning card on the bucket Overview will be disabled"],
  },
  "view-multipart": {
    key: "view-multipart",
    label: "View incomplete uploads",
    scope: "bucket",
    requiredIamActions: ["s3:ListBucketMultipartUploads"],
    affects: [
      "The Incomplete Uploads card on the bucket Overview will be disabled",
    ],
  },
  "cors-direct-uploads": {
    key: "cors-direct-uploads",
    label: "Direct uploads (CORS)",
    scope: "bucket",
    requiredIamActions: ["s3:GetBucketCors"],
    affects: [
      "File uploads will fail with a CORS error in the browser",
    ],
    fixAction: "apply-cors",
  },
};

export const CONNECTION_CAPABILITIES: CapabilityKey[] = (
  Object.values(CAPABILITIES) as CapabilityDefinition[]
)
  .filter((c) => c.scope === "connection")
  .map((c) => c.key);

export const BUCKET_CAPABILITIES: CapabilityKey[] = (
  Object.values(CAPABILITIES) as CapabilityDefinition[]
)
  .filter((c) => c.scope === "bucket")
  .map((c) => c.key);
