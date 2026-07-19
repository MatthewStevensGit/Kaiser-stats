/**
 * The tour's "has this browser seen it, and where are they in it" state —
 * client-only localStorage (this app has no server-side "has seen tour" flag by
 * design, see the tour's plan doc: it's a UI preference, not data worth a schema
 * migration). Two independent tours share this module: "general" (identical for
 * everyone, auto-launches once per browser) and "admin" (auto-launches once an
 * admin account visits, whenever that happens to be — could be their very first
 * visit, or months after being promoted; see TourGuide.tsx). Only one tour is
 * ever active at a time. Every mutator dispatches a same-tab custom event, since
 * the browser's native "storage" event only fires in OTHER tabs — TourGuide.tsx
 * and ProfileMenu.tsx (sibling client components under the root layout) listen
 * for this to react to a change made by ProfileMenu's "Take a tour" buttons
 * without a page reload.
 */

export type TourKind = "general" | "admin";

const ACTIVE_KIND_KEY = "kaiser-tour-kind";
const STEP_KEY = "kaiser-tour-step";
const CHANGE_EVENT = "kaiser-tour-change";

function seenKey(kind: TourKind): string {
  return kind === "general" ? "kaiser-tour-seen" : "kaiser-tour-admin-seen";
}

function notifyChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onTourStateChange(handler: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export function hasSeenTour(kind: TourKind): boolean {
  return window.localStorage.getItem(seenKey(kind)) === "true";
}

function markTourSeen(kind: TourKind): void {
  window.localStorage.setItem(seenKey(kind), "true");
}

/** null = no tour currently in progress. */
export function getActiveTour(): { kind: TourKind; step: number } | null {
  const kind = window.localStorage.getItem(ACTIVE_KIND_KEY);
  if (kind !== "general" && kind !== "admin") return null;
  const raw = window.localStorage.getItem(STEP_KEY);
  const step = raw === null ? NaN : Number(raw);
  if (!Number.isInteger(step) || step < 0) return null;
  return { kind, step };
}

export function setActiveStep(kind: TourKind, step: number): void {
  window.localStorage.setItem(ACTIVE_KIND_KEY, kind);
  window.localStorage.setItem(STEP_KEY, String(step));
  notifyChange();
}

/** Ends whichever tour is currently active, marking it seen so it won't auto-launch again. */
export function endActiveTour(): void {
  const active = getActiveTour();
  window.localStorage.removeItem(ACTIVE_KIND_KEY);
  window.localStorage.removeItem(STEP_KEY);
  if (active) markTourSeen(active.kind);
  notifyChange();
}

/** Starts (or restarts) the given tour from step 0 — used by auto-launch and manual replay alike. */
export function startTour(kind: TourKind): void {
  window.localStorage.removeItem(seenKey(kind));
  setActiveStep(kind, 0);
}
