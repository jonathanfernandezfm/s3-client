# Plan 041: Announce in-app notifications to screen readers and name the dismiss button

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/shared/notifications.tsx`
> If it changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (sole file is `notifications.tsx`)
- **Category**: direction (accessibility)
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

`Notifications` is the app's unified feedback channel — copy/move/delete/upload/
folder/download/error results and in-progress operations all surface here (the
codebase migrated its old toasts into this `NotificationStore`). But the toast
container is a plain `<div>` with no ARIA live region, so **none of this is
announced to screen readers**: a blind user triggers a delete and gets no
confirmation it happened, no error if it failed. The dismiss button is also
icon-only with no accessible name. This plan wires the notification stack as a
polite live region and labels the dismiss control — small, additive, high-value.

## Current state

`src/components/shared/notifications.tsx`:

- `NotificationItem` renders each toast (lines 82-138). The outer item is a plain
  `<div className="relative flex items-start gap-3 p-3 bg-card border rounded-lg ...">`
  with mouse-enter/leave handlers (pause auto-hide). It contains the title
  (line 91), optional description (93-97), an in-progress progress bar (99-108),
  an error block (110-117), and a dismiss `<Button>` shown only when not
  in-progress (lines 120-129):
  ```tsx
  {notification.status !== "in-progress" && (
    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
      onClick={() => removeNotification(notification.id)}>
      <X className="h-3.5 w-3.5" />
    </Button>
  )}
  ```
  The dismiss button has **no accessible name** (icon only).
- `Notifications` (lines 141-171) is the container:
  ```tsx
  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 space-y-2">
      {hasCompleted && (<div className="flex justify-end"><Button ... onClick={clearCompleted}>Clear completed</Button></div>)}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {notifications.map((n) => (<NotificationItem key={n.id} notification={n} />))}
      </div>
    </div>
  );
  ```
  Neither wrapper is a live region, so additions/changes are not announced.
- `notification.status` is one of `"in-progress" | "completed" | "error"`
  (see the `AUTO_HIDE_DURATION` map, lines 23-27).

Conventions to match:
- Tailwind utilities; `lucide-react` icons; the `Button` primitive forwards
  `aria-label` to the underlying `<button>`.
- The dialog primitive's pattern for a named icon button is a `sr-only` span
  (`src/components/ui/dialog.tsx:52`); for a `Button` we use `aria-label` here
  (simpler, equivalent).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass (no regressions) |
| Dev (manual smoke) | `pnpm dev` | app serves; see Step 4 |

## Suggested executor toolkit

- If available, invoke `web-design-guidelines` for ARIA live-region semantics
  (`role="status"` vs `role="alert"`, `aria-live`, `aria-atomic`).

## Scope

**In scope** (modify only):
- `src/components/shared/notifications.tsx`

**Out of scope** (do NOT touch):
- `src/lib/stores/notification-store.ts` — the store shape and timing are fine;
  read it as today.
- The auto-hide timing logic, the progress bar animation, or the pause-on-hover
  behavior — leave them.
- `upload-manager.tsx` / `transfer-progress.tsx` — those have their own progress
  surfaces; announcing them is a separate deferred follow-up (see README). Do NOT
  edit them here.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `feat/041-notification-a11y`.
- Commit: `feat(a11y): announce notifications via live region; label dismiss button`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Make the notification list a polite live region

On the inner list `<div className="space-y-2 max-h-80 overflow-y-auto">`
(line ~164), add live-region attributes so new/updated notifications are
announced without stealing focus:

```tsx
<div
  className="space-y-2 max-h-80 overflow-y-auto"
  role="status"
  aria-live="polite"
  aria-relevant="additions text"
>
```

`role="status"` + `aria-live="polite"` announces additions and text changes when
the user is idle (appropriate for confirmations and progress). Keep it on the
list wrapper (the stable element), not on individual items, so it's a persistent
live region the screen reader is already observing when items appear.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Give each item an atomic announcement boundary

On the `NotificationItem` root `<div>` (line ~83), add `aria-atomic="true"` so
the whole item (title + description/error) is read as one unit when it changes,
rather than just the changed text node:

```tsx
<div
  className="relative flex items-start gap-3 p-3 bg-card border rounded-lg shadow-sm overflow-hidden"
  aria-atomic="true"
  onMouseEnter={() => { pausedRef.current = true; }}
  onMouseLeave={() => { pausedRef.current = false; }}
>
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Name the dismiss button

On the dismiss `<Button>` (lines ~120-129), add `aria-label="Dismiss notification"`:

```tsx
<Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
  aria-label="Dismiss notification"
  onClick={() => removeNotification(notification.id)}>
  <X className="h-3.5 w-3.5" />
</Button>
```

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Manual smoke test

Run `pnpm dev`. With a screen reader on if available (otherwise verify via the
devtools Accessibility tree that the list has `role="status"`/`aria-live="polite"`):

1. Trigger an operation that posts a notification (e.g. copy a file key → "Key
   copied", or delete an object). A screen reader announces the notification text
   when it appears; visually nothing changed.
2. Trigger a failing operation → the error notification is announced (its text is
   inside the same live region).
3. The dismiss (X) button reports an accessible name ("Dismiss notification") in
   the devtools Accessibility pane; clicking it still removes the toast.
4. Auto-hide, pause-on-hover, and the progress bar all behave exactly as before.

**Verify**: all four behaviors observed. Report any deviation.

### Step 5: Full gate

**Verify**: `pnpm test` (all pass), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0).

## Test plan

- No DOM-interaction harness exists for notifications; verification is the Step 4
  manual smoke plus a green `pnpm test`/`typecheck`/`lint`. Do NOT build a new
  harness. State which path you took in your report.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (no regressions)
- [ ] `grep -n 'aria-live="polite"' src/components/shared/notifications.tsx` shows the live region
- [ ] `grep -n 'aria-label="Dismiss notification"' src/components/shared/notifications.tsx` shows the labeled button
- [ ] Manual smoke (Step 4) all four behaviors pass
- [ ] No files outside `notifications.tsx` are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Error notifications must interrupt (assertive) rather than wait politely — if a
  reviewer wants errors announced immediately, that needs a *second*
  `role="alert"`/`aria-live="assertive"` region split out by status; STOP and
  ask rather than making both regions assertive (assertive spam is worse than
  silence).
- The live region announces the entire backlog on first page load (because
  notifications are already present at mount) in a disruptive way — report; the
  fix is to gate the region, not to remove it.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Deferred follow-up**: `upload-manager.tsx` and `transfer-progress.tsx` have
  their own progress UIs that are likewise unannounced. Apply the same
  `role="status"`/`aria-live="polite"` treatment there in a later plan (recorded
  in `plans/README.md`).
- If errors later need to interrupt, split the stack into a polite region (status)
  and an assertive region (alert) keyed on `notification.status === "error"`.
- Reviewer should scrutinize: the live region is on the *stable* list wrapper (so
  the screen reader is observing it before items arrive), and `aria-atomic` is on
  the item, not the list (otherwise every change re-reads the whole stack).
