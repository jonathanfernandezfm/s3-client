/**
 * Fully empty a versioned S3 bucket on Hetzner Object Storage:
 *   - delete every object version
 *   - delete every delete marker
 *   - abort every in-progress multipart upload
 *
 * Pulls credentials from the local DB (encrypted) and uses the AWS SDK.
 */
require("dotenv").config();
const { Client } = require("pg");
const { createDecipheriv } = require("crypto");
const {
  S3Client,
  ListObjectVersionsCommand,
  ListMultipartUploadsCommand,
  DeleteObjectsCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");

const ENDPOINT_HOST = "nbg1.your-objectstorage.com";
const BUCKET = process.argv[2] || "pledgy-images";
const CONNECTION_NAME = "Pledgy"; // The one with valid credentials

function decrypt(stored) {
  if (!stored.startsWith("enc:")) return stored;
  const [ivHex, tagHex, dataHex] = stored.slice(4).split(":");
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") + decipher.final("utf8");
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(
    `SELECT id, name, endpoint, region, "accessKeyId", "secretAccessKey", "forcePathStyle"
     FROM connections WHERE endpoint LIKE $1 AND name = $2`,
    [`%${ENDPOINT_HOST}%`, CONNECTION_NAME]
  );
  await db.end();

  if (!rows.length) {
    console.error(`No "${CONNECTION_NAME}" connection found for ${ENDPOINT_HOST}`);
    process.exit(1);
  }

  const conn = rows[0];
  const s3 = new S3Client({
    endpoint: conn.endpoint,
    region: conn.region,
    forcePathStyle: conn.forcePathStyle,
    credentials: {
      accessKeyId: conn.accessKeyId,
      secretAccessKey: decrypt(conn.secretAccessKey),
    },
  });

  console.log(`Using connection "${conn.name}" against bucket "${BUCKET}"\n`);

  // ── Step 1: collect every version & delete marker ────────────────────────
  console.log("[1/3] Collecting all versions and delete markers...");
  const toDelete = []; // { Key, VersionId }
  let keyMarker, versionIdMarker;
  let pages = 0;
  while (true) {
    const resp = await s3.send(new ListObjectVersionsCommand({
      Bucket: BUCKET,
      KeyMarker: keyMarker,
      VersionIdMarker: versionIdMarker,
    }));
    pages++;
    for (const v of resp.Versions ?? []) toDelete.push({ Key: v.Key, VersionId: v.VersionId });
    for (const d of resp.DeleteMarkers ?? []) toDelete.push({ Key: d.Key, VersionId: d.VersionId });
    if (!resp.IsTruncated) break;
    keyMarker = resp.NextKeyMarker;
    versionIdMarker = resp.NextVersionIdMarker;
  }
  console.log(`  → ${toDelete.length} item(s) to delete across ${pages} page(s)`);

  // ── Step 2: collect every multipart upload ───────────────────────────────
  console.log("\n[2/3] Collecting in-progress multipart uploads...");
  const mpus = []; // { Key, UploadId }
  let mpuKeyMarker, mpuUploadIdMarker;
  while (true) {
    const resp = await s3.send(new ListMultipartUploadsCommand({
      Bucket: BUCKET,
      KeyMarker: mpuKeyMarker,
      UploadIdMarker: mpuUploadIdMarker,
    }));
    for (const u of resp.Uploads ?? []) mpus.push({ Key: u.Key, UploadId: u.UploadId });
    if (!resp.IsTruncated) break;
    mpuKeyMarker = resp.NextKeyMarker;
    mpuUploadIdMarker = resp.NextUploadIdMarker;
  }
  console.log(`  → ${mpus.length} multipart upload(s) to abort`);

  if (toDelete.length === 0 && mpus.length === 0) {
    console.log("\n✅ Bucket is already fully empty.");
    process.exit(0);
  }

  // ── Step 3: execute deletes ──────────────────────────────────────────────
  console.log("\n[3/3] Deleting...");

  let deleted = 0;
  let errors = 0;
  for (const batch of chunk(toDelete, 1000)) {
    const resp = await s3.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: batch, Quiet: false },
    }));
    deleted += (resp.Deleted ?? []).length;
    if (resp.Errors?.length) {
      errors += resp.Errors.length;
      for (const e of resp.Errors) {
        console.log(`  ❌ ${e.Key} vid=${e.VersionId}: ${e.Code} — ${e.Message}`);
      }
    }
    console.log(`  ✓ batch: ${(resp.Deleted ?? []).length} deleted, ${(resp.Errors ?? []).length} errors (running total: ${deleted}/${toDelete.length})`);
  }

  for (const u of mpus) {
    try {
      await s3.send(new AbortMultipartUploadCommand({
        Bucket: BUCKET,
        Key: u.Key,
        UploadId: u.UploadId,
      }));
      console.log(`  ✓ aborted multipart: ${u.Key}  uploadId=${u.UploadId}`);
    } catch (e) {
      errors++;
      console.log(`  ❌ abort failed: ${u.Key}: ${e.name} — ${e.message}`);
    }
  }

  console.log(`\nDeleted ${deleted} version(s)/marker(s) and aborted ${mpus.length} multipart upload(s). Errors: ${errors}`);

  // ── Verification ─────────────────────────────────────────────────────────
  console.log("\n[verify] Re-inspecting bucket...");
  let remaining = 0;
  {
    let km, vim;
    while (true) {
      const r = await s3.send(new ListObjectVersionsCommand({
        Bucket: BUCKET, KeyMarker: km, VersionIdMarker: vim,
      }));
      remaining += (r.Versions?.length ?? 0) + (r.DeleteMarkers?.length ?? 0);
      if (!r.IsTruncated) break;
      km = r.NextKeyMarker;
      vim = r.NextVersionIdMarker;
    }
  }
  let mpuRemaining = 0;
  {
    let km, uim;
    while (true) {
      const r = await s3.send(new ListMultipartUploadsCommand({
        Bucket: BUCKET, KeyMarker: km, UploadIdMarker: uim,
      }));
      mpuRemaining += r.Uploads?.length ?? 0;
      if (!r.IsTruncated) break;
      km = r.NextKeyMarker;
      uim = r.NextUploadIdMarker;
    }
  }
  console.log(`  → versions/markers remaining: ${remaining}`);
  console.log(`  → multipart uploads remaining: ${mpuRemaining}`);

  if (remaining === 0 && mpuRemaining === 0) {
    console.log("\n✅ Bucket is now fully empty.");
  } else {
    console.log("\n⚠️ Bucket is not fully empty — see remaining counts above.");
    process.exit(1);
  }
})().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
