// src/lib/health/rollup.ts
import {
  CAPABILITIES,
  BUCKET_CAPABILITIES,
  CONNECTION_CAPABILITIES,
} from "./capabilities";
import type {
  CapabilityKey,
  CapabilityReport,
  CapabilityStatus,
  ProbeResultRecord,
  ProbeScope,
} from "./probe";

export function rollupCapability(
  _capability: CapabilityKey,
  probes: ProbeResultRecord[],
): CapabilityStatus {
  const required = probes.filter((p) => p.required && p.result !== "skipped");
  if (required.length === 0) return "untested";
  if (required.some((p) => p.result === "denied")) return "unavailable";
  if (required.some((p) => p.result === "unsupported")) return "unsupported";
  if (required.some((p) => p.result === "error")) return "unknown";
  return "available";
}

export function buildCapabilities(
  scope: ProbeScope,
  probeResults: ProbeResultRecord[],
): CapabilityReport[] {
  const capabilityKeys =
    scope === "connection" ? CONNECTION_CAPABILITIES : BUCKET_CAPABILITIES;

  return capabilityKeys.map((key) => {
    const def = CAPABILITIES[key];
    const probesForCap = probeResults.filter((p) => p.capability === key);
    const status = rollupCapability(key, probesForCap);

    return {
      key,
      label: def.label,
      status,
      probes: probesForCap.map((p) => ({
        key: p.key,
        result: p.result,
        errorCode: p.errorCode,
      })),
      requiredIamActions: def.requiredIamActions,
      affects: def.affects,
      fixAction: def.fixAction,
    };
  });
}
