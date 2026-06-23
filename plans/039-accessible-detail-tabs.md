# Plan 039: Convert the bucket- and connection-detail tab bars to the WAI-ARIA tabs pattern with arrow-key navigation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5f963f5..HEAD -- src/components/buckets/bucket-detail-tabs.tsx src/components/connections/connection-detail-tabs.tsx`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (accessibility / navigation)
- **Planned at**: commit `5f963f5`, 2026-06-23

## Why this matters

The bucket-detail and connection-detail pages present their sub-sections
(Overview / Permissions / Incomplete uploads / Lifecycle) as a horizontal tab
bar, but the markup is a `<nav>` of plain `<button>`s. To assistive tech they're
just buttons: there's no `role="tablist"`/`role="tab"`, no `aria-selected`, the
active tab is conveyed by border color only, and there is no arrow-key movement
between tabs (the WAI-ARIA tabs convention). This plan applies the standard tabs
pattern to both bars (they're structurally identical), which announces the
control correctly and lets keyboard users move with Left/Right/Home/End.

## Current state

Both files share the same shape. `src/components/buckets/bucket-detail-tabs.tsx`
(lines 62-88):

```tsx
<nav className="flex items-center gap-1 -mb-px">
  {TAB_DEFINITIONS.map((def) => {
    const { key, label, icon: Icon } = def;
    const badge = "badge" in def ? def.badge : undefined;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setTab(key)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm border-b-2 transition-colors",
          key === activeTab
            ? "border-foreground text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
        {badge && (<span className="...">{badge}</span>)}
      </button>
    );
  })}
</nav>
```

- `activeTab` is resolved from the URL (`?tab=`), and `setTab(key)` does a
  `router.push` (lines 30-41). Tabs are URL-driven; selecting one navigates.
- The tab panels are rendered below as conditional blocks
  (`{activeTab === "overview" && <OverviewTab .../>}`, lines 92-110), NOT as
  sibling `role="tabpanel"` elements.

`src/components/connections/connection-detail-tabs.tsx` (lines 62-79) is the
same pattern with two tabs (`overview`, `permissions`) and no badge, panels at
lines 82-89.

Conventions to match:
- `cn(...)` from `@/lib/utils` for class merging (already imported in both).
- `activeTab` is the source of truth for the selected tab in both files.
- The repo uses Tailwind state classes for visuals; keep the existing
  border/color classes for the *visual* selected state and add ARIA for the
  *programmatic* state.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass (no regressions) |
| Dev (manual smoke) | `pnpm dev` | app serves; see Step 4 |

## Suggested executor toolkit

- If available, invoke `web-design-guidelines` for the WAI-ARIA Tabs pattern
  (roles, `aria-selected`, roving `tabIndex`, arrow-key behavior).

## Scope

**In scope** (modify only):
- `src/components/buckets/bucket-detail-tabs.tsx`
- `src/components/connections/connection-detail-tabs.tsx`

**Out of scope** (do NOT touch):
- The tab content components (`OverviewTab`, `PermissionsTab`,
  `MultipartUploadsTab`, `ComingSoonTab`, `ConnectionOverviewTab`,
  `ConnectionPermissionsTab`) — only wrap the existing container with the
  tabpanel role; do not edit those files.
- The browser tab bar `src/components/tabs/tab-bar.tsx` — that is a different,
  drag-enabled control with its own a11y gap (recorded as deferred in
  `plans/README.md`); do NOT change it here.
- The URL/`setTab` routing logic — selecting a tab still navigates.

## Git workflow

- Shared checkout — run `git branch --show-current` before committing.
- Branch: `feat/039-accessible-detail-tabs`.
- Commit: `feat(a11y): WAI-ARIA tabs pattern + arrow-key nav for bucket/connection detail tabs`.
- Do NOT push or open a PR unless instructed.

## Steps

Apply the same transformation to **both** files. Steps below show
`bucket-detail-tabs.tsx`; repeat identically for `connection-detail-tabs.tsx`
(adjusting the id prefix to `connection-tab-` and the tab keys to its two tabs).

### Step 1: Add the roving arrow-key handler

At the top of the component body (after `const setTab = ...`), add a keydown
handler that moves selection with the keyboard. Because selecting a tab here
navigates (URL-driven) and there's no separate "focus vs select" state to track,
use the **automatic activation** model: arrow keys call `setTab` on the
neighbor.

```tsx
const TAB_KEYS = TAB_DEFINITIONS.map((d) => d.key);

const handleTabKeyDown = (e: React.KeyboardEvent) => {
  const idx = TAB_KEYS.indexOf(activeTab);
  let next = idx;
  if (e.key === "ArrowRight") next = (idx + 1) % TAB_KEYS.length;
  else if (e.key === "ArrowLeft") next = (idx - 1 + TAB_KEYS.length) % TAB_KEYS.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = TAB_KEYS.length - 1;
  else return;
  e.preventDefault();
  setTab(TAB_KEYS[next] as typeof activeTab);
};
```

(Use the file's existing tab-key type for the cast: in `bucket-detail-tabs.tsx`
it's `BucketTabKey`; in `connection-detail-tabs.tsx` it's `TabKey`. The simplest
correct form is `setTab(TAB_KEYS[next])` if `TAB_KEYS` is already typed as the
key union — verify the type and adjust so typecheck passes.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Add tablist + tab roles and roving tabIndex

Change the `<nav>` to a tablist and each button to a tab:

```tsx
<nav role="tablist" aria-label="Bucket sections" className="flex items-center gap-1 -mb-px">
  {TAB_DEFINITIONS.map((def) => {
    const { key, label, icon: Icon } = def;
    const badge = "badge" in def ? def.badge : undefined;
    const selected = key === activeTab;
    return (
      <button
        key={key}
        id={`bucket-tab-${key}`}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls="bucket-tabpanel"
        tabIndex={selected ? 0 : -1}
        onClick={() => setTab(key)}
        onKeyDown={handleTabKeyDown}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm border-b-2 transition-colors",
          selected
            ? "border-foreground text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
        {badge && (<span className="...keep existing badge classes...">{badge}</span>)}
      </button>
    );
  })}
</nav>
```

Roving `tabIndex` (only the selected tab is `0`, the rest `-1`) means Tab enters
the tablist once and arrow keys move between tabs — the required pattern. For
`connection-detail-tabs.tsx` use `aria-label="Connection sections"`, id prefix
`connection-tab-`, and `aria-controls="connection-tabpanel"`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Mark the content area as the tabpanel

Wrap the content container (the `<div className="flex-1 overflow-y-auto p-6">` at
line ~91) with tabpanel semantics, labelled by the active tab button:

```tsx
<div
  id="bucket-tabpanel"
  role="tabpanel"
  aria-labelledby={`bucket-tab-${activeTab}`}
  tabIndex={0}
  className="flex-1 overflow-y-auto p-6"
>
  {activeTab === "overview" && ( ... )}
  ...
</div>
```

`tabIndex={0}` lets keyboard users Tab from the tablist into the panel content.
For the connections file use `id="connection-tabpanel"` and
`aria-labelledby={`connection-tab-${activeTab}`}`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Manual smoke test

Run `pnpm dev`, open a bucket detail page (`/app/buckets/<conn>/<bucket>?tab=overview`)
and a connection detail page:

1. Click each tab — it still navigates and shows the right panel (unchanged
   behavior).
2. Tab into the tab bar with the keyboard (one Tab reaches the selected tab),
   then press **ArrowRight/ArrowLeft** — selection moves to the neighbor tab and
   the panel updates; **Home**/**End** jump to first/last.
3. In devtools Accessibility pane (or a screen reader): the bar is a "tab list",
   each tab reports selected/unselected, and the content area is a "tab panel"
   labelled by the active tab.
4. Repeat 1-3 on the connection-detail page.

**Verify**: all four behaviors observed on both pages. Report any deviation.

### Step 5: Full gate

**Verify**: `pnpm test` (all pass), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0).

## Test plan

- No DOM-interaction harness exists for these tab bars; verification is the
  Step 4 manual smoke plus a green `pnpm test`/`typecheck`/`lint`. Do NOT build a
  new harness. State which path you took in your report.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (no regressions)
- [ ] `grep -n 'role="tablist"' src/components/buckets/bucket-detail-tabs.tsx src/components/connections/connection-detail-tabs.tsx` shows both
- [ ] `grep -c 'role="tab"' src/components/buckets/bucket-detail-tabs.tsx` ≥ 1 and same for the connections file
- [ ] `grep -n 'role="tabpanel"' src/components/buckets/bucket-detail-tabs.tsx src/components/connections/connection-detail-tabs.tsx` shows both
- [ ] Manual smoke (Step 4) all behaviors pass on both pages
- [ ] No files outside the two in-scope files are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A tab's `key` and the URL tab param no longer line up (the `resolveBucketTab` /
  `isTabKey` helpers changed) such that `setTab(neighborKey)` wouldn't select the
  expected tab — report.
- Adding `role="tabpanel"` + `tabIndex={0}` around the content visibly breaks
  scrolling/layout of an existing tab's content — report; do not strip the role.
- The `setTab(TAB_KEYS[next])` call won't typecheck cleanly even after typing
  `TAB_KEYS` as the key union — report rather than casting with `as any`.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a new tab is added to either bar, it automatically joins the roving order
  (the handler derives indices from `TAB_DEFINITIONS`) — no handler change needed.
- This uses **automatic activation** (arrow = select+navigate) because the tabs
  are URL-driven; if a future tab becomes expensive to load, consider switching
  to manual activation (arrow moves focus only, Enter/Space selects) — that needs
  a separate "focused tab" state.
- Reviewer should scrutinize: only the selected tab has `tabIndex={0}` (roving),
  `aria-controls`/`aria-labelledby` ids match between tab and panel, and the
  visual selected state is unchanged.
