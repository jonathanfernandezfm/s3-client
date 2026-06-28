# Copy a previous version to a new location

The version history dialog's "Copy to…" action is now functional: pick a destination
bucket and folder to copy any prior version of an object as a new file. The version
diff viewer was also made more reliable.

## What's new

- **Copy a version** — the previously-disabled "Copy to…" button in version history now
  opens a destination picker and copies the selected version to a new key.
- **More reliable diffs** — the text-diff viewer no longer hangs or renders error text as
  file content when a presigned URL fails, and cancels stale requests.
