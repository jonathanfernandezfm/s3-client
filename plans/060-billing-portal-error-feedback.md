# Plan 060: Surface billing-portal errors + polish the upgrade-prompt button

> Drift check (run first): `git diff --stat e9ad3b3..HEAD -- src/components/billing/billing-tab.tsx` — if changed, compare to excerpts; on mismatch STOP.

## Status
- Priority: P1 | Effort: S | Risk: LOW | Depends on: none | Category: UX/correctness
- Planned at: commit e9ad3b3, 2026-06-27

## Why this matters
In `src/components/billing/billing-tab.tsx`, when a paying user clicks "Manage billing" and the `/api/billing/portal` request fails, the error is only `console.error`'d with a `// TODO: show toast notification` — the user sees the spinner stop and nothing happens, with no idea the action failed. In a payments flow this erodes trust. The app already has a notification system (`useNotificationStore`) used throughout. Also, the in-app upgrade prompt uses a bare `<button>` with ad-hoc styling and no `type` attribute; tidy it to match the app's `Button` component.

## Current state (verbatim)
`src/components/billing/billing-tab.tsx`:
- handler (lines 71-85):
```tsx
async function handleManageBilling() {
  setPortalLoading(true);
  try {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      console.error("Portal error:", data.error);
      // TODO: show toast notification
      return;
    }
    if (data.url) window.location.href = data.url;
  } finally {
    setPortalLoading(false);
  }
}
```
- bare upgrade button (lines 158-163):
```tsx
<button
  className="underline hover:no-underline"
  onClick={() => openPlansModal()}
>
  {tier === "PRO" ? "Upgrade to Enterprise" : "Upgrade to PRO"}
</button>
```
Conventions to reuse:
- Notification store: import `useNotificationStore` from `@/lib/stores/notification-store` (verify the exact path/exports — grep `useNotificationStore` across `src/components` for an existing import to copy). Call shape used elsewhere: `addNotification({ type: "error", title: string, error?: string, status: "error" })`.
- `Button` is already imported in this file (from `@/components/ui/button`) and has a `variant="link"` variant.

## Scope
In scope (ONLY): `src/components/billing/billing-tab.tsx` (+ plan/index/changelog files).
Out of scope: the `/api/billing/portal` route, the upgrade modal store, any other component.

## Steps
### Step 1: Surface portal errors
- Add `const addNotification = useNotificationStore((s) => s.addNotification);` inside `BillingTab` (add the import). Match the exact import path an existing component uses.
- In `handleManageBilling`, replace the `console.error(...)` + TODO block with:
```tsx
if (!res.ok) {
  addNotification({ type: "error", title: "Couldn't open billing portal", error: data.error || "Please try again.", status: "error" });
  return;
}
```
Also wrap the `fetch` in handling for a thrown/network error: add a `catch` that calls the same notification (keep the `finally { setPortalLoading(false) }`). E.g. `try { ... } catch { addNotification({ type: "error", title: "Couldn't open billing portal", error: "Please try again.", status: "error" }); } finally { setPortalLoading(false); }`.
- Remove the `// TODO` comment and the `console.error`.

### Step 2: Replace the bare upgrade button
Replace the raw `<button className="underline hover:no-underline" ...>` with `<Button variant="link" className="h-auto p-0 underline hover:no-underline" onClick={() => openPlansModal()}>...</Button>` so it uses the design-system component (this also gives it `type="button"` and a focus ring). Keep the same label expression and onClick.

**Verify**: `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test` pass. `git grep -n "TODO: show toast" src/components/billing/billing-tab.tsx` returns nothing. `git grep -n "console.error" src/components/billing/billing-tab.tsx` returns nothing.

## Done criteria (ALL)
- [ ] Portal fetch failure (non-ok AND thrown error) shows an error notification
- [ ] TODO comment and console.error removed
- [ ] Bare `<button>` replaced with `Button variant="link"`
- [ ] `pnpm typecheck`/`lint`/`test` green
- [ ] Only billing-tab.tsx (+ plan/index/changelog) changed
- [ ] PR opened

## STOP conditions
- Live code doesn't match excerpts (drift) → STOP.
- You cannot find an existing `useNotificationStore` import to copy the path/shape from → STOP and report (don't guess the API).
- A verification fails twice after a reasonable fix → STOP.

## Maintenance notes
Reviewer: confirm the notification fires on both the non-ok response path and a network exception. The success path (redirect) is unchanged.
