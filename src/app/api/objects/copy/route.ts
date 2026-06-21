import { NextResponse } from "next/server";
import {
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createS3Client } from "@/lib/s3/client";
import { buildCopySource } from "@/lib/s3/copy-source";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";
import { canManageFiles } from "@/lib/roles";
import { recordActivityBatch } from "@/lib/db/activity";
import { indexUpsert } from "@/lib/search/index-ops";

interface CopyRequest {
  sourceConnectionId: string;
  sourceBucket: string;
  sourceKeys: string[];
  targetConnectionId: string;
  targetBucket: string;
  targetPath: string;
}

interface CopyResult {
  sourceKey: string;
  targetKey: string;
  success: boolean;
  error?: string;
}

export const POST = withAuth(async (req, { user }) => {
  try {
    const {
      sourceConnectionId,
      sourceBucket,
      sourceKeys,
      targetConnectionId,
      targetBucket,
      targetPath,
    }: CopyRequest = await req.json();

    // Validate required fields
    if (
      !sourceConnectionId ||
      !sourceBucket ||
      !sourceKeys ||
      sourceKeys.length === 0 ||
      !targetConnectionId ||
      !targetBucket
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get connections and enforce permissions.
    const sourceAccess = await getConnectionAccessById(sourceConnectionId, user.id);
    const targetAccess = await getConnectionAccessById(targetConnectionId, user.id);

    if (!sourceAccess) {
      return NextResponse.json(
        { error: "Source connection not found" },
        { status: 404 }
      );
    }

    if (!targetAccess) {
      return NextResponse.json(
        { error: "Target connection not found" },
        { status: 404 }
      );
    }

    // Copy reads from source and writes to target, so only the target requires write access.
    if (!canManageFiles(targetAccess.role)) {
      return NextResponse.json(
        { error: "You do not have permission to write to the target connection" },
        { status: 403 }
      );
    }

    const sourceClient = createS3Client(sourceAccess.connection);
    const targetClient = createS3Client(targetAccess.connection);

    const results: CopyResult[] = [];

    // Check if same endpoint - can use CopyObject
    const isSameEndpoint = sourceAccess.connection.endpoint === targetAccess.connection.endpoint;

    for (const sourceKey of sourceKeys) {
      const isFolder = sourceKey.endsWith("/");

      if (isFolder) {
        // Copy folder recursively
        const folderResults = await copyFolder(
          sourceClient,
          targetClient,
          sourceBucket,
          sourceKey,
          targetBucket,
          targetPath,
          isSameEndpoint
        );
        results.push(...folderResults);
      } else {
        // Copy single file
        const result = await copySingleObject(
          sourceClient,
          targetClient,
          sourceBucket,
          sourceKey,
          targetBucket,
          targetPath,
          isSameEndpoint
        );
        results.push(result);
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    const batchId = crypto.randomUUID();
    const successfulResults = results.filter((r) => r.success);
    if (successfulResults.length > 0) {
      await recordActivityBatch({
        connectionId: sourceConnectionId,
        userId: user.id,
        userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        userImageUrl: user.imageUrl ?? null,
        action: "COPY",
        bucket: sourceBucket,
        items: successfulResults.map((r) => ({ key: r.sourceKey, targetKey: null })),
        batchId,
      });
      if (targetConnectionId !== sourceConnectionId) {
        await recordActivityBatch({
          connectionId: targetConnectionId,
          userId: user.id,
          userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
          userImageUrl: user.imageUrl ?? null,
          action: "COPY",
          bucket: targetBucket,
          items: successfulResults.map((r) => ({ key: r.targetKey, targetKey: null })),
          batchId,
        });
      }
    }

    await Promise.all(
      successfulResults.map((r) =>
        indexUpsert({
          workspaceId: targetAccess.workspaceId,
          connectionId: targetConnectionId,
          bucket: targetBucket,
          key: r.targetKey,
          size: 0n,
          lastModified: new Date(),
          etag: null,
        })
      )
    );

    return NextResponse.json({
      results,
      summary: { total: results.length, successful, failed },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

async function copySingleObject(
  sourceClient: ReturnType<typeof createS3Client>,
  targetClient: ReturnType<typeof createS3Client>,
  sourceBucket: string,
  sourceKey: string,
  targetBucket: string,
  targetPath: string,
  isSameEndpoint: boolean
): Promise<CopyResult> {
  // Extract the file name from the source key
  const fileName = sourceKey.split("/").filter(Boolean).pop() || sourceKey;
  const targetKey = targetPath ? `${targetPath}${fileName}` : fileName;

  try {
    if (isSameEndpoint) {
      // Use CopyObject for same endpoint
      const command = new CopyObjectCommand({
        Bucket: targetBucket,
        Key: targetKey,
        CopySource: buildCopySource(sourceBucket, sourceKey),
      });
      await targetClient.send(command);
    } else {
      // Stream download and upload for cross-endpoint
      const getCommand = new GetObjectCommand({
        Bucket: sourceBucket,
        Key: sourceKey,
      });
      const response = await sourceClient.send(getCommand);

      if (!response.Body) {
        throw new Error("Empty response body");
      }

      const upload = new Upload({
        client: targetClient,
        params: {
          Bucket: targetBucket,
          Key: targetKey,
          Body: response.Body,
          ContentType: response.ContentType,
        },
      });

      await upload.done();
    }

    return { sourceKey, targetKey, success: true };
  } catch (error) {
    return {
      sourceKey,
      targetKey,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function copyFolder(
  sourceClient: ReturnType<typeof createS3Client>,
  targetClient: ReturnType<typeof createS3Client>,
  sourceBucket: string,
  sourcePrefix: string,
  targetBucket: string,
  targetPath: string,
  isSameEndpoint: boolean
): Promise<CopyResult[]> {
  const results: CopyResult[] = [];

  // List all objects under the folder
  let continuationToken: string | undefined;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: sourceBucket,
      Prefix: sourcePrefix,
      ContinuationToken: continuationToken,
    });

    const listResponse = await sourceClient.send(listCommand);

    if (listResponse.Contents) {
      for (const obj of listResponse.Contents) {
        if (!obj.Key) continue;

        // Calculate the relative path from the source folder
        const relativePath = obj.Key.substring(sourcePrefix.length);
        // Get the folder name being copied
        const folderName = sourcePrefix.split("/").filter(Boolean).pop() || "";
        const targetKey = targetPath
          ? `${targetPath}${folderName}/${relativePath}`
          : `${folderName}/${relativePath}`;

        try {
          if (isSameEndpoint) {
            const command = new CopyObjectCommand({
              Bucket: targetBucket,
              Key: targetKey,
              CopySource: buildCopySource(sourceBucket, obj.Key),
            });
            await targetClient.send(command);
          } else {
            const getCommand = new GetObjectCommand({
              Bucket: sourceBucket,
              Key: obj.Key,
            });
            const response = await sourceClient.send(getCommand);

            if (response.Body) {
              const upload = new Upload({
                client: targetClient,
                params: {
                  Bucket: targetBucket,
                  Key: targetKey,
                  Body: response.Body,
                  ContentType: response.ContentType,
                },
              });
              await upload.done();
            }
          }

          results.push({ sourceKey: obj.Key, targetKey, success: true });
        } catch (error) {
          results.push({
            sourceKey: obj.Key,
            targetKey,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return results;
}
