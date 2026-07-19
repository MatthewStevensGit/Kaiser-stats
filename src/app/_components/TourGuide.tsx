"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { ADMIN_TOUR_STEPS, GENERAL_TOUR_STEPS, type TourStep } from "@/lib/tour/steps";
import {
  endActiveTour,
  getActiveTour,
  hasSeenTour,
  onTourStateChange,
  setActiveStep,
  startTour,
  type TourKind,
} from "@/lib/tour/tour-state";

/** How long a step waits for its element to actually appear before giving up — generous
 * because a cross-page step means waiting on a real Next.js navigation + data fetch,
 * not just a DOM update. */
const ELEMENT_WAIT_MS = 3000;

/**
 * Unconditionally strips every DOM trace driver.js leaves behind, regardless of what
 * its own isActive()/destroy() report — a belt-and-suspenders cleanup, since relying
 * solely on destroy() before re-driving to a new step left two consecutive same-page
 * steps' popovers both visible at once in practice (see TourGuide's per-step
 * onNextClick/onPrevClick below, which fully replace driver.js's own internal
 * transition path — including whatever teardown it would normally do first).
 */
function forceCleanupTourDom(): void {
  document.querySelectorAll(".driver-popover, .driver-overlay").forEach((el) => el.remove());
  document.body.classList.remove("driver-active", "driver-fade", "driver-simple", "driver-no-scroll");
  document.querySelectorAll(".driver-active-element, .driver-active-element-parent").forEach((el) => {
    el.classList.remove(
      "driver-active-element",
      "driver-active-element-parent",
      "driver-active-element-parent-no-scroll",
    );
  });
}

function buildDriveSteps(
  steps: TourStep[],
  kind: TourKind,
  driverRef: MutableRefObject<Driver | null>,
): DriveStep[] {
  return steps.map((step, index) => {
    const isLast = index === steps.length - 1;
    return {
      element: step.selector,
      waitForElement: ELEMENT_WAIT_MS,
      skipMissingElement: true,
      popover: {
        title: step.title,
        description: step.description,
        // The last step's "Done" already ends the tour — showing a separate
        // "Skip Tour" alongside it there would be redundant.
        showButtons: isLast ? ["next", "previous"] : ["next", "previous", "close"],
        disableButtons: index === 0 ? ["previous"] : [],
        nextBtnText: isLast ? "Done" : "Next",
        onNextClick: () => {
          if (isLast) {
            endActiveTour();
            driverRef.current?.destroy();
            forceCleanupTourDom();
            return;
          }
          setActiveStep(kind, index + 1);
        },
        onPrevClick: () => {
          if (index === 0) return;
          setActiveStep(kind, index - 1);
        },
        onCloseClick: () => {
          endActiveTour();
          driverRef.current?.destroy();
          forceCleanupTourDom();
        },
      },
    };
  });
}

/**
 * Owns both guided tours end to end (see steps.ts: GENERAL_TOUR_STEPS, identical
 * for everyone, and ADMIN_TOUR_STEPS, auto-launched separately once an admin
 * account visits — could be their first visit ever, or long after being
 * promoted). Reads/writes tour-state.ts's localStorage state, drives driver.js's
 * drive(index) (never moveNext()/movePrevious() — those assume every step's
 * element is already on the page, which isn't true here since steps span real
 * routes), and navigates between steps that live on different pages. Mounted
 * once in the root layout, always present, renders nothing itself.
 */
export function TourGuide({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const driverRef = useRef<Driver | null>(null);

  const generalDriveSteps = useMemo(
    () => buildDriveSteps(GENERAL_TOUR_STEPS, "general", driverRef),
    [],
  );
  const adminDriveSteps = useMemo(
    () => buildDriveSteps(ADMIN_TOUR_STEPS, "admin", driverRef),
    [],
  );

  useEffect(() => {
    function attempt() {
      const active = getActiveTour();

      if (!active) {
        // Auto-launch exactly once per browser per tour kind — startTour() below
        // dispatches the change event this same effect listens for, re-entering
        // attempt(). General always comes first; admin only ever follows it.
        if (!hasSeenTour("general")) {
          startTour("general");
        } else if (isAdmin && !hasSeenTour("admin")) {
          startTour("admin");
        }
        return;
      }

      const steps = active.kind === "general" ? GENERAL_TOUR_STEPS : ADMIN_TOUR_STEPS;
      const driveSteps = active.kind === "general" ? generalDriveSteps : adminDriveSteps;

      if (active.step >= steps.length) {
        endActiveTour();
        driverRef.current?.destroy();
        forceCleanupTourDom();
        return;
      }

      const step = steps[active.step]!;
      if (step.path !== pathname) {
        driverRef.current?.destroy();
        forceCleanupTourDom();
        router.push(step.path);
        return; // this effect re-fires once the pathname actually changes
      }

      // The Profile dropdown's contents only exist in the DOM while it's open —
      // open it on the tour's behalf rather than requiring the user to.
      if (!document.querySelector(step.selector)) {
        const trigger = document.querySelector('[data-tour-id="profile-menu"]');
        if (trigger instanceof HTMLElement && trigger.getAttribute("aria-expanded") !== "true") {
          trigger.click();
        }
      }

      // A fresh instance every step (rather than reusing/mutating one long-lived
      // instance across the whole tour) plus the brute-force cleanup above —
      // deliberately not trusting driver.js's own isActive()/destroy() bookkeeping
      // to be reliable across externally-driven step transitions.
      driverRef.current?.destroy();
      forceCleanupTourDom();
      driverRef.current = driver({
        overlayColor: "#000",
        overlayOpacity: 0.75,
        stagePadding: 6,
        stageRadius: 8,
        popoverClass: "kaiser-tour-popover",
        allowKeyboardControl: true,
        showProgress: true,
        progressText: "{{current}}/{{total}}",
        steps: driveSteps,
        onPopoverRender: (popover) => {
          popover.closeButton.textContent = "Skip Tour →";
        },
      });
      driverRef.current.drive(active.step);
    }

    attempt();
    return onTourStateChange(attempt);
  }, [pathname, isAdmin, generalDriveSteps, adminDriveSteps, router]);

  useEffect(
    () => () => {
      driverRef.current?.destroy();
      forceCleanupTourDom();
    },
    [],
  );

  return null;
}
