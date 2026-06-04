# AWS Profile Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import multiple S3 connections at once from their existing `~/.aws/credentials` + `~/.aws/config` files via a modal flow on the Connections page.

**Architecture:** Files are parsed in the browser by a pure INI parser; only the parsed-profile DTOs cross the wire. A new `POST /api/connections/import` route validates each profile in parallel by calling AWS `ListBuckets`, then persists the valid ones via the existing encrypted-at-rest `createConnection` helper. Static credentials only — role-chain, SSO, and session-token profiles are detected and surfaced as "not supported." No schema changes.

**Tech Stack:** Next.js 16 App Router, React 19, Vitest, Prisma, AWS SDK v3 (`@aws-sdk/client-s3`), Radix UI Dialog, TanStack React Query, Tailwind CSS 4.

**Spec:** [docs/superpowers/specs/2026-06-05-aws-profile-import-design.md](../specs/2026-06-05-aws-profile-import-design.md)

---

## File Structure

**New files:**
- `src/lib/aws/parse-profiles.ts` — Pure INI parser. Exports `parseAwsProfiles()` and the `ParsedProfile` discriminated union. No external deps.
- `src/lib/aws/parse-profiles.test.ts` — Unit tests for the parser. Each rule has its own test.
- `src/lib/aws/import-profiles.ts` — Server-side helper. One pure function (`importAwsProfile`) that takes a profile plus injected `validateCredentials` and `saveConnection` functions, returns a result. This keeps the route handler thin and the logic testable.
- `src/lib/aws/import-profiles.test.ts` — Unit tests for `importAwsProfile` using inline mock dependencies.
- `src/app/api/connections/import/route.ts` — Thin POST handler. Wraps with `withAuth`, validates body, checks ADMIN role, runs `importAwsProfile` per profile via `Promise.allSettled`, returns aggregated results.
- `src/components/connections/import-aws-profile-dialog.tsx` — Modal component with three steps (upload / select / results) managed by a single `useReducer`.

**Modified files:**
- `src/lib/queries/connections.ts` — Add `useImportAwsProfiles` mutation and the request/response types.
- `src/components/connections/connection-list.tsx` — Add "Import from AWS profile" button next to "Add Connection" inside each ADMIN-role workspace header, plus the empty-state. Pass through an `onImport` prop.
- `src/app/(dashboard)/connections/page.tsx` — Add state for the import dialog and pass the open handler to `ConnectionList`. Render the dialog at page level (like the existing edit dialog).

---

## Task 1: Parser scaffold + parse a single static profile from credentials

**Files:**
- Create: `src/lib/aws/parse-profiles.ts`
- Test: `src/lib/aws/parse-profiles.test.ts`

- [ ] **Step 1: Create the parser module with type exports and a stub**

Create `src/lib/aws/parse-profiles.ts`:

```typescript
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

export function parseAwsProfiles(_input: ParseAwsProfilesInput): ParsedProfile[] {
  return [];
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/aws/parse-profiles.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { parseAwsProfiles } from "./parse-profiles";

describe("parseAwsProfiles", () => {
  test("parses a single static profile from a credentials file", () => {
    const credentials = [
      "[default]",
      "aws_access_key_id = AKIA00000000EXAMPLE",
      "aws_secret_access_key = secret123",
    ].join("\n");

    const result = parseAwsProfiles({ credentials });

    expect(result).toEqual([
      {
        kind: "static",
        name: "default",
        region: "us-east-1",
        accessKeyId: "AKIA00000000EXAMPLE",
        secretAccessKey: "secret123",
      },
    ]);
  });

  test("parses multiple named static profiles", () => {
    const credentials = [
      "[default]",
      "aws_access_key_id = AKIA_DEFAULT",
      "aws_secret_access_key = secret_default",
      "",
      "[dev]",
      "aws_access_key_id = AKIA_DEV",
      "aws_secret_access_key = secret_dev",
    ].join("\n");

    const result = parseAwsProfiles({ credentials });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("default");
    expect(result[1].name).toBe("dev");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: FAIL — `expected [] to equal [{ kind: 'static', ... }]`

- [ ] **Step 4: Implement the minimal parser**

Replace the body of `src/lib/aws/parse-profiles.ts`:

```typescript
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

export function parseAwsProfiles(input: ParseAwsProfilesInput): ParsedProfile[] {
  const credentialsSections = input.credentials ? parseIni(input.credentials) : new Map();
  const profiles: ParsedProfile[] = [];

  for (const [name, fields] of credentialsSections) {
    profiles.push(classify(name, fields));
  }

  return profiles;
}

function classify(name: string, fields: RawProfile): ParsedProfile {
  const accessKeyId = fields["aws_access_key_id"];
  const secretAccessKey = fields["aws_secret_access_key"];
  const region = fields["region"] ?? "us-east-1";

  return {
    kind: "static",
    name,
    region,
    accessKeyId,
    secretAccessKey,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/aws/parse-profiles.ts src/lib/aws/parse-profiles.test.ts
git commit -m "feat: add AWS profile parser scaffold with static-profile parsing"
```

---

## Task 2: Parser handles `[profile X]` config-style headers and cross-file merge

**Files:**
- Modify: `src/lib/aws/parse-profiles.ts`
- Modify: `src/lib/aws/parse-profiles.test.ts`

- [ ] **Step 1: Add failing tests for config-style headers + merging**

Append to the `describe("parseAwsProfiles", ...)` block in `src/lib/aws/parse-profiles.test.ts`:

```typescript
test("parses [profile X] headers from a config file", () => {
  const credentials = [
    "[dev]",
    "aws_access_key_id = AKIA_DEV",
    "aws_secret_access_key = secret_dev",
  ].join("\n");

  const config = [
    "[profile dev]",
    "region = eu-west-1",
  ].join("\n");

  const result = parseAwsProfiles({ credentials, config });

  expect(result).toHaveLength(1);
  expect(result[0]).toEqual({
    kind: "static",
    name: "dev",
    region: "eu-west-1",
    accessKeyId: "AKIA_DEV",
    secretAccessKey: "secret_dev",
  });
});

test("treats [default] in config (no 'profile' prefix) as the default profile", () => {
  const credentials = [
    "[default]",
    "aws_access_key_id = AKIA_DEFAULT",
    "aws_secret_access_key = secret_default",
  ].join("\n");

  const config = [
    "[default]",
    "region = ap-southeast-2",
  ].join("\n");

  const result = parseAwsProfiles({ credentials, config });

  expect(result).toHaveLength(1);
  expect(result[0].name).toBe("default");
  if (result[0].kind === "static") {
    expect(result[0].region).toBe("ap-southeast-2");
  }
});

test("merges profiles present in both files (credentials wins for keys, config wins for region)", () => {
  const credentials = [
    "[shared]",
    "aws_access_key_id = AKIA_FROM_CREDS",
    "aws_secret_access_key = secret_from_creds",
    "region = us-east-1",
  ].join("\n");

  const config = [
    "[profile shared]",
    "region = ca-central-1",
  ].join("\n");

  const result = parseAwsProfiles({ credentials, config });

  expect(result).toHaveLength(1);
  if (result[0].kind === "static") {
    expect(result[0].accessKeyId).toBe("AKIA_FROM_CREDS");
    expect(result[0].region).toBe("ca-central-1");
  }
});

test("returns a profile that only appears in config (with no keys) as unsupported", () => {
  const config = [
    "[profile orphan]",
    "region = eu-west-1",
  ].join("\n");

  const result = parseAwsProfiles({ config });

  expect(result).toHaveLength(1);
  expect(result[0].kind).toBe("unsupported");
  expect(result[0].name).toBe("orphan");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: FAIL on the new tests (config not consulted, no merge logic, no `unsupported` classification).

- [ ] **Step 3: Implement config-file handling, header normalization, and merge**

Replace the parser body in `src/lib/aws/parse-profiles.ts` (keep the type exports and `parseIni` helper from Task 1):

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aws/parse-profiles.ts src/lib/aws/parse-profiles.test.ts
git commit -m "feat: parse aws config files and merge with credentials"
```

---

## Task 3: Parser handles comments, blank lines, and surrounding whitespace

**Files:**
- Modify: `src/lib/aws/parse-profiles.test.ts`

The parser already strips comments and blank lines (Task 1 added that). This task adds tests to lock in that behavior and surfaces any regressions.

- [ ] **Step 1: Add failing tests**

Append to the `describe("parseAwsProfiles", ...)` block:

```typescript
test("ignores '#' and ';' comment lines", () => {
  const credentials = [
    "# Top-of-file comment",
    "; alternative comment style",
    "[default]",
    "# inside a section",
    "aws_access_key_id = AKIA_K",
    "; another",
    "aws_secret_access_key = secret_k",
  ].join("\n");

  const result = parseAwsProfiles({ credentials });

  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    kind: "static",
    name: "default",
    accessKeyId: "AKIA_K",
    secretAccessKey: "secret_k",
  });
});

test("ignores blank lines and tolerates surrounding whitespace", () => {
  const credentials = [
    "",
    "   [default]   ",
    "",
    "  aws_access_key_id  =  AKIA_WS  ",
    "  aws_secret_access_key  =  secret_ws  ",
    "",
  ].join("\n");

  const result = parseAwsProfiles({ credentials });

  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    accessKeyId: "AKIA_WS",
    secretAccessKey: "secret_ws",
  });
});

test("returns empty array for completely empty input", () => {
  expect(parseAwsProfiles({})).toEqual([]);
  expect(parseAwsProfiles({ credentials: "" })).toEqual([]);
  expect(parseAwsProfiles({ credentials: "# only a comment" })).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: PASS (Task 1's `parseIni` already strips comments and trims; whitespace tolerance is built in).

If any of the new tests fail (e.g., whitespace-surrounded headers), update `parseIni` to handle them — the current header regex `/^\[([^\]]+)\]$/` matches against an already-trimmed line, so this should pass without changes. Investigate any failure before forcing it through.

- [ ] **Step 3: Commit**

```bash
git add src/lib/aws/parse-profiles.test.ts
git commit -m "test: lock in parser behavior for comments and whitespace"
```

---

## Task 4: Parser classifies role-chain profiles as unsupported

**Files:**
- Modify: `src/lib/aws/parse-profiles.ts`
- Modify: `src/lib/aws/parse-profiles.test.ts`

- [ ] **Step 1: Add failing test**

Append to the `describe("parseAwsProfiles", ...)` block:

```typescript
test("classifies role-chain profiles (role_arn + source_profile) as 'role-chain'", () => {
  const config = [
    "[profile prod]",
    "role_arn = arn:aws:iam::123456789012:role/admin",
    "source_profile = default",
    "region = us-west-2",
  ].join("\n");

  const result = parseAwsProfiles({ config });

  expect(result).toHaveLength(1);
  expect(result[0]).toEqual({
    kind: "role-chain",
    name: "prod",
    reason: "role-chain profiles (role_arn + source_profile) are not yet supported",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: FAIL — the orphan-with-no-keys case currently classifies as `unsupported`, not `role-chain`.

- [ ] **Step 3: Update classification order to detect role-chain first**

Edit `src/lib/aws/parse-profiles.ts` — replace the `classify` function:

```typescript
function classify(name: string, fields: RawProfile): ParsedProfile {
  const accessKeyId = fields["aws_access_key_id"];
  const secretAccessKey = fields["aws_secret_access_key"];
  const region = fields["region"] ?? "us-east-1";

  if (fields["role_arn"] && fields["source_profile"]) {
    return {
      kind: "role-chain",
      name,
      reason: "role-chain profiles (role_arn + source_profile) are not yet supported",
    };
  }

  if (accessKeyId && secretAccessKey) {
    return { kind: "static", name, region, accessKeyId, secretAccessKey };
  }

  return {
    kind: "unsupported",
    name,
    reason: "missing aws_access_key_id or aws_secret_access_key",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aws/parse-profiles.ts src/lib/aws/parse-profiles.test.ts
git commit -m "feat: detect role-chain profiles and mark them unsupported"
```

---

## Task 5: Parser classifies SSO profiles as unsupported

**Files:**
- Modify: `src/lib/aws/parse-profiles.ts`
- Modify: `src/lib/aws/parse-profiles.test.ts`

- [ ] **Step 1: Add failing test**

Append:

```typescript
test("classifies SSO profiles (sso_session or sso_start_url) as 'sso'", () => {
  const config = [
    "[profile via-sso]",
    "sso_session = my-corp-sso",
    "sso_account_id = 123456789012",
    "sso_role_name = AdminAccess",
    "region = us-east-1",
    "",
    "[profile legacy-sso]",
    "sso_start_url = https://example.awsapps.com/start",
    "sso_account_id = 999999999999",
    "sso_role_name = ReadOnly",
    "region = us-east-1",
  ].join("\n");

  const result = parseAwsProfiles({ config });

  expect(result).toHaveLength(2);
  expect(result[0]).toEqual({
    kind: "sso",
    name: "via-sso",
    reason: "SSO / IAM Identity Center profiles are not yet supported",
  });
  expect(result[1].kind).toBe("sso");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: FAIL — both profiles currently classify as `unsupported`.

- [ ] **Step 3: Update `classify` to detect SSO before falling through**

Edit `src/lib/aws/parse-profiles.ts` — replace the `classify` function:

```typescript
function classify(name: string, fields: RawProfile): ParsedProfile {
  const accessKeyId = fields["aws_access_key_id"];
  const secretAccessKey = fields["aws_secret_access_key"];
  const region = fields["region"] ?? "us-east-1";

  if (fields["role_arn"] && fields["source_profile"]) {
    return {
      kind: "role-chain",
      name,
      reason: "role-chain profiles (role_arn + source_profile) are not yet supported",
    };
  }

  if (fields["sso_session"] || fields["sso_start_url"]) {
    return {
      kind: "sso",
      name,
      reason: "SSO / IAM Identity Center profiles are not yet supported",
    };
  }

  if (accessKeyId && secretAccessKey) {
    return { kind: "static", name, region, accessKeyId, secretAccessKey };
  }

  return {
    kind: "unsupported",
    name,
    reason: "missing aws_access_key_id or aws_secret_access_key",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aws/parse-profiles.ts src/lib/aws/parse-profiles.test.ts
git commit -m "feat: detect SSO profiles and mark them unsupported"
```

---

## Task 6: Parser classifies session-token credentials and missing-secret as unsupported

**Files:**
- Modify: `src/lib/aws/parse-profiles.ts`
- Modify: `src/lib/aws/parse-profiles.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```typescript
test("classifies profiles with aws_session_token as 'unsupported' with the documented reason", () => {
  const credentials = [
    "[temp]",
    "aws_access_key_id = AKIA_TEMP",
    "aws_secret_access_key = secret_temp",
    "aws_session_token = FQoGZXIvYXdz...",
  ].join("\n");

  const result = parseAwsProfiles({ credentials });

  expect(result).toHaveLength(1);
  expect(result[0]).toEqual({
    kind: "unsupported",
    name: "temp",
    reason: "session-token credentials aren't supported (they expire)",
  });
});

test("classifies a profile missing only the secret access key as 'unsupported'", () => {
  const credentials = [
    "[half]",
    "aws_access_key_id = AKIA_HALF",
  ].join("\n");

  const result = parseAwsProfiles({ credentials });

  expect(result[0]).toEqual({
    kind: "unsupported",
    name: "half",
    reason: "missing aws_secret_access_key",
  });
});

test("classifies a profile missing only the access key id as 'unsupported'", () => {
  const credentials = [
    "[half]",
    "aws_secret_access_key = secret_only",
  ].join("\n");

  const result = parseAwsProfiles({ credentials });

  expect(result[0]).toEqual({
    kind: "unsupported",
    name: "half",
    reason: "missing aws_access_key_id",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: FAIL — session-token currently classifies as `static`, and the reason strings for half-profiles don't match.

- [ ] **Step 3: Update `classify` for session-token and refined missing-key reasons**

Edit `src/lib/aws/parse-profiles.ts` — replace the `classify` function:

```typescript
function classify(name: string, fields: RawProfile): ParsedProfile {
  const accessKeyId = fields["aws_access_key_id"];
  const secretAccessKey = fields["aws_secret_access_key"];
  const sessionToken = fields["aws_session_token"];
  const region = fields["region"] ?? "us-east-1";

  if (fields["role_arn"] && fields["source_profile"]) {
    return {
      kind: "role-chain",
      name,
      reason: "role-chain profiles (role_arn + source_profile) are not yet supported",
    };
  }

  if (fields["sso_session"] || fields["sso_start_url"]) {
    return {
      kind: "sso",
      name,
      reason: "SSO / IAM Identity Center profiles are not yet supported",
    };
  }

  if (sessionToken) {
    return {
      kind: "unsupported",
      name,
      reason: "session-token credentials aren't supported (they expire)",
    };
  }

  if (accessKeyId && secretAccessKey) {
    return { kind: "static", name, region, accessKeyId, secretAccessKey };
  }

  if (accessKeyId && !secretAccessKey) {
    return { kind: "unsupported", name, reason: "missing aws_secret_access_key" };
  }

  if (!accessKeyId && secretAccessKey) {
    return { kind: "unsupported", name, reason: "missing aws_access_key_id" };
  }

  return {
    kind: "unsupported",
    name,
    reason: "missing aws_access_key_id or aws_secret_access_key",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aws/parse-profiles.ts src/lib/aws/parse-profiles.test.ts
git commit -m "feat: classify session-token and partial-key profiles as unsupported"
```

---

## Task 7: Parser skips `[sso-session X]` and `[services X]` non-profile sections (lock-in + realistic fixture)

**Files:**
- Modify: `src/lib/aws/parse-profiles.test.ts`

Task 2's `normaliseConfigHeader` already returns `null` for any header that isn't `[default]` or `[profile X]`, so the parser is *already* ignoring `[sso-session X]` and `[services X]` sections. This task locks that behavior in with explicit tests and adds the realistic multi-profile fixture from the spec.

- [ ] **Step 1: Add the tests**

Append:

```typescript
test("ignores [sso-session X] section headers entirely", () => {
  const config = [
    "[sso-session my-corp-sso]",
    "sso_start_url = https://example.awsapps.com/start",
    "sso_region = us-east-1",
    "",
    "[profile dev]",
    "region = us-west-2",
  ].join("\n");

  const credentials = [
    "[dev]",
    "aws_access_key_id = AKIA_DEV",
    "aws_secret_access_key = secret_dev",
  ].join("\n");

  const result = parseAwsProfiles({ credentials, config });

  expect(result.map((p) => p.name)).toEqual(["dev"]);
});

test("ignores [services X] section headers entirely", () => {
  const config = [
    "[services my-services]",
    "s3 =",
    "  endpoint_url = http://custom",
    "",
    "[profile dev]",
    "region = eu-central-1",
  ].join("\n");

  const credentials = [
    "[dev]",
    "aws_access_key_id = AKIA_DEV",
    "aws_secret_access_key = secret_dev",
  ].join("\n");

  const result = parseAwsProfiles({ credentials, config });

  expect(result.map((p) => p.name)).toEqual(["dev"]);
});

test("realistic multi-profile fixture parses to the expected mix of kinds", () => {
  const credentials = [
    "# Personal credentials file",
    "[default]",
    "aws_access_key_id = AKIA_DEFAULT",
    "aws_secret_access_key = secret_default",
    "",
    "[work]",
    "aws_access_key_id = AKIA_WORK",
    "aws_secret_access_key = secret_work",
    "",
    "[temp-session]",
    "aws_access_key_id = AKIA_TEMP",
    "aws_secret_access_key = secret_temp",
    "aws_session_token = AQoDYXdz...",
  ].join("\n");

  const config = [
    "[default]",
    "region = us-east-1",
    "",
    "[profile work]",
    "region = us-west-2",
    "",
    "[profile prod]",
    "role_arn = arn:aws:iam::123456789012:role/admin",
    "source_profile = default",
    "region = us-west-2",
    "",
    "[profile sso-test]",
    "sso_session = my-corp",
    "sso_account_id = 111111111111",
    "sso_role_name = ReadOnly",
    "",
    "[sso-session my-corp]",
    "sso_start_url = https://example.awsapps.com/start",
    "sso_region = us-east-1",
  ].join("\n");

  const result = parseAwsProfiles({ credentials, config });

  const byName = Object.fromEntries(result.map((p) => [p.name, p]));
  expect(byName["default"].kind).toBe("static");
  expect(byName["work"].kind).toBe("static");
  expect(byName["temp-session"].kind).toBe("unsupported");
  expect(byName["prod"].kind).toBe("role-chain");
  expect(byName["sso-test"].kind).toBe("sso");
  expect(byName["my-corp"]).toBeUndefined();
  expect(result).toHaveLength(5);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test src/lib/aws/parse-profiles.test.ts`
Expected: PASS — all parser tests green, including the new fixture and skip tests.

If any of the new tests fail, the parser has a real bug. Investigate before making changes — most likely culprits are the merge step in `parseAwsProfiles` (an `sso-session` section somehow getting added to `merged`) or `normaliseConfigHeader` misclassifying a header.

- [ ] **Step 3: Commit**

```bash
git add src/lib/aws/parse-profiles.test.ts
git commit -m "test: lock in sso-session/services skipping with realistic fixture"
```

---

## Task 8: Backend helper `importAwsProfile` — success and error mapping

**Files:**
- Create: `src/lib/aws/import-profiles.ts`
- Test: `src/lib/aws/import-profiles.test.ts`

The helper is the testable core of the import API route. It accepts injected `validateCredentials` and `saveConnection` functions — the route handler provides real implementations (AWS SDK + Prisma); tests pass mocks.

- [ ] **Step 1: Create the helper module with type exports and a stub**

Create `src/lib/aws/import-profiles.ts`:

```typescript
export interface ImportProfileRequest {
  name: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ImportProfileResult {
  name: string;
  status: "saved" | "invalid";
  connectionId?: string;
  error?: string;
}

export interface ValidateCredentialsInput {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type ValidateCredentialsResult =
  | { ok: true }
  | { ok: false; error: string };

export interface SaveConnectionInput {
  name: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface ImportProfileDeps {
  validateCredentials: (input: ValidateCredentialsInput) => Promise<ValidateCredentialsResult>;
  saveConnection: (input: SaveConnectionInput) => Promise<{ id: string }>;
}

export async function importAwsProfile(
  _profile: ImportProfileRequest,
  _deps: ImportProfileDeps
): Promise<ImportProfileResult> {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/aws/import-profiles.test.ts`:

```typescript
import { describe, test, expect, vi } from "vitest";
import { importAwsProfile, type ImportProfileDeps } from "./import-profiles";

const VALID_PROFILE = {
  name: "dev",
  region: "us-west-2",
  accessKeyId: "AKIA_DEV",
  secretAccessKey: "secret_dev",
};

function makeDeps(overrides: Partial<ImportProfileDeps> = {}): ImportProfileDeps {
  return {
    validateCredentials: vi.fn().mockResolvedValue({ ok: true }),
    saveConnection: vi.fn().mockResolvedValue({ id: "conn-123" }),
    ...overrides,
  };
}

describe("importAwsProfile", () => {
  test("returns 'saved' with the new connection id when validate + save succeed", async () => {
    const deps = makeDeps();
    const result = await importAwsProfile(VALID_PROFILE, deps);

    expect(result).toEqual({
      name: "dev",
      status: "saved",
      connectionId: "conn-123",
    });
  });

  test("passes the AWS endpoint and forcePathStyle=false to saveConnection", async () => {
    const saveConnection = vi.fn().mockResolvedValue({ id: "conn-1" });
    const deps = makeDeps({ saveConnection });

    await importAwsProfile(VALID_PROFILE, deps);

    expect(saveConnection).toHaveBeenCalledWith({
      name: "dev",
      endpoint: "https://s3.amazonaws.com",
      region: "us-west-2",
      accessKeyId: "AKIA_DEV",
      secretAccessKey: "secret_dev",
      forcePathStyle: false,
    });
  });

  test("returns 'invalid' with the validate error when credentials don't work, and never saves", async () => {
    const saveConnection = vi.fn();
    const deps = makeDeps({
      validateCredentials: vi.fn().mockResolvedValue({ ok: false, error: "InvalidAccessKeyId" }),
      saveConnection,
    });

    const result = await importAwsProfile(VALID_PROFILE, deps);

    expect(result).toEqual({
      name: "dev",
      status: "invalid",
      error: "InvalidAccessKeyId",
    });
    expect(saveConnection).not.toHaveBeenCalled();
  });

  test("returns 'invalid' with the failure error when saveConnection throws", async () => {
    const deps = makeDeps({
      saveConnection: vi.fn().mockRejectedValue(new Error("DB unavailable")),
    });

    const result = await importAwsProfile(VALID_PROFILE, deps);

    expect(result).toEqual({
      name: "dev",
      status: "invalid",
      error: "DB unavailable",
    });
  });

  test("returns 'invalid' with a generic message when validateCredentials throws", async () => {
    const deps = makeDeps({
      validateCredentials: vi.fn().mockRejectedValue(new Error("network: ECONNRESET")),
    });

    const result = await importAwsProfile(VALID_PROFILE, deps);

    expect(result.status).toBe("invalid");
    expect(result.error).toContain("ECONNRESET");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/lib/aws/import-profiles.test.ts`
Expected: FAIL — all 5 tests, because the function throws "not implemented."

- [ ] **Step 4: Implement the helper**

Replace the body of `src/lib/aws/import-profiles.ts` (keep the type exports above the function):

```typescript
export interface ImportProfileRequest {
  name: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ImportProfileResult {
  name: string;
  status: "saved" | "invalid";
  connectionId?: string;
  error?: string;
}

export interface ValidateCredentialsInput {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type ValidateCredentialsResult =
  | { ok: true }
  | { ok: false; error: string };

export interface SaveConnectionInput {
  name: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface ImportProfileDeps {
  validateCredentials: (input: ValidateCredentialsInput) => Promise<ValidateCredentialsResult>;
  saveConnection: (input: SaveConnectionInput) => Promise<{ id: string }>;
}

const AWS_S3_ENDPOINT = "https://s3.amazonaws.com";

export async function importAwsProfile(
  profile: ImportProfileRequest,
  deps: ImportProfileDeps
): Promise<ImportProfileResult> {
  let validation: ValidateCredentialsResult;
  try {
    validation = await deps.validateCredentials({
      region: profile.region,
      accessKeyId: profile.accessKeyId,
      secretAccessKey: profile.secretAccessKey,
    });
  } catch (err) {
    return {
      name: profile.name,
      status: "invalid",
      error: err instanceof Error ? err.message : "Unknown validation error",
    };
  }

  if (!validation.ok) {
    return { name: profile.name, status: "invalid", error: validation.error };
  }

  try {
    const saved = await deps.saveConnection({
      name: profile.name,
      endpoint: AWS_S3_ENDPOINT,
      region: profile.region,
      accessKeyId: profile.accessKeyId,
      secretAccessKey: profile.secretAccessKey,
      forcePathStyle: false,
    });
    return { name: profile.name, status: "saved", connectionId: saved.id };
  } catch (err) {
    return {
      name: profile.name,
      status: "invalid",
      error: err instanceof Error ? err.message : "Failed to save connection",
    };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/lib/aws/import-profiles.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/aws/import-profiles.ts src/lib/aws/import-profiles.test.ts
git commit -m "feat: add importAwsProfile helper with dependency-injected validate + save"
```

---

## Task 9: API route — `POST /api/connections/import`

**Files:**
- Create: `src/app/api/connections/import/route.ts`

This route is thin: parse + validate body, check workspace ADMIN role, check tier-limit headroom (we're about to add up to N connections), then run `importAwsProfile` per profile in parallel via `Promise.allSettled`. It returns the aggregated results.

- [ ] **Step 1: Create the route file**

Create `src/app/api/connections/import/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { withAuth } from "@/lib/auth";
import {
  createConnection,
  getWorkspaceAccess,
  ensurePersonalWorkspace,
} from "@/lib/db/connections";
import { canCreateConnection } from "@/lib/subscriptions";
import { createS3Client } from "@/lib/s3/client";
import {
  importAwsProfile,
  type ImportProfileRequest,
  type ImportProfileResult,
  type ValidateCredentialsResult,
} from "@/lib/aws/import-profiles";

interface ImportRequestBody {
  workspaceId?: string;
  profiles: ImportProfileRequest[];
}

function isProfile(value: unknown): value is ImportProfileRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    typeof v.region === "string" &&
    typeof v.accessKeyId === "string" &&
    typeof v.secretAccessKey === "string"
  );
}

function validateBody(body: unknown): ImportRequestBody | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.profiles) || b.profiles.length === 0) {
    return { error: "profiles must be a non-empty array" };
  }
  if (!b.profiles.every(isProfile)) {
    return { error: "every profile must have name, region, accessKeyId, secretAccessKey" };
  }
  return {
    workspaceId: typeof b.workspaceId === "string" ? b.workspaceId : undefined,
    profiles: b.profiles as ImportProfileRequest[],
  };
}

const SDK_ERROR_LABELS: Record<string, string> = {
  InvalidAccessKeyId: "InvalidAccessKeyId",
  SignatureDoesNotMatch: "SignatureDoesNotMatch",
  AccessDenied: "AccessDenied",
};

function mapSdkError(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name: unknown }).name);
    if (SDK_ERROR_LABELS[name]) return SDK_ERROR_LABELS[name];
  }
  if (err && typeof err === "object" && "Code" in err) {
    const code = String((err as { Code: unknown }).Code);
    if (SDK_ERROR_LABELS[code]) return SDK_ERROR_LABELS[code];
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/network|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(message)) return "NetworkError";
  return "Unknown";
}

export const POST = withAuth(async (req, { user }) => {
  const rawBody = await req.json().catch(() => null);
  const parsed = validateBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let targetWorkspaceId: string;
  if (parsed.workspaceId) {
    const access = await getWorkspaceAccess(parsed.workspaceId, user.id);
    if (!access || access.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to import into this workspace" },
        { status: 403 }
      );
    }
    targetWorkspaceId = access.workspace.id;
  } else {
    const personalWorkspace = await ensurePersonalWorkspace(user.id);
    targetWorkspaceId = personalWorkspace.id;
  }

  const tier = user.subscription?.tier ?? "FREE";
  const limitCheck = await canCreateConnection(targetWorkspaceId, tier);
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: limitCheck.reason }, { status: 403 });
  }
  if (
    typeof limitCheck.current === "number" &&
    typeof limitCheck.limit === "number" &&
    limitCheck.current + parsed.profiles.length > limitCheck.limit
  ) {
    const remaining = Math.max(0, limitCheck.limit - limitCheck.current);
    return NextResponse.json(
      {
        error: `Importing ${parsed.profiles.length} profiles would exceed your ${limitCheck.limit}-connection limit (currently using ${limitCheck.current}). You can import up to ${remaining} more.`,
      },
      { status: 403 }
    );
  }

  const validateCredentials = async (input: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  }): Promise<ValidateCredentialsResult> => {
    try {
      const client = createS3Client({
        endpoint: "https://s3.amazonaws.com",
        region: input.region,
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
        forcePathStyle: false,
      });
      await client.send(new ListBucketsCommand({}));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapSdkError(err) };
    }
  };

  const saveConnection = async (input: {
    name: string;
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  }): Promise<{ id: string }> => {
    const connection = await createConnection(
      user.id,
      {
        name: input.name,
        endpoint: input.endpoint,
        region: input.region,
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
        forcePathStyle: input.forcePathStyle,
      },
      targetWorkspaceId
    );
    return { id: connection.id };
  };

  const settled = await Promise.allSettled(
    parsed.profiles.map((profile) =>
      importAwsProfile(profile, { validateCredentials, saveConnection })
    )
  );

  const results: ImportProfileResult[] = settled.map((entry, idx) => {
    if (entry.status === "fulfilled") return entry.value;
    return {
      name: parsed.profiles[idx].name,
      status: "invalid",
      error:
        entry.reason instanceof Error ? entry.reason.message : "Unknown error",
    };
  });

  return NextResponse.json({ results });
});
```

- [ ] **Step 2: Sanity-check the build compiles**

Run: `pnpm lint`
Expected: no errors in `src/app/api/connections/import/route.ts` (TypeScript errors from the new file would surface as lint failures via the Next.js lint config).

If lint output includes pre-existing warnings unrelated to this file, ignore those.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/connections/import/route.ts
git commit -m "feat: add POST /api/connections/import endpoint"
```

---

## Task 10: React Query mutation hook for the import endpoint

**Files:**
- Modify: `src/lib/queries/connections.ts`

- [ ] **Step 1: Add the mutation hook**

Open `src/lib/queries/connections.ts`. After the `useDeleteConnection` export, append:

```typescript
export interface ImportProfilePayload {
  name: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ImportProfileResult {
  name: string;
  status: "saved" | "invalid";
  connectionId?: string;
  error?: string;
}

export interface ImportAwsProfilesInput {
  workspaceId?: string;
  profiles: ImportProfilePayload[];
}

export interface ImportAwsProfilesResponse {
  results: ImportProfileResult[];
}

async function importAwsProfiles(
  input: ImportAwsProfilesInput
): Promise<ImportAwsProfilesResponse> {
  const response = await fetch("/api/connections/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Failed to import AWS profiles");
  }

  return response.json();
}

export function useImportAwsProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ImportAwsProfilesInput) => importAwsProfiles(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify lint passes**

Run: `pnpm lint`
Expected: no errors in `src/lib/queries/connections.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/connections.ts
git commit -m "feat: add useImportAwsProfiles mutation hook"
```

---

## Task 11: Dialog component — Step 1 (upload + parse files)

**Files:**
- Create: `src/components/connections/import-aws-profile-dialog.tsx`

The dialog is React-only and not unit-tested (matches the existing pattern of testing pure logic, not components). We'll build it incrementally across Tasks 11–13 and verify everything in the manual smoke test (Task 15).

- [ ] **Step 1: Create the dialog skeleton with the upload step**

Create `src/components/connections/import-aws-profile-dialog.tsx`:

```typescript
"use client";

import { useReducer, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseAwsProfiles, type ParsedProfile } from "@/lib/aws/parse-profiles";

interface ImportAwsProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWorkspaceId?: string;
}

interface UploadState {
  step: "upload";
  credentials?: string;
  config?: string;
  parseError?: string;
}

type State = UploadState;

type Action =
  | { type: "set-credentials"; content: string }
  | { type: "set-config"; content: string }
  | { type: "set-parse-error"; error: string }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-credentials":
      return { ...state, credentials: action.content, parseError: undefined };
    case "set-config":
      return { ...state, config: action.content, parseError: undefined };
    case "set-parse-error":
      return { ...state, parseError: action.error };
    case "reset":
      return { step: "upload" };
  }
}

const MAX_FILE_SIZE = 1024 * 1024;

export function ImportAwsProfileDialog({
  open,
  onOpenChange,
  defaultWorkspaceId: _defaultWorkspaceId,
}: ImportAwsProfileDialogProps) {
  const [state, dispatch] = useReducer(reducer, { step: "upload" });
  const credentialsInputRef = useRef<HTMLInputElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (
    file: File,
    target: "credentials" | "config"
  ): Promise<void> => {
    if (file.size > MAX_FILE_SIZE) {
      dispatch({
        type: "set-parse-error",
        error: `File too large — AWS config files are normally under 100 KB.`,
      });
      return;
    }
    const content = await file.text();
    dispatch({
      type: target === "credentials" ? "set-credentials" : "set-config",
      content,
    });
  };

  const canParse = !!state.credentials;
  let parsedPreview: ParsedProfile[] = [];
  if (canParse) {
    try {
      parsedPreview = parseAwsProfiles({
        credentials: state.credentials,
        config: state.config,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown parse error";
      if (state.parseError !== message) {
        dispatch({ type: "set-parse-error", error: message });
      }
    }
  }

  const close = () => {
    dispatch({ type: "reset" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from AWS profile</DialogTitle>
          <DialogDescription>
            Upload your <code>~/.aws/credentials</code> file (and optionally{" "}
            <code>~/.aws/config</code>) to import multiple connections at once.
            Files are parsed in your browser and never uploaded as files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="credentials-file">credentials file (required)</Label>
            <input
              ref={credentialsInputRef}
              id="credentials-file"
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleFile(file, "credentials");
              }}
              className="text-sm"
            />
            {state.credentials && (
              <p className="text-xs text-green-600">
                Loaded ({state.credentials.length.toLocaleString()} chars)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="config-file">config file (optional)</Label>
            <input
              ref={configInputRef}
              id="config-file"
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleFile(file, "config");
              }}
              className="text-sm"
            />
            {state.config && (
              <p className="text-xs text-green-600">
                Loaded ({state.config.length.toLocaleString()} chars)
              </p>
            )}
          </div>

          {state.parseError && (
            <p className="text-sm text-destructive">{state.parseError}</p>
          )}

          {canParse && !state.parseError && (
            <p className="text-sm text-muted-foreground">
              Found {parsedPreview.length} profile
              {parsedPreview.length === 1 ? "" : "s"}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!canParse || parsedPreview.length === 0}>
            Next
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `pnpm lint`
Expected: no errors. (The `_defaultWorkspaceId` prefix avoids the unused-var rule.)

- [ ] **Step 3: Commit**

```bash
git add src/components/connections/import-aws-profile-dialog.tsx
git commit -m "feat: scaffold ImportAwsProfileDialog upload step"
```

---

## Task 12: Dialog component — Step 2 (select profiles + workspace)

**Files:**
- Modify: `src/components/connections/import-aws-profile-dialog.tsx`

- [ ] **Step 1: Add the select step to the reducer and UI**

Replace the entire content of `src/components/connections/import-aws-profile-dialog.tsx`:

```typescript
"use client";

import { useReducer, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseAwsProfiles, type ParsedProfile } from "@/lib/aws/parse-profiles";
import { useWorkspaces } from "@/lib/queries/workspaces";

interface ImportAwsProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWorkspaceId?: string;
}

interface UploadState {
  step: "upload";
  credentials?: string;
  config?: string;
  parseError?: string;
}

interface SelectState {
  step: "select";
  profiles: ParsedProfile[];
  selection: Map<string, { selected: boolean; name: string }>;
  workspaceId: string;
}

type State = UploadState | SelectState;

type Action =
  | { type: "set-credentials"; content: string }
  | { type: "set-config"; content: string }
  | { type: "set-parse-error"; error: string }
  | {
      type: "advance-to-select";
      profiles: ParsedProfile[];
      defaultWorkspaceId: string;
    }
  | { type: "back-to-upload" }
  | { type: "toggle-profile"; name: string }
  | { type: "rename-profile"; name: string; newName: string }
  | { type: "set-all"; selected: boolean }
  | { type: "set-workspace"; workspaceId: string }
  | { type: "reset" };

function makeInitialSelection(
  profiles: ParsedProfile[]
): Map<string, { selected: boolean; name: string }> {
  const map = new Map<string, { selected: boolean; name: string }>();
  for (const p of profiles) {
    map.set(p.name, { selected: p.kind === "static", name: p.name });
  }
  return map;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-credentials":
      if (state.step !== "upload") return state;
      return { ...state, credentials: action.content, parseError: undefined };
    case "set-config":
      if (state.step !== "upload") return state;
      return { ...state, config: action.content, parseError: undefined };
    case "set-parse-error":
      if (state.step !== "upload") return state;
      return { ...state, parseError: action.error };
    case "advance-to-select":
      return {
        step: "select",
        profiles: action.profiles,
        selection: makeInitialSelection(action.profiles),
        workspaceId: action.defaultWorkspaceId,
      };
    case "back-to-upload":
      return { step: "upload" };
    case "toggle-profile": {
      if (state.step !== "select") return state;
      const next = new Map(state.selection);
      const entry = next.get(action.name);
      if (entry) next.set(action.name, { ...entry, selected: !entry.selected });
      return { ...state, selection: next };
    }
    case "rename-profile": {
      if (state.step !== "select") return state;
      const next = new Map(state.selection);
      const entry = next.get(action.name);
      if (entry) next.set(action.name, { ...entry, name: action.newName });
      return { ...state, selection: next };
    }
    case "set-all": {
      if (state.step !== "select") return state;
      const next = new Map(state.selection);
      for (const [key, value] of next) {
        const profile = state.profiles.find((p) => p.name === key);
        if (profile?.kind === "static") {
          next.set(key, { ...value, selected: action.selected });
        }
      }
      return { ...state, selection: next };
    }
    case "set-workspace":
      if (state.step !== "select") return state;
      return { ...state, workspaceId: action.workspaceId };
    case "reset":
      return { step: "upload" };
  }
}

const MAX_FILE_SIZE = 1024 * 1024;

export function ImportAwsProfileDialog({
  open,
  onOpenChange,
  defaultWorkspaceId,
}: ImportAwsProfileDialogProps) {
  const [state, dispatch] = useReducer(reducer, { step: "upload" });
  const { data: workspaces = [] } = useWorkspaces();
  const adminWorkspaces = useMemo(
    () => workspaces.filter((w) => w.role === "ADMIN"),
    [workspaces]
  );

  const handleFile = async (
    file: File,
    target: "credentials" | "config"
  ): Promise<void> => {
    if (file.size > MAX_FILE_SIZE) {
      dispatch({
        type: "set-parse-error",
        error: `File too large — AWS config files are normally under 100 KB.`,
      });
      return;
    }
    const content = await file.text();
    dispatch({
      type: target === "credentials" ? "set-credentials" : "set-config",
      content,
    });
  };

  const close = () => {
    dispatch({ type: "reset" });
    onOpenChange(false);
  };

  if (state.step === "upload") {
    let parsedPreview: ParsedProfile[] = [];
    if (state.credentials) {
      try {
        parsedPreview = parseAwsProfiles({
          credentials: state.credentials,
          config: state.config,
        });
      } catch (err) {
        parsedPreview = [];
      }
    }

    const fallbackWorkspaceId =
      defaultWorkspaceId ??
      adminWorkspaces.find((w) => w.type === "PERSONAL")?.id ??
      adminWorkspaces[0]?.id ??
      "";

    return (
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from AWS profile</DialogTitle>
            <DialogDescription>
              Upload your <code>~/.aws/credentials</code> file (and optionally{" "}
              <code>~/.aws/config</code>) to import multiple connections at
              once. Files are parsed in your browser and never uploaded as
              files.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="credentials-file">credentials file (required)</Label>
              <input
                id="credentials-file"
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleFile(file, "credentials");
                }}
                className="text-sm"
              />
              {state.credentials && (
                <p className="text-xs text-green-600">
                  Loaded ({state.credentials.length.toLocaleString()} chars)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="config-file">config file (optional)</Label>
              <input
                id="config-file"
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleFile(file, "config");
                }}
                className="text-sm"
              />
              {state.config && (
                <p className="text-xs text-green-600">
                  Loaded ({state.config.length.toLocaleString()} chars)
                </p>
              )}
            </div>

            {state.parseError && (
              <p className="text-sm text-destructive">{state.parseError}</p>
            )}

            {state.credentials && !state.parseError && (
              <p className="text-sm text-muted-foreground">
                Found {parsedPreview.length} profile
                {parsedPreview.length === 1 ? "" : "s"}.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!state.credentials || parsedPreview.length === 0}
              onClick={() =>
                dispatch({
                  type: "advance-to-select",
                  profiles: parsedPreview,
                  defaultWorkspaceId: fallbackWorkspaceId,
                })
              }
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // state.step === "select"
  const importableCount = Array.from(state.selection.values()).filter(
    (s) => s.selected && s.name.trim().length > 0
  ).length;
  const allNamesValid = Array.from(state.selection.entries()).every(
    ([profileName, sel]) => {
      const profile = state.profiles.find((p) => p.name === profileName);
      if (profile?.kind !== "static") return true;
      if (!sel.selected) return true;
      return sel.name.trim().length > 0;
    }
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {state.profiles.length} profiles found, {importableCount} importable
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {adminWorkspaces.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="import-workspace">Workspace</Label>
              <select
                id="import-workspace"
                value={state.workspaceId}
                onChange={(e) =>
                  dispatch({ type: "set-workspace", workspaceId: e.target.value })
                }
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                {adminWorkspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.type === "PERSONAL" ? "Personal" : "Team"})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <div className="flex gap-2">
              <button
                type="button"
                className="underline text-muted-foreground"
                onClick={() => dispatch({ type: "set-all", selected: true })}
              >
                Select all importable
              </button>
              <button
                type="button"
                className="underline text-muted-foreground"
                onClick={() => dispatch({ type: "set-all", selected: false })}
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="border rounded-md divide-y max-h-[40vh] overflow-y-auto">
            {state.profiles.map((profile) => {
              const sel = state.selection.get(profile.name);
              const isStatic = profile.kind === "static";
              return (
                <div
                  key={profile.name}
                  className="flex items-center gap-3 p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={!!sel?.selected}
                    disabled={!isStatic}
                    onChange={() =>
                      dispatch({ type: "toggle-profile", name: profile.name })
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          isStatic ? "font-medium" : "text-muted-foreground"
                        }
                      >
                        {profile.name}
                      </span>
                      {isStatic && (
                        <span className="text-xs text-muted-foreground">
                          {profile.region}
                        </span>
                      )}
                    </div>
                    {!isStatic && (
                      <p className="text-xs text-muted-foreground">
                        {"reason" in profile ? profile.reason : ""}
                      </p>
                    )}
                  </div>
                  {isStatic && sel && (
                    <Input
                      className="w-48 h-8 text-xs"
                      value={sel.name}
                      onChange={(e) =>
                        dispatch({
                          type: "rename-profile",
                          name: profile.name,
                          newName: e.target.value,
                        })
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>

          {!allNamesValid && (
            <p className="text-sm text-destructive">
              Connection names cannot be empty.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "back-to-upload" })}
          >
            Back
          </Button>
          <Button disabled={importableCount === 0 || !allNamesValid}>
            Import {importableCount} profile{importableCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `pnpm lint`
Expected: no errors. The `parsedPreview = []` catch branch may trigger an unused-binding warning — if it does, change the catch to `catch { parsedPreview = []; }` (omit the unused identifier).

- [ ] **Step 3: Commit**

```bash
git add src/components/connections/import-aws-profile-dialog.tsx
git commit -m "feat: add profile-selection step to ImportAwsProfileDialog"
```

---

## Task 13: Dialog component — Step 3 (importing + results)

**Files:**
- Modify: `src/components/connections/import-aws-profile-dialog.tsx`

- [ ] **Step 1: Add the importing and results states**

Edit `src/components/connections/import-aws-profile-dialog.tsx`. Replace the entire file with this final version:

```typescript
"use client";

import { useReducer, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseAwsProfiles, type ParsedProfile } from "@/lib/aws/parse-profiles";
import { useWorkspaces } from "@/lib/queries/workspaces";
import {
  useImportAwsProfiles,
  type ImportProfilePayload,
  type ImportProfileResult,
} from "@/lib/queries/connections";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface ImportAwsProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWorkspaceId?: string;
}

interface UploadState {
  step: "upload";
  credentials?: string;
  config?: string;
  parseError?: string;
}

interface SelectState {
  step: "select";
  profiles: ParsedProfile[];
  selection: Map<string, { selected: boolean; name: string }>;
  workspaceId: string;
}

interface ImportingState {
  step: "importing";
  count: number;
  previousSelect: SelectState;
}

interface ResultsState {
  step: "results";
  results: ImportProfileResult[];
}

type State = UploadState | SelectState | ImportingState | ResultsState;

type Action =
  | { type: "set-credentials"; content: string }
  | { type: "set-config"; content: string }
  | { type: "set-parse-error"; error: string }
  | {
      type: "advance-to-select";
      profiles: ParsedProfile[];
      defaultWorkspaceId: string;
    }
  | { type: "back-to-upload" }
  | { type: "toggle-profile"; name: string }
  | { type: "rename-profile"; name: string; newName: string }
  | { type: "set-all"; selected: boolean }
  | { type: "set-workspace"; workspaceId: string }
  | { type: "start-importing"; count: number }
  | { type: "import-failed" }
  | { type: "show-results"; results: ImportProfileResult[] }
  | { type: "reset" };

function makeInitialSelection(
  profiles: ParsedProfile[]
): Map<string, { selected: boolean; name: string }> {
  const map = new Map<string, { selected: boolean; name: string }>();
  for (const p of profiles) {
    map.set(p.name, { selected: p.kind === "static", name: p.name });
  }
  return map;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-credentials":
      if (state.step !== "upload") return state;
      return { ...state, credentials: action.content, parseError: undefined };
    case "set-config":
      if (state.step !== "upload") return state;
      return { ...state, config: action.content, parseError: undefined };
    case "set-parse-error":
      if (state.step !== "upload") return state;
      return { ...state, parseError: action.error };
    case "advance-to-select":
      return {
        step: "select",
        profiles: action.profiles,
        selection: makeInitialSelection(action.profiles),
        workspaceId: action.defaultWorkspaceId,
      };
    case "back-to-upload":
      return { step: "upload" };
    case "toggle-profile": {
      if (state.step !== "select") return state;
      const next = new Map(state.selection);
      const entry = next.get(action.name);
      if (entry) next.set(action.name, { ...entry, selected: !entry.selected });
      return { ...state, selection: next };
    }
    case "rename-profile": {
      if (state.step !== "select") return state;
      const next = new Map(state.selection);
      const entry = next.get(action.name);
      if (entry) next.set(action.name, { ...entry, name: action.newName });
      return { ...state, selection: next };
    }
    case "set-all": {
      if (state.step !== "select") return state;
      const next = new Map(state.selection);
      for (const [key, value] of next) {
        const profile = state.profiles.find((p) => p.name === key);
        if (profile?.kind === "static") {
          next.set(key, { ...value, selected: action.selected });
        }
      }
      return { ...state, selection: next };
    }
    case "set-workspace":
      if (state.step !== "select") return state;
      return { ...state, workspaceId: action.workspaceId };
    case "start-importing":
      if (state.step !== "select") return state;
      return { step: "importing", count: action.count, previousSelect: state };
    case "import-failed":
      if (state.step !== "importing") return state;
      return state.previousSelect;
    case "show-results":
      return { step: "results", results: action.results };
    case "reset":
      return { step: "upload" };
  }
}

const MAX_FILE_SIZE = 1024 * 1024;

export function ImportAwsProfileDialog({
  open,
  onOpenChange,
  defaultWorkspaceId,
}: ImportAwsProfileDialogProps) {
  const [state, dispatch] = useReducer(reducer, { step: "upload" });
  const { data: workspaces = [] } = useWorkspaces();
  const importMutation = useImportAwsProfiles();
  const { addNotification } = useNotificationStore();

  const adminWorkspaces = useMemo(
    () => workspaces.filter((w) => w.role === "ADMIN"),
    [workspaces]
  );

  const handleFile = async (
    file: File,
    target: "credentials" | "config"
  ): Promise<void> => {
    if (file.size > MAX_FILE_SIZE) {
      dispatch({
        type: "set-parse-error",
        error: `File too large — AWS config files are normally under 100 KB.`,
      });
      return;
    }
    const content = await file.text();
    dispatch({
      type: target === "credentials" ? "set-credentials" : "set-config",
      content,
    });
  };

  const close = () => {
    dispatch({ type: "reset" });
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (state.step !== "select") return;
    const payload: ImportProfilePayload[] = [];
    for (const profile of state.profiles) {
      if (profile.kind !== "static") continue;
      const sel = state.selection.get(profile.name);
      if (!sel?.selected) continue;
      payload.push({
        name: sel.name.trim(),
        region: profile.region,
        accessKeyId: profile.accessKeyId,
        secretAccessKey: profile.secretAccessKey,
      });
    }
    if (payload.length === 0) return;
    dispatch({ type: "start-importing", count: payload.length });
    try {
      const response = await importMutation.mutateAsync({
        workspaceId: state.workspaceId,
        profiles: payload,
      });
      dispatch({ type: "show-results", results: response.results });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import";
      addNotification({
        type: "error",
        title: "Import failed",
        error: message,
        status: "error",
      });
      dispatch({ type: "import-failed" });
    }
  };

  if (state.step === "upload") {
    let parsedPreview: ParsedProfile[] = [];
    if (state.credentials) {
      try {
        parsedPreview = parseAwsProfiles({
          credentials: state.credentials,
          config: state.config,
        });
      } catch {
        parsedPreview = [];
      }
    }

    const fallbackWorkspaceId =
      defaultWorkspaceId ??
      adminWorkspaces.find((w) => w.type === "PERSONAL")?.id ??
      adminWorkspaces[0]?.id ??
      "";

    return (
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from AWS profile</DialogTitle>
            <DialogDescription>
              Upload your <code>~/.aws/credentials</code> file (and optionally{" "}
              <code>~/.aws/config</code>) to import multiple connections at once.
              Files are parsed in your browser and never uploaded as files.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="credentials-file">credentials file (required)</Label>
              <input
                id="credentials-file"
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleFile(file, "credentials");
                }}
                className="text-sm"
              />
              {state.credentials && (
                <p className="text-xs text-green-600">
                  Loaded ({state.credentials.length.toLocaleString()} chars)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="config-file">config file (optional)</Label>
              <input
                id="config-file"
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleFile(file, "config");
                }}
                className="text-sm"
              />
              {state.config && (
                <p className="text-xs text-green-600">
                  Loaded ({state.config.length.toLocaleString()} chars)
                </p>
              )}
            </div>

            {state.parseError && (
              <p className="text-sm text-destructive">{state.parseError}</p>
            )}

            {state.credentials && !state.parseError && (
              <p className="text-sm text-muted-foreground">
                Found {parsedPreview.length} profile
                {parsedPreview.length === 1 ? "" : "s"}.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!state.credentials || parsedPreview.length === 0}
              onClick={() =>
                dispatch({
                  type: "advance-to-select",
                  profiles: parsedPreview,
                  defaultWorkspaceId: fallbackWorkspaceId,
                })
              }
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (state.step === "select") {
    const importableCount = Array.from(state.selection.entries()).filter(
      ([profileName, sel]) => {
        const profile = state.profiles.find((p) => p.name === profileName);
        return profile?.kind === "static" && sel.selected && sel.name.trim().length > 0;
      }
    ).length;
    const allNamesValid = Array.from(state.selection.entries()).every(
      ([profileName, sel]) => {
        const profile = state.profiles.find((p) => p.name === profileName);
        if (profile?.kind !== "static") return true;
        if (!sel.selected) return true;
        return sel.name.trim().length > 0;
      }
    );

    return (
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {state.profiles.length} profile{state.profiles.length === 1 ? "" : "s"} found,{" "}
              {importableCount} importable
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {adminWorkspaces.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="import-workspace">Workspace</Label>
                <select
                  id="import-workspace"
                  value={state.workspaceId}
                  onChange={(e) =>
                    dispatch({ type: "set-workspace", workspaceId: e.target.value })
                  }
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  {adminWorkspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} ({ws.type === "PERSONAL" ? "Personal" : "Team"})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                className="underline text-muted-foreground"
                onClick={() => dispatch({ type: "set-all", selected: true })}
              >
                Select all importable
              </button>
              <button
                type="button"
                className="underline text-muted-foreground"
                onClick={() => dispatch({ type: "set-all", selected: false })}
              >
                Deselect all
              </button>
            </div>

            <div className="border rounded-md divide-y max-h-[40vh] overflow-y-auto">
              {state.profiles.map((profile) => {
                const sel = state.selection.get(profile.name);
                const isStatic = profile.kind === "static";
                return (
                  <div
                    key={profile.name}
                    className="flex items-center gap-3 p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={!!sel?.selected}
                      disabled={!isStatic}
                      onChange={() =>
                        dispatch({ type: "toggle-profile", name: profile.name })
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={isStatic ? "font-medium" : "text-muted-foreground"}>
                          {profile.name}
                        </span>
                        {isStatic && (
                          <span className="text-xs text-muted-foreground">
                            {profile.region}
                          </span>
                        )}
                      </div>
                      {!isStatic && (
                        <p className="text-xs text-muted-foreground">
                          {"reason" in profile ? profile.reason : ""}
                        </p>
                      )}
                    </div>
                    {isStatic && sel && (
                      <Input
                        className="w-48 h-8 text-xs"
                        value={sel.name}
                        onChange={(e) =>
                          dispatch({
                            type: "rename-profile",
                            name: profile.name,
                            newName: e.target.value,
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {!allNamesValid && (
              <p className="text-sm text-destructive">
                Connection names cannot be empty.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "back-to-upload" })}
            >
              Back
            </Button>
            <Button
              disabled={importableCount === 0 || !allNamesValid}
              onClick={handleImport}
            >
              Import {importableCount} profile{importableCount === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (state.step === "importing") {
    return (
      <Dialog open={open} onOpenChange={() => undefined}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Validating {state.count} profile{state.count === 1 ? "" : "s"}…</DialogTitle>
            <DialogDescription>
              Testing each profile's credentials against AWS S3. This may take a few seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // state.step === "results"
  const savedCount = state.results.filter((r) => r.status === "saved").length;
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Imported {savedCount} of {state.results.length} profile{state.results.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {state.results.map((result) => (
            <div
              key={result.name}
              className="flex items-center gap-2 p-2 text-sm border-b last:border-b-0"
            >
              {result.status === "saved" ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              <span className="flex-1 min-w-0 truncate">{result.name}</span>
              <span className="text-xs text-muted-foreground">
                {result.status === "saved" ? "Saved" : result.error || "Invalid"}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={close}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/connections/import-aws-profile-dialog.tsx
git commit -m "feat: add importing and results steps to ImportAwsProfileDialog"
```

---

## Task 14: Wire up the import button and dialog state

**Files:**
- Modify: `src/components/connections/connection-list.tsx`
- Modify: `src/app/(dashboard)/connections/page.tsx`

- [ ] **Step 1: Extend ConnectionList props with `onImport`**

In `src/components/connections/connection-list.tsx`:

Change the props interface (around line 38):

```typescript
interface ConnectionListProps {
  onAdd: (workspaceId?: string) => void;
  onEdit: (connection: ConnectionResponse) => void;
  onImport: (workspaceId?: string) => void;
}
```

Change the component signature:

```typescript
export function ConnectionList({ onAdd, onEdit, onImport }: ConnectionListProps) {
```

In the empty-state block (around line 117), replace the single Add button with an Add/Import pair:

```tsx
<div className="flex gap-2">
  <Button onClick={() => onAdd()}>
    <Plus className="h-4 w-4" />
    Add Connection
  </Button>
  <Button variant="outline" onClick={() => onImport()}>
    Import from AWS profile
  </Button>
</div>
```

In the per-workspace header (around line 144, the `canAdd && (...)` block), replace the single Add button with:

```tsx
{canAdd && (
  <div className="flex gap-2">
    <Button size="sm" onClick={() => onAdd(workspace.id)}>
      <Plus className="h-4 w-4" />
      Add Connection
    </Button>
    <Button size="sm" variant="outline" onClick={() => onImport(workspace.id)}>
      Import from AWS profile
    </Button>
  </div>
)}
```

In the per-workspace empty-section block (around line 152, `wsConns.length === 0`), leave it alone — that section is already a "no connections yet" prompt and the top-of-workspace import button is enough.

- [ ] **Step 2: Add import dialog state to the page**

In `src/app/(dashboard)/connections/page.tsx`:

At the top of the file, add the new import:

```typescript
import { ImportAwsProfileDialog } from "@/components/connections/import-aws-profile-dialog";
```

Inside `ConnectionsPageContent`, after the `dialogOpen` state declarations, add:

```typescript
const [importDialogOpen, setImportDialogOpen] = useState(false);
const [importDefaultWorkspaceId, setImportDefaultWorkspaceId] = useState<
  string | undefined
>(undefined);
```

Add an `handleImport` handler near `handleAdd`:

```typescript
const handleImport = (workspaceId?: string) => {
  setImportDefaultWorkspaceId(workspaceId);
  setImportDialogOpen(true);
};
```

In the JSX, pass `onImport` to `ConnectionList`:

```tsx
<ConnectionList onAdd={handleAdd} onEdit={handleEdit} onImport={handleImport} />
```

After the existing `<Dialog>` block for the edit form, render the import dialog:

```tsx
<ImportAwsProfileDialog
  open={importDialogOpen}
  onOpenChange={setImportDialogOpen}
  defaultWorkspaceId={importDefaultWorkspaceId}
/>
```

- [ ] **Step 3: Verify lint and build pass**

Run these in parallel:
- `pnpm lint`
- `pnpm build`

Expected: both succeed. The build is a strong end-to-end check that all the new types line up.

- [ ] **Step 4: Commit**

```bash
git add src/components/connections/connection-list.tsx src/app/(dashboard)/connections/page.tsx
git commit -m "feat: wire up Import from AWS profile button on connections page"
```

---

## Task 15: Manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Build and start the dev server**

Run: `pnpm dev`

Open the app in a browser and sign in. Navigate to the Connections page.

- [ ] **Step 2: Prepare a sanitised credentials file for testing**

Create a local file (do NOT commit) containing a few sample profiles:

```ini
# test fixtures — DO NOT COMMIT
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

[invalid-creds]
aws_access_key_id = AKIA_FAKE_KEY_THAT_WONT_WORK
aws_secret_access_key = bogus-secret-that-will-fail

[temp]
aws_access_key_id = AKIA_TEMP
aws_secret_access_key = secret
aws_session_token = AQoDYXdz...
```

Optionally a config file:

```ini
[default]
region = us-east-1

[profile invalid-creds]
region = eu-west-1

[profile prod]
role_arn = arn:aws:iam::123456789012:role/admin
source_profile = default
region = us-west-2
```

If you have a real `~/.aws/credentials` with valid keys, use that instead — the import will fully succeed on the working profile and you'll have a real connection to inspect afterward. If you only have the fixture above, expect everything to be flagged as invalid (which is the failure path you want to see anyway).

- [ ] **Step 3: Walk through the import flow**

1. On the Connections page, click "Import from AWS profile" in the personal workspace header.
2. Verify the dialog opens with two file inputs.
3. Upload the credentials file. Verify "Loaded (N chars)" appears under the file input.
4. Verify the dialog reports "Found N profiles."
5. (Optional) Upload the config file. Verify the profile count updates if new profiles appear.
6. Click "Next."
7. Verify Step 2 shows all profiles. Static-credential profiles are selectable; role-chain (`prod`), SSO, and session-token (`temp`) rows are disabled with a one-line reason.
8. Verify the connection-name input is editable and prefilled with each profile name.
9. Try emptying a connection name — the "Import" button should disable and an inline error should appear.
10. Click "Import."
11. Verify the dialog shows the "Validating N profiles…" spinner.
12. After the request returns, verify each row shows ✓ Saved or ✗ with a short error label (`InvalidAccessKeyId`, `SignatureDoesNotMatch`, `AccessDenied`, or `NetworkError`).
13. Click "Done."
14. Verify any saved profiles now appear in the connections list under the chosen workspace.
15. Click one of the saved connections in the file browser (if there are any) and confirm it can list buckets.

- [ ] **Step 4: Verify edge cases**

- Upload an empty file as credentials → "Next" stays disabled, "Found 0 profiles" reported.
- Upload only a config file (skip credentials) → "Next" stays disabled (credentials is required).
- Upload a file > 1 MB → see "File too large" error inline.
- Close the dialog mid-flow → state resets; reopening starts at Step 1.
- As a non-ADMIN user (if you have a test team workspace with VIEWER role) the workspace dropdown should not list that workspace; attempting to POST with that workspace ID should return 403 from the server (defense in depth).

- [ ] **Step 5: Sign off**

If everything above behaves as described, the feature is ready. Move the spec doc's status from `approved` to `shipped` in a follow-up PR description if your team uses that convention.

No commit for this task — it's verification only.

---

## Summary of files changed

| File | Status | Purpose |
|---|---|---|
| `src/lib/aws/parse-profiles.ts` | new | Pure INI parser, `ParsedProfile` discriminated union |
| `src/lib/aws/parse-profiles.test.ts` | new | Unit tests for the parser |
| `src/lib/aws/import-profiles.ts` | new | `importAwsProfile` helper with injected dependencies |
| `src/lib/aws/import-profiles.test.ts` | new | Unit tests for the helper |
| `src/app/api/connections/import/route.ts` | new | `POST /api/connections/import` handler |
| `src/components/connections/import-aws-profile-dialog.tsx` | new | Modal component (upload → select → importing → results) |
| `src/lib/queries/connections.ts` | modified | `useImportAwsProfiles` mutation hook |
| `src/components/connections/connection-list.tsx` | modified | "Import from AWS profile" button + `onImport` prop |
| `src/app/(dashboard)/connections/page.tsx` | modified | Hosts the import dialog state |

No schema, no migrations, no new dependencies.
