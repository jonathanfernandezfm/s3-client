# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

S3-client is a Next.js web application for managing S3-compatible object storage. Users can connect to multiple S3 endpoints (AWS S3, MinIO, etc.), browse buckets, upload/download files, and manage objects.

## Development Commands

```bash
pnpm dev          # Development server with Turbopack
pnpm build        # Production build
pnpm lint         # ESLint check
```

Database commands:
```bash
pnpm prisma generate    # Generate Prisma client (outputs to src/generated/prisma/)
pnpm prisma migrate dev # Run migrations in development
pnpm prisma db push     # Push schema changes without migrations
```

## Technology Stack

- **Framework**: Next.js 16 with App Router, React 19, TypeScript
- **Database**: PostgreSQL with Prisma ORM (using @prisma/adapter-pg)
- **State Management**: Zustand (client state) + TanStack React Query (server state)
- **S3 Client**: AWS SDK v3 (@aws-sdk/client-s3, @aws-sdk/lib-storage, @aws-sdk/s3-request-presigner)
- **UI**: Tailwind CSS 4, Radix UI primitives, Lucide icons

## Architecture

### State Management Pattern

**Zustand stores** (`src/lib/stores/`):
- `connection-store`: Tracks active connection ID and connection health status
- `browser-store`: File browser UI state (current path, selection, sorting, view mode)
- `upload-store`: Upload progress tracking

**React Query** (`src/lib/queries/`):
- Query key factory in `keys.ts` for consistent cache invalidation
- Hooks: `useConnections`, `useBuckets`, `useObjects`
- Default 1-minute stale time, automatic invalidation on mutations

### Data Flow

```
PostgreSQL (Prisma) → API Routes → React Query Hooks → Components + Zustand
```

### API Routes Structure (`src/app/api/`)

- `/connections` - CRUD for S3 connection configurations
- `/connections/test` - Test connection credentials
- `/buckets` - List/create/delete buckets
- `/objects` - List/upload/download/delete objects, create folders

API routes fetch the connection from database before performing S3 operations using the S3Client factory (`src/lib/s3/client.ts`).

### Key Directories

- `src/app/(dashboard)/` - Route group for dashboard pages with shared layout
- `src/components/ui/` - Reusable shadcn-style UI primitives
- `src/lib/db/` - Prisma singleton and database operations
- `src/generated/prisma/` - Generated Prisma client (custom output path)

### Multi-Connection Pattern

Connections are stored in PostgreSQL with credentials. The active connection is tracked in Zustand. S3Client instances are created per-request using connection config from the database. Secret keys are filtered from list API responses.

## Path Alias

`@/*` maps to `./src/*`
