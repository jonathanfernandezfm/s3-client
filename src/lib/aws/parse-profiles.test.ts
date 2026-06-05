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
});
