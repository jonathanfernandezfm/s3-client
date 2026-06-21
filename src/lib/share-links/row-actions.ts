export type ShareStatus = "active" | "expired" | "exhausted" | "revoked";

/** Copy should only be offered for a link that actually works. */
export function canCopyShare(status: ShareStatus): boolean {
  return status === "active";
}

/** Extending the expiry is meaningful for a live link or one that lapsed by time. */
export function canExtendShare(status: ShareStatus): boolean {
  return status === "active" || status === "expired";
}

/** Revoke only a still-active link (others are already unusable). */
export function canRevokeShare(status: ShareStatus): boolean {
  return status === "active";
}

/** New expiry when the user clicks "Extend": one week from now. */
export const EXTEND_BY_MS = 7 * 24 * 60 * 60 * 1000;
