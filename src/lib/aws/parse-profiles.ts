export type ParsedProfile =
  | {
      kind: "static";
      name: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    }
  | { kind: "role-chain"; name: string; reason: string }
  | { kind: "sso"; name: string; reason: string }
  | { kind: "unsupported"; name: string; reason: string };

export interface ParseAwsProfilesInput {
  credentials?: string;
  config?: string;
}

type RawProfile = Record<string, string>;

function parseIni(text: string): Map<string, RawProfile> {
  const sections = new Map<string, RawProfile>();
  let current: RawProfile | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;

    const headerMatch = line.match(/^\[([^\]]+)\]$/);
    if (headerMatch) {
      const name = headerMatch[1].trim();
      current = {};
      sections.set(name, current);
      continue;
    }

    if (current === null) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    current[key] = value;
  }

  return sections;
}

function normaliseConfigHeader(rawName: string): string | null {
  const trimmed = rawName.trim();
  if (trimmed === "default") return "default";
  if (trimmed.startsWith("profile ")) return trimmed.slice("profile ".length).trim();
  return null;
}

export function parseAwsProfiles(input: ParseAwsProfilesInput): ParsedProfile[] {
  const credentialsSections = input.credentials ? parseIni(input.credentials) : new Map<string, RawProfile>();
  const configSections = input.config ? parseIni(input.config) : new Map<string, RawProfile>();

  const merged = new Map<string, RawProfile>();

  for (const [rawName, fields] of configSections) {
    const profileName = normaliseConfigHeader(rawName);
    if (profileName === null) continue;
    merged.set(profileName, { ...fields });
  }

  for (const [name, fields] of credentialsSections) {
    const existing = merged.get(name);
    if (existing) {
      const regionFromConfig = existing["region"];
      const next: RawProfile = { ...existing, ...fields };
      if (regionFromConfig !== undefined) next["region"] = regionFromConfig;
      merged.set(name, next);
    } else {
      merged.set(name, { ...fields });
    }
  }

  const profiles: ParsedProfile[] = [];
  for (const [name, fields] of merged) {
    profiles.push(classify(name, fields));
  }
  return profiles;
}

function classify(name: string, fields: RawProfile): ParsedProfile {
  const accessKeyId = fields["aws_access_key_id"];
  const secretAccessKey = fields["aws_secret_access_key"];
  const region = fields["region"] ?? "us-east-1";

  if (accessKeyId && secretAccessKey) {
    return { kind: "static", name, region, accessKeyId, secretAccessKey };
  }

  return {
    kind: "unsupported",
    name,
    reason: "missing aws_access_key_id or aws_secret_access_key",
  };
}
