/**
 * One-off inspection of a bucket for hidden content:
 *   - bucket versioning status
 *   - current visible objects
 *   - object versions
 *   - delete markers
 *   - in-progress multipart uploads
 *
 * Uses the project's bundled AWS SDK rather than AWS CLI v2 — the CLI v2 has a
 * crash bug (s3errormsg.py:_is_sigv4_error_message) when Hetzner/Ceph returns
 * an empty <Message></Message> element in errors.
 */
require("dotenv").config();
const { Client } = require("pg");
const { createDecipheriv } = require("crypto");
const {
  S3Client,
  GetBucketVersioningCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  ListMultipartUploadsCommand,
} = require("@aws-sdk/client-s3");

const ENDPOINT_HOST = "nbg1.your-objectstorage.com";
const BUCKET = process.argv[2] || "pledgy-images";

function decrypt(stored) {
  if (!stored.startsWith("enc:")) return stored;
  const [ivHex, tagHex, dataHex] = stored.slice(4).split(":");
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") + decipher.final("utf8");
}

async function paginate(s3, Command, baseInput, accumulateFn) {
  let token = undefined;
  let isVersions = Command === ListObjectVersionsCommand;
  let isMultipart = Command === ListMultipartUploadsCommand;
  while (true) {
    const input = { ...baseInput };
    if (token) {
      if (isVersions) {
        input.KeyMarker = token.KeyMarker;
        input.VersionIdMarker = token.VersionIdMarker;
      } else if (isMultipart) {
        input.KeyMarker = token.KeyMarker;
        input.UploadIdMarker = token.UploadIdMarker;
      } else {
        input.ContinuationToken = token;
      }
    }
    const resp = await s3.send(new Command(input));
    accumulateFn(resp);

    if (isVersions) {
      if (!resp.IsTruncated) break;
      token = { KeyMarker: resp.NextKeyMarker, VersionIdMarker: resp.NextVersionIdMarker };
    } else if (isMultipart) {
      if (!resp.IsTruncated) break;
      token = { KeyMarker: resp.NextKeyMarker, UploadIdMarker: resp.NextUploadIdMarker };
    } else {
      if (!resp.IsTruncated) break;
      token = resp.NextContinuationToken;
    }
  }
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(
    `SELECT id, name, endpoint, region, "accessKeyId", "secretAccessKey", "forcePathStyle"
     FROM connections WHERE endpoint LIKE $1`,
    [`%${ENDPOINT_HOST}%`]
  );
  await db.end();

  if (!rows.length) {
    console.error(`No connection found with endpoint matching ${ENDPOINT_HOST}`);
    process.exit(1);
  }

  console.log(`Found ${rows.length} connection(s) for ${ENDPOINT_HOST}:`);
  for (const r of rows) {
    console.log(`  - id=${r.id}  name=${r.name ?? "(none)"}  region=${r.region}  forcePathStyle=${r.forcePathStyle}`);
  }

  // Try each connection until one can read the bucket
  for (const conn of rows) {
    console.log(`\n─── Trying connection "${conn.name ?? conn.id}" (${conn.accessKeyId.slice(0, 6)}…) ───`);
    const s3 = new S3Client({
      endpoint: conn.endpoint,
      region: conn.region,
      forcePathStyle: conn.forcePathStyle,
      credentials: {
        accessKeyId: conn.accessKeyId,
        secretAccessKey: decrypt(conn.secretAccessKey),
      },
    });

    try {
      // 1. Versioning
      console.log("\n[1] Bucket versioning status:");
      try {
        const v = await s3.send(new GetBucketVersioningCommand({ Bucket: BUCKET }));
        console.log(`    Status:    ${v.Status ?? "(unset — never been versioned)"}`);
        console.log(`    MFADelete: ${v.MFADelete ?? "(unset)"}`);
      } catch (e) {
        console.log(`    ERROR: ${e.name}: ${e.message}`);
        if (e.Code === "AccessDenied" || e.Code === "InvalidAccessKeyId" || e.name === "InvalidAccessKeyId") {
          console.log("    → credentials rejected for this bucket, skipping");
          continue;
        }
      }

      // 2. Current visible objects (HEAD count)
      console.log("\n[2] Current visible objects (list-objects-v2):");
      let visibleCount = 0;
      let visibleBytes = 0;
      let firstFew = [];
      await paginate(s3, ListObjectsV2Command, { Bucket: BUCKET }, (resp) => {
        for (const o of resp.Contents ?? []) {
          visibleCount++;
          visibleBytes += Number(o.Size ?? 0);
          if (firstFew.length < 10) firstFew.push({ Key: o.Key, Size: o.Size });
        }
      });
      console.log(`    Count: ${visibleCount}  TotalSize: ${visibleBytes} bytes`);
      if (firstFew.length) {
        console.log("    First few:");
        for (const o of firstFew) console.log(`      - ${o.Key}  (${o.Size}B)`);
      }

      // 3. All versions + delete markers
      console.log("\n[3] All object versions + delete markers (list-object-versions):");
      let versionCount = 0;
      let deleteMarkerCount = 0;
      let versionBytes = 0;
      let firstVersions = [];
      let firstMarkers = [];
      await paginate(s3, ListObjectVersionsCommand, { Bucket: BUCKET }, (resp) => {
        for (const v of resp.Versions ?? []) {
          versionCount++;
          versionBytes += Number(v.Size ?? 0);
          if (firstVersions.length < 10) {
            firstVersions.push({ Key: v.Key, VersionId: v.VersionId, Size: v.Size, IsLatest: v.IsLatest });
          }
        }
        for (const d of resp.DeleteMarkers ?? []) {
          deleteMarkerCount++;
          if (firstMarkers.length < 10) {
            firstMarkers.push({ Key: d.Key, VersionId: d.VersionId, IsLatest: d.IsLatest });
          }
        }
      });
      console.log(`    Versions:      ${versionCount}  TotalSize: ${versionBytes} bytes`);
      console.log(`    DeleteMarkers: ${deleteMarkerCount}`);
      if (firstVersions.length) {
        console.log("    First versions:");
        for (const v of firstVersions) {
          console.log(`      - ${v.Key}  vid=${v.VersionId}  size=${v.Size}  latest=${v.IsLatest}`);
        }
      }
      if (firstMarkers.length) {
        console.log("    First delete markers:");
        for (const d of firstMarkers) {
          console.log(`      - ${d.Key}  vid=${d.VersionId}  latest=${d.IsLatest}`);
        }
      }

      // 4. Multipart uploads
      console.log("\n[4] In-progress multipart uploads (list-multipart-uploads):");
      let mpuCount = 0;
      let firstMpu = [];
      await paginate(s3, ListMultipartUploadsCommand, { Bucket: BUCKET }, (resp) => {
        for (const u of resp.Uploads ?? []) {
          mpuCount++;
          if (firstMpu.length < 10) {
            firstMpu.push({ Key: u.Key, UploadId: u.UploadId, Initiated: u.Initiated });
          }
        }
      });
      console.log(`    Count: ${mpuCount}`);
      if (firstMpu.length) {
        console.log("    First uploads:");
        for (const u of firstMpu) {
          console.log(`      - ${u.Key}  uploadId=${u.UploadId}  initiated=${u.Initiated?.toISOString?.() ?? u.Initiated}`);
        }
      }

      // Done with the bucket
      console.log("\n─── Summary ───");
      console.log(`  Visible objects:        ${visibleCount}`);
      console.log(`  Non-current versions:   ${Math.max(0, versionCount - visibleCount)} (versions total ${versionCount}, current ${visibleCount})`);
      console.log(`  Delete markers:         ${deleteMarkerCount}`);
      console.log(`  In-progress multiparts: ${mpuCount}`);
      const totalLeft = versionCount + deleteMarkerCount + mpuCount;
      console.log(`  ⇒ Total objects still occupying space: ${totalLeft}`);

      process.exit(0);
    } catch (e) {
      console.log(`\n  ❌ ${e.name}: ${e.message}`);
      if (e.$metadata) console.log(`     httpStatus=${e.$metadata.httpStatusCode}`);
    }
  }

  console.error("\nNo connection could read the bucket.");
  process.exit(1);
})().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
