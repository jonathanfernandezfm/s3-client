import type { BucketVersioningStatus } from "@/types/s3";

export interface VersioningControl {
  label: "Enable" | "Suspend";
  enabled: boolean;
  disabled: boolean;
}

export function getVersioningControl(
  status: BucketVersioningStatus,
  canEdit: boolean,
  isPending: boolean,
): VersioningControl | null {
  if (!canEdit) return null;

  if (status === "Enabled") {
    return {
      label: "Suspend",
      enabled: false,
      disabled: isPending,
    };
  }

  return {
    label: "Enable",
    enabled: true,
    disabled: isPending,
  };
}
