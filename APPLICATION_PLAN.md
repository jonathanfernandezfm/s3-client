# S3 Web UI - Application Definition Document

## Overview

A modern web application providing a user-friendly interface for managing S3-compatible storage services. Built with Next.js, shadcn/ui, and Tailwind CSS v4.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 15 (App Router) | Framework |
| React 19 | UI Library |
| TypeScript | Type Safety |
| Tailwind CSS v4 | Styling |
| shadcn/ui | Component Library |
| AWS SDK v3 | S3 Operations |
| Zustand | Client State Management |
| TanStack React Query v5 | Server State, Caching & Data Fetching |

---

## Application Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Dashboard layout group
│   │   ├── buckets/        # Bucket management
│   │   ├── browser/        # File browser
│   │   └── settings/       # App settings
│   ├── api/                # API routes
│   ├── layout.tsx          # Root layout
│   └── providers.tsx       # React Query + other providers
├── components/
│   ├── ui/                 # shadcn components
│   ├── buckets/            # Bucket-related components
│   ├── browser/            # File browser components
│   └── shared/             # Shared components
├── lib/
│   ├── s3/                 # S3 client & operations
│   ├── stores/             # Zustand stores
│   ├── queries/            # React Query hooks & query keys
│   │   ├── keys.ts         # Query key factory
│   │   ├── connections.ts  # Connection queries & mutations
│   │   ├── buckets.ts      # Bucket queries & mutations
│   │   └── objects.ts      # Object queries & mutations
│   └── utils/              # Utility functions
└── types/                  # TypeScript definitions
```

---

## UI Sections

### 1. Connection Configuration

**Purpose:** Configure and manage S3 endpoint connections.

**Features:**
- [ ] Add new S3 connection (endpoint URL, access key, secret key, region)
- [ ] Support for multiple S3-compatible providers (AWS, MinIO, DigitalOcean Spaces, etc.)
- [ ] Test connection functionality
- [ ] Save/edit/delete connections
- [ ] Connection status indicator

**Components:**
- `ConnectionForm` - Form for adding/editing connections
- `ConnectionList` - List of saved connections
- `ConnectionCard` - Individual connection display with status

**Location:** `/settings/connections`

---

### 2. Bucket Management

**Purpose:** View and manage S3 buckets.

**Features:**
- [ ] List all buckets for active connection
- [ ] Create new bucket
- [ ] Delete bucket (with confirmation)
- [ ] View bucket properties (region, creation date, size)
- [ ] Bucket search/filter

**Components:**
- `BucketList` - Grid/list view of buckets
- `BucketCard` - Individual bucket display
- `CreateBucketDialog` - Modal for bucket creation
- `BucketActions` - Dropdown menu for bucket operations

**Location:** `/buckets`

---

### 3. File Browser

**Purpose:** Navigate and manage files within buckets.

**Features:**
- [ ] Hierarchical folder navigation (breadcrumb + tree view)
- [ ] File/folder listing with details (name, size, modified date, type)
- [ ] Grid view and list view toggle
- [ ] Sort by name, size, date, type
- [ ] Search within current directory
- [ ] File type icons
- [ ] Selection (single and multi-select)

**Components:**
- `FileBrowser` - Main container component
- `Breadcrumb` - Navigation path
- `FileList` - Table/grid view of files
- `FileCard` - Individual file display (grid mode)
- `FileRow` - Individual file display (list mode)
- `FolderTree` - Sidebar folder navigation (optional)
- `SelectionToolbar` - Actions for selected items

**Location:** `/browser/[bucket]/[[...path]]`

---

### 4. File Operations

**Purpose:** Perform actions on files and folders.

**Features:**
- [ ] Upload files (drag & drop + button)
- [ ] Upload folders
- [ ] Download files
- [ ] Delete files/folders
- [ ] Rename files/folders
- [ ] Copy/move files between locations
- [ ] Create new folder
- [ ] Upload progress indicator
- [ ] Batch operations on selected items

**Components:**
- `UploadZone` - Drag and drop upload area
- `UploadProgress` - Upload status and progress
- `FileActions` - Context menu / action buttons
- `MoveDialog` - Modal for copy/move destination selection
- `RenameDialog` - Modal for renaming
- `DeleteConfirmDialog` - Confirmation modal

---

### 5. File Preview

**Purpose:** Preview file contents without downloading.

**Features:**
- [ ] Image preview (jpg, png, gif, webp, svg)
- [ ] Text file preview (txt, json, xml, md, code files)
- [ ] PDF preview
- [ ] Video preview (mp4, webm)
- [ ] Audio preview (mp3, wav)
- [ ] Syntax highlighting for code files
- [ ] Download from preview
- [ ] Navigate between files in preview mode

**Components:**
- `FilePreviewModal` - Main preview container
- `ImagePreview` - Image viewer with zoom
- `TextPreview` - Text/code viewer
- `MediaPreview` - Video/audio player
- `PdfPreview` - PDF viewer

**Location:** Modal overlay on `/browser`

---

### 6. File Details Panel

**Purpose:** Display detailed information about selected file/folder.

**Features:**
- [ ] File metadata (size, type, last modified, etag)
- [ ] Custom metadata display
- [ ] S3 storage class
- [ ] Object URL (with copy button)
- [ ] Presigned URL generation
- [ ] Tags management

**Components:**
- `DetailsPanel` - Sidebar panel
- `MetadataList` - Key-value metadata display
- `TagsEditor` - Add/edit/remove tags
- `UrlGenerator` - Presigned URL creation

---

### 7. Global Layout

**Purpose:** Application shell and navigation.

**Features:**
- [ ] Sidebar navigation
- [ ] Active connection indicator
- [ ] Connection switcher
- [ ] Theme toggle (light/dark)
- [ ] Responsive design (mobile-friendly)

**Components:**
- `AppSidebar` - Main navigation sidebar
- `Header` - Top bar with connection info
- `ConnectionSwitcher` - Quick connection change
- `ThemeToggle` - Dark/light mode switch

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/connections` | GET, POST | List/create connections |
| `/api/connections/[id]` | GET, PUT, DELETE | Manage single connection |
| `/api/connections/[id]/test` | POST | Test connection |
| `/api/buckets` | GET, POST | List/create buckets |
| `/api/buckets/[bucket]` | DELETE | Delete bucket |
| `/api/objects` | GET | List objects in path |
| `/api/objects/upload` | POST | Upload file(s) |
| `/api/objects/download` | GET | Download file |
| `/api/objects/delete` | DELETE | Delete object(s) |
| `/api/objects/copy` | POST | Copy object |
| `/api/objects/move` | POST | Move object |
| `/api/objects/presign` | POST | Generate presigned URL |

---

## State Management

### Zustand Stores (Client State)

1. **ConnectionStore**
   - Active connection ID
   - Connection status

2. **BrowserStore**
   - Current bucket
   - Current path
   - Selected items
   - View mode (grid/list)
   - Sort options

3. **UploadStore**
   - Upload queue
   - Upload progress
   - Upload status

### React Query (Server State)

All API data fetching uses TanStack React Query for:
- Automatic caching and cache invalidation
- Background refetching
- Optimistic updates
- Loading/error states

**Query Keys Structure:**
```typescript
// Connections
['connections']                           // All connections
['connections', connectionId]             // Single connection

// Buckets
['buckets', connectionId]                 // All buckets for connection

// Objects
['objects', connectionId, bucket, path]   // Objects in path
['object', connectionId, bucket, key]     // Single object metadata
```

**Custom Hooks:**
- `useConnections()` - Fetch all connections
- `useConnection(id)` - Fetch single connection
- `useBuckets()` - Fetch buckets for active connection
- `useObjects(bucket, path)` - Fetch objects in path
- `useObjectMetadata(bucket, key)` - Fetch object details

**Mutations:**
- `useCreateConnection()`
- `useDeleteConnection()`
- `useCreateBucket()`
- `useDeleteBucket()`
- `useUploadObject()`
- `useDeleteObjects()`
- `useCopyObject()`
- `useMoveObject()`

---

## Phase 1 (MVP) Scope

**Goal:** Basic S3 browsing and file management

- [x] Project setup (Next.js, Tailwind v4, shadcn)
- [ ] Connection configuration (single connection)
- [ ] Bucket listing
- [ ] File browser (list view)
- [ ] Basic file operations (upload, download, delete)
- [ ] Folder navigation
- [ ] Image preview

---

## Phase 2 Scope

- [ ] Multiple connections management
- [ ] Grid view for files
- [ ] Batch operations
- [ ] File preview (text, pdf, media)
- [ ] Search functionality
- [ ] Presigned URL generation

---

## Phase 3 Scope (Future)

- [ ] Authentication & user management
- [ ] Access control / permissions
- [ ] Activity logging
- [ ] Bucket policies management
- [ ] Transfer acceleration settings
- [ ] Versioning support

---

## Design Considerations

### Theming
- Custom theme support (to be added later)
- Dark/light mode from day one
- shadcn/ui theming via CSS variables

### Performance
- Virtual scrolling for large file lists
- Lazy loading for previews
- Optimistic UI updates
- React Query caching

### Security
- Credentials stored securely (encrypted at rest for Phase 3)
- Presigned URLs for downloads
- No credentials exposed to client

---

## Design Decisions

1. **Connection Storage:** Local storage for Phase 1, database with user accounts for Phase 3

2. **S3 Operations:** Server-side via API routes (keeps credentials secure)

3. **S3 Versioning:** Deferred to Phase 3

4. **Upload Strategy:** Multipart upload for files > 5MB

---

## Next Steps

1. Review and refine this document
2. Set up Next.js project with dependencies
3. Configure Tailwind v4 and shadcn/ui
4. Implement connection configuration
5. Build bucket listing
6. Create file browser

