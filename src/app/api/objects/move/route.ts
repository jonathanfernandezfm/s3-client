import { NextResponse } from "next/server";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createS3Client } from "@/lib/s3/client";
import { getConnectionAccessById } from "@/lib/db/connections";
import { withAuth } from "@/lib/auth";

interface MoveRequest {
  sourceConnectionId: string;
  sourceBucket: string;
  sourceKeys: string[];
  targetConnectionId: string;
  targetBucket: string;
  targetPath: string;
}

interface MoveResult {
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
    }: MoveRequest = await req.json();

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

    if (sourceAccess.role !== "ADMIN" || targetAccess.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You do not have permission to move objects between these connections" },
        { status: 403 }
      );
    }

    const sourceClient = createS3Client(sourceAccess.connection);
    const targetClient = createS3Client(targetAccess.connection);

    const results: MoveResult[] = [];
    const keysToDelete: string[] = [];

    // Check if same endpoint - can use CopyObject
    const isSameEndpoint = sourceAccess.connection.endpoint === targetAccess.connection.endpoint;

    for (const sourceKey of sourceKeys) {
      const isFolder = sourceKey.endsWith("/");

      if (isFolder) {
        // Move folder recursively
        const folderResults = await moveFolder(
          sourceClient,
          targetClient,
          sourceBucket,
          sourceKey,
          targetBucket,
          targetPath,
          isSameEndpoint,
          keysToDelete
        );
        results.push(...folderResults);
      } else {
        // Move single file
        const result = await moveSingleObject(
          sourceClient,
          targetClient,
          sourceBucket,
          sourceKey,
          targetBucket,
          targetPath,
          isSameEndpoint
        );
        results.push(result);
        if (result.success) {
          keysToDelete.push(sourceKey);
        }
      }
    }

    // Delete successfully moved source files
    if (keysToDelete.length > 0) {
      // Delete in batches of 1000 (S3 limit)
      for (let i = 0; i < keysToDelete.length; i += 1000) {
        const batch = keysToDelete.slice(i, i + 1000);
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: sourceBucket,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            Quiet: true,
          },
        });
        await sourceClient.send(deleteCommand);
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      results,
      summary: { total: results.length, successful, failed },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

async function moveSingleObject(
  sourceClient: ReturnType<typeof createS3Client>,
  targetClient: ReturnType<typeof createS3Client>,
  sourceBucket: string,
  sourceKey: string,
  targetBucket: string,
  targetPath: string,
  isSameEndpoint: boolean
): Promise<MoveResult> {
  // Extract the file name from the source key
  const fileName = sourceKey.split("/").filter(Boolean).pop() || sourceKey;
  const targetKey = targetPath ? `${targetPath}${fileName}` : fileName;

  try {
    if (isSameEndpoint) {
      // Use CopyObject for same endpoint
      const command = new CopyObjectCommand({
        Bucket: targetBucket,
        Key: targetKey,
        CopySource: encodeURIComponent(`${sourceBucket}/${sourceKey}`),
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

async function moveFolder(
  sourceClient: ReturnType<typeof createS3Client>,
  targetClient: ReturnType<typeof createS3Client>,
  sourceBucket: string,
  sourcePrefix: string,
  targetBucket: string,
  targetPath: string,
  isSameEndpoint: boolean,
  keysToDelete: string[]
): Promise<MoveResult[]> {
  const results: MoveResult[] = [];

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
        // Get the folder name being moved
        const folderName = sourcePrefix.split("/").filter(Boolean).pop() || "";
        const targetKey = targetPath
          ? `${targetPath}${folderName}/${relativePath}`
          : `${folderName}/${relativePath}`;

        try {
          if (isSameEndpoint) {
            const command = new CopyObjectCommand({
              Bucket: targetBucket,
              Key: targetKey,
              CopySource: encodeURIComponent(`${sourceBucket}/${obj.Key}`),
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
          keysToDelete.push(obj.Key);
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
