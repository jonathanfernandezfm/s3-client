# Bucket CORS configuration for direct uploads

Uploads go directly from the browser to your S3-compatible endpoint using
presigned URLs. The target bucket must allow cross-origin PUTs from the app's
origin and must expose the `ETag` response header (multipart completion needs
the ETag of every uploaded part).

If uploads fail immediately with a network error, or fail with an error
mentioning `ExposeHeaders`, this configuration is missing.

## AWS S3

Bucket → Permissions → Cross-origin resource sharing (CORS):

```json
[
  {
    "AllowedOrigins": ["https://your-app-domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Add `http://localhost:3000` to `AllowedOrigins` for local development.

## MinIO

MinIO responds to CORS preflights permissively by default for presigned URLs,
but if you have restricted it, allow the app origin:

```bash
mc admin config set myminio api cors_allow_origin="https://your-app-domain.example"
mc admin service restart myminio
```

## Notes

- `GET`/`HEAD` are not required for uploads; add them only if you also serve
  objects to the browser via presigned GETs from another origin.
- Incomplete multipart uploads (e.g. canceled mid-flight with a failed abort,
  or a closed tab) are listed in the bucket's "Incomplete uploads" tab in this
  app, where they can be aborted to stop storage charges. Consider an S3
  lifecycle rule (`AbortIncompleteMultipartUpload`) as a safety net.
