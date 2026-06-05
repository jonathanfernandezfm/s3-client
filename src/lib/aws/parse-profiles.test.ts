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
});
