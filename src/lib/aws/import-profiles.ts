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
