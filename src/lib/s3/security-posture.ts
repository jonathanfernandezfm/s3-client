import {
  GetPublicAccessBlockCommand,
  GetBucketPolicyStatusCommand,
  GetBucketEncryptionCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export type SignalState =
  | "ok"
  | "not-configured"
  | "unsupported"
  | "denied"
  | "error";

export interface PublicAccessSignal {
  state: SignalState;
  blockPublicAcls?: boolean;
  ignorePublicAcls?: boolean;
  blockPublicPolicy?: boolean;
  restrictPublicBuckets?: boolean;
  fullyBlocked?: boolean;
}

export interface PolicySignal {
  state: SignalState;
  isPublic?: boolean;
}

export interface EncryptionSignal {
  state: SignalState;
  algorithm?: string | null;
}

export interface BucketSecurityPosture {
  publicAccessBlock: PublicAccessSignal;
  policy: PolicySignal;
  encryption: EncryptionSignal;
  warnPublic: boolean;
}

export function classifyPostureError(
  err: unknown,
  notConfiguredName: string,
): Exclude<SignalState, "ok"> {
  const e = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const name = e.name ?? e.Code ?? "";
  const status = e.$metadata?.httpStatusCode;
  if (name === notConfiguredName) return "not-configured";
  if (name === "NotImplemented" || name === "MethodNotAllowed" || status === 501)
    return "unsupported";
  if (name === "AccessDenied" || status === 403) return "denied";
  return "error";
}

export async function readBucketSecurityPosture(
  client: S3Client,
  bucket: string,
): Promise<BucketSecurityPosture> {
  const [pab, policy, encryption] = await Promise.all([
    readPublicAccessBlock(client, bucket),
    readPolicy(client, bucket),
    readEncryption(client, bucket),
  ]);
  return {
    publicAccessBlock: pab,
    policy,
    encryption,
    warnPublic: policy.state === "ok" && policy.isPublic === true,
  };
}

async function readPublicAccessBlock(
  client: S3Client,
  bucket: string,
): Promise<PublicAccessSignal> {
  try {
    const r = await client.send(
      new GetPublicAccessBlockCommand({ Bucket: bucket }),
    );
    const c = r.PublicAccessBlockConfiguration ?? {};
    const fullyBlocked = !!(
      c.BlockPublicAcls &&
      c.IgnorePublicAcls &&
      c.BlockPublicPolicy &&
      c.RestrictPublicBuckets
    );
    return {
      state: "ok",
      blockPublicAcls: c.BlockPublicAcls,
      ignorePublicAcls: c.IgnorePublicAcls,
      blockPublicPolicy: c.BlockPublicPolicy,
      restrictPublicBuckets: c.RestrictPublicBuckets,
      fullyBlocked,
    };
  } catch (err) {
    return {
      state: classifyPostureError(
        err,
        "NoSuchPublicAccessBlockConfiguration",
      ),
    };
  }
}

async function readPolicy(
  client: S3Client,
  bucket: string,
): Promise<PolicySignal> {
  try {
    const r = await client.send(
      new GetBucketPolicyStatusCommand({ Bucket: bucket }),
    );
    return { state: "ok", isPublic: r.PolicyStatus?.IsPublic ?? false };
  } catch (err) {
    return { state: classifyPostureError(err, "NoSuchBucketPolicy") };
  }
}

async function readEncryption(
  client: S3Client,
  bucket: string,
): Promise<EncryptionSignal> {
  try {
    const r = await client.send(
      new GetBucketEncryptionCommand({ Bucket: bucket }),
    );
    const algo =
      r.ServerSideEncryptionConfiguration?.Rules?.[0]
        ?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm ?? null;
    return { state: "ok", algorithm: algo };
  } catch (err) {
    return {
      state: classifyPostureError(
        err,
        "ServerSideEncryptionConfigurationNotFoundError",
      ),
    };
  }
}
