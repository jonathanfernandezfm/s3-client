# File preview — Text, PDF, video, audio

**Date:** 2026-06-03
**Scope:** Refactor `file-preview-modal.tsx` into a thin shell + per-type renderer components. Add `getPreviewKind` detection helper. Wire text/PDF/video/audio support without server-side changes.

## Problem

The file browser previews images in a modal (presigned URL → `<img>` + zoom controls). Every other file type — `.txt`, `.md`, `.json`, `.pdf`, `.mp4`, `.mp3`, log files, source code — currently shows only an icon. To inspect them, users must download, open in a separate app, and discard. This is friction for the dominant use case: opening an S3 object briefly to confirm what it is.

The existing infrastructure makes this cheap to fix:
- `POST /api/objects/download` already returns a presigned URL that works for any object type.
- A Dialog-based modal, an `onPreview` callback flow through `file-row` / `file-tile` / `file-gallery`, and a `canPreview` gate are already in place.
- The only missing pieces are (a) detecting non-image previewable kinds and (b) rendering them.

## Decision

Refactor the preview modal into a **shell + renderer** split. Each file kind has a dedicated renderer component that owns the format-specific UI. A small detection helper maps file extensions to a `PreviewKind`. Adding a new format in the future = one new renderer + a few new extensions in one map.

**Supported kinds in v1:** `image` (existing), `text` (incl. code & structured), `pdf`, `video`, `audio`. Everything else → fallback "no preview available" panel with a Download button.

**No new API routes.** No new server-side work. All changes are client-side.

## File structure

**New files:**

- `src/lib/preview/constants.ts` — `TEXT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024`
- `src/lib/preview/language-map.ts` — `inferLanguage(filename): string | null` maps extension → Prism language identifier
- `src/lib/preview/language-map.test.ts` — Vitest unit tests
- `src/lib/preview/text-fetch.ts` — `fetchTextWithCap(url): Promise<{ text } | { tooLarge, sizeBytes } | { error }>`
- `src/lib/preview/text-fetch.test.ts` — Vitest unit tests
- `src/components/preview/renderers/image-preview.tsx` — extracted from current modal body
- `src/components/preview/renderers/text-preview.tsx`
- `src/components/preview/renderers/pdf-preview.tsx`
- `src/components/preview/renderers/video-preview.tsx`
- `src/components/preview/renderers/audio-preview.tsx`
- `src/components/preview/renderers/unsupported-preview.tsx` — fallback "no preview" panel

**Modified files:**

- `src/lib/utils.ts` — add `PreviewKind` type, `getPreviewKind(filename)`, reimplement `isImageFile` on top
- `src/lib/utils.test.ts` — new file (utils.ts has no existing tests)
- `src/components/preview/file-preview-modal.tsx` — reduce to shell: Dialog, header, presigned URL fetch, renderer dispatch
- `src/hooks/use-file-item-behavior.ts` — `canPreview` becomes `getPreviewKind(object.key) !== null`

**No changes needed (will pick up new kinds automatically):**

- `file-row.tsx`, `file-tile.tsx`, `file-gallery.tsx` — already gate on `canPreview`
- `file-browser.tsx` — already routes `previewObject` to the modal
- `src/app/api/objects/download/route.ts` — already format-agnostic

## Detection layer

```ts
// src/lib/utils.ts
const PREVIEW_EXTENSIONS = {
  image: ['jpg','jpeg','png','gif','webp','svg','bmp','ico'],
  pdf:   ['pdf'],
  video: ['mp4','webm','mov','m4v','ogv'],
  audio: ['mp3','wav','ogg','m4a','flac','aac'],
  text:  ['txt','md','log','json','yaml','yml','xml','csv','tsv','toml','ini',
          'js','jsx','ts','tsx','mjs','cjs','py','rb','go','rs','java','kt',
          'c','h','cpp','hpp','cs','php','swift','sh','bash','zsh','sql',
          'html','htm','css','scss','sass','less','env','gitignore','dockerfile'],
} as const;

export type PreviewKind = keyof typeof PREVIEW_EXTENSIONS;

export function getPreviewKind(filename: string): PreviewKind | null {
  const ext = getFileExtension(filename); // lower-cased, no dot
  for (const kind in PREVIEW_EXTENSIONS) {
    if ((PREVIEW_EXTENSIONS[kind as PreviewKind] as readonly string[]).includes(ext)) {
      return kind as PreviewKind;
    }
  }
  return null;
}

export function isImageFile(filename: string): boolean {
  return getPreviewKind(filename) === 'image';
}
```

**Lookup is case-insensitive** because `getFileExtension` already lower-cases. `isImageFile` is preserved (still used by `file-gallery.tsx` to filter the image-only gallery row) but now derives from the same map — no chance of divergence.

## Renderer contract

Every renderer receives the same props and is responsible for its own internal loading/error states for whatever it controls (e.g., the `<img>` failing to load, the text fetch failing).

```ts
interface RendererProps {
  presignedUrl: string;
  filename: string;
}
```

Each renderer is a default-exported React component. The shell does not pass `kind` — the renderer is already specific to one kind.

## Shell (`FilePreviewModal`)

Responsibilities after refactor:

1. Render the Dialog wrapper (`max-w-6xl` — wider than current image-sized modal to give PDFs and videos room)
2. Render header: filename, Download button (opens presigned URL in new tab), Close button
3. Fetch the presigned URL via existing `POST /api/objects/download` flow
4. Compute `kind = getPreviewKind(object.key)`
5. Render the matching renderer with `{ presignedUrl, filename }`, or `<UnsupportedPreview filename={key} />` if `kind === null`
6. Render shell-level error states: presigned URL fetch failed, or no URL yet (loading)

The current image-specific zoom controls move into `ImagePreview`. The shell no longer knows anything about images specifically.

## Renderer details

### `ImagePreview`

Extracted verbatim from the current modal body (`file-preview-modal.tsx:84-134`): zoom state (25%–300%), `<img>`, loading spinner via `onLoad`, error state via `onError`. The zoom controls render as an overlay or inline strip within the renderer (not the shell header).

### `TextPreview`

State machine:

- `loading` → fetching
- `ready(text, language)` → render highlighted
- `tooLarge(sizeBytes)` → "File too large to preview (X.X MB). Max 5 MB." with Download button
- `error(message)` → "Failed to load text." with Retry + Download

Flow:

1. On mount, call `fetchTextWithCap(presignedUrl)` (from `src/lib/preview/text-fetch.ts`)
2. `inferLanguage(filename)` → Prism language identifier or `null`
3. If `language === null`, render plain `<pre>` (no highlighter import)
4. Otherwise lazy-import the highlighter:
   ```ts
   const Highlighter = lazy(() => import('react-syntax-highlighter/dist/esm/prism-light'));
   ```
   and render `<Suspense fallback={<plain pre>}>`. This keeps the highlighter out of the main bundle.

Scrollable container, fixed height (e.g. `max-h-[70vh]`), monospace font.

### `PdfPreview`

```tsx
<iframe
  src={presignedUrl}
  className="w-full h-[80vh] border-0"
  title={filename}
/>
```

That's the whole component. Browser-native PDF viewer (Chrome, Edge, Firefox, Safari). Optional `onError` to show a fallback link.

### `VideoPreview`

```tsx
<video
  src={presignedUrl}
  controls
  className="max-w-full max-h-[80vh] mx-auto"
  onError={...}
/>
```

Error fallback: "This browser can't play .xyz files." + Download.

### `AudioPreview`

```tsx
<audio src={presignedUrl} controls className="w-full" />
```

Centered in a smaller card so the modal doesn't feel empty for audio-only.

### `UnsupportedPreview`

Icon + "No preview available for .xyz files." + Download button. Used when `getPreviewKind` returns `null` but the modal opened (shouldn't happen via normal UI, since `canPreview` gates the trigger — but safe to render defensively if someone passes through programmatically).

## Text fetch with cap (`fetchTextWithCap`)

```ts
export type TextFetchResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'tooLarge'; sizeBytes: number }
  | { ok: false; reason: 'error'; message: string };

export async function fetchTextWithCap(url: string): Promise<TextFetchResult>;
```

Logic:

1. `fetch(url)` (GET)
2. Check `response.headers.get('content-length')`. If present and `> TEXT_PREVIEW_MAX_BYTES`, return `tooLarge` and **do not read the body** (let GC abort the transfer; optionally abort via `AbortController`).
3. If `content-length` is missing/zero (some S3-compatible providers omit it on presigned URLs), stream the body with `response.body.getReader()`, accumulate chunks while tracking total bytes. If running total exceeds cap, abort and return `tooLarge`.
4. Decode accumulated bytes as UTF-8 via `TextDecoder`. Decode errors → return `error` with message "File doesn't appear to be text."
5. On any network/fetch failure, return `error`.

We extract this as a standalone helper (rather than inlining in `TextPreview`) precisely because it has the only nontrivial logic worth unit-testing — cap honoring, streaming abort, decode handling.

## Language map (`inferLanguage`)

A static record `{ extension: prismLanguageId }`. Examples:

| Extension | Prism id |
|---|---|
| `js`, `mjs`, `cjs` | `javascript` |
| `ts`, `tsx` | `typescript` |
| `py` | `python` |
| `rb` | `ruby` |
| `go` | `go` |
| `rs` | `rust` |
| `java` | `java` |
| `kt` | `kotlin` |
| `sh`, `bash`, `zsh` | `bash` |
| `sql` | `sql` |
| `json` | `json` |
| `yaml`, `yml` | `yaml` |
| `xml`, `html`, `htm` | `markup` |
| `css` | `css` |
| `scss`, `sass` | `scss` |
| `md` | `markdown` |
| `dockerfile` (from a file named `Dockerfile`, lowercased by `getFileExtension`) | `docker` |
| (any other text extension) | `null` → plain text |

Markdown is highlighted as markdown source — **not rendered**. Rendered markdown is out of scope for v1 (decided during brainstorming).

## Modal size

Current modal is sized for images. PDFs and videos need more room:

- `DialogContent` `max-w-6xl` (current is roughly `max-w-3xl`)
- Body container takes the available height; renderers cap themselves at `max-h-[80vh]` so the header stays visible

## Data flow

```
User clicks file
  → file-row / file-tile fires onPreview(object) (only if canPreview)
  → file-browser sets previewObject
  → FilePreviewModal mounts
     → POST /api/objects/download → presignedUrl   (existing, unchanged)
     → kind = getPreviewKind(object.key)
     → Renders <KindRenderer presignedUrl filename />
        ├─ image / pdf / video / audio: browser streams from URL directly
        └─ text: TextPreview calls fetchTextWithCap(presignedUrl)
                 → checks Content-Length, reads bytes (capped), decodes
                 → renders plain <pre> or lazy-loaded <Highlighter>
```

## Error matrix

| Layer | Failure | UX |
|---|---|---|
| Shell — presigned URL fetch | network/server error | "Failed to load preview" + Download + Retry |
| Shell — no kind matched | unsupported type | `<UnsupportedPreview>` panel |
| `ImagePreview` | `<img onError>` | broken-image icon + "Failed to load image" |
| `PdfPreview` | iframe load fails (rare) | "Could not render PDF" + open-in-new-tab link |
| `VideoPreview` | `<video onError>` / unsupported format | "This browser can't play .xyz" + Download |
| `AudioPreview` | `<audio onError>` / unsupported format | "This browser can't play .xyz" + Download |
| `TextPreview` — too large | `content-length > cap` or streaming abort | "File too large to preview (X MB). Max 5 MB." + Download |
| `TextPreview` — fetch fails | network/CORS | "Failed to load text" + Retry + Download |
| `TextPreview` — decode fails | not UTF-8 | "File doesn't appear to be text" + Download |

Download button is always present in the shell header — it works regardless of renderer state.

## Testing

The project uses Vitest for pure unit tests on helpers (e.g. `bookmarks-helpers.test.ts`, `bulk-rename.test.ts`). It has **no React component tests** and no testing-library setup. We follow that convention: test pure logic, verify UI manually.

**Unit tests (TDD):**

`src/lib/utils.test.ts` (new):
- `getPreviewKind('photo.JPG')` → `'image'` (case-insensitive)
- `getPreviewKind('readme.md')` → `'text'`
- `getPreviewKind('report.pdf')` → `'pdf'`
- `getPreviewKind('clip.mp4')` → `'video'`
- `getPreviewKind('voice.mp3')` → `'audio'`
- `getPreviewKind('archive.zip')` → `null`
- `getPreviewKind('noextension')` → `null`
- `getPreviewKind('multi.dot.pdf')` → `'pdf'`
- `isImageFile('a.png')` → `true`
- `isImageFile('a.pdf')` → `false` (regression — preserve current behavior)

`src/lib/preview/language-map.test.ts` (new):
- `inferLanguage('app.ts')` → `'typescript'`
- `inferLanguage('script.sh')` → `'bash'`
- `inferLanguage('Dockerfile')` → `'docker'`
- `inferLanguage('mystery.xyz')` → `null`
- `inferLanguage('plain.txt')` → `null`

`src/lib/preview/text-fetch.test.ts` (new):
- Returns `tooLarge` when `content-length > cap` (mock `fetch`)
- Returns `tooLarge` when streamed bytes exceed cap with missing `content-length`
- Returns `ok` with decoded text for a small valid response
- Returns `error` when fetch rejects
- Returns `error` when body bytes fail UTF-8 decoding

**Manual verification:**

After wiring each renderer, run `pnpm dev` and:

1. Upload one file per kind to a test bucket. Click each → modal opens with correct renderer.
2. Unhappy paths:
   - Upload a 10 MB `.log` → "too large" message
   - Upload a `.zip` → "no preview available" panel
   - Upload a corrupted `.png` → image error state
   - Upload a 5-page PDF → renders inline
   - Upload a short `.mp4` → plays
3. `pnpm build` and inspect chunk output — the syntax highlighter should be in its own chunk (lazy-loaded), not in the main bundle.

## Out of scope (deferred)

- Rendered markdown (only highlighted as source in v1)
- PDF page navigation / zoom controls (rely on browser-native viewer)
- Text line wrap toggle
- Text "load more" beyond the 5 MB cap (truncation chosen over streaming during brainstorming)
- Office documents (`.docx`, `.xlsx`, `.pptx`) — would need a separate server-side conversion strategy
- Archive previews (`.zip` listing)
- Image gallery expansion to include non-image previewable kinds (current gallery view stays images-only)
