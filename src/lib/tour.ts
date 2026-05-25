// Shepherd.js onboarding tour for new users.
//
// One Tour instance, survives across Next.js client-side navigations.
// Cross-page steps call `router.push(...)`, wait for the target element to
// mount via MutationObserver, then advance.

import type { Tour as ShepherdTour } from "shepherd.js";

type Router = { push: (href: string) => void };

export const TOUR_STORAGE_KEY = "realtrack-tour-status";

/** Mark the tour completed so it does not auto-fire on subsequent visits. */
export function markTourCompleted() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "completed");
  } catch {
    /* localStorage unavailable, safe to skip; worst case the tour replays */
  }
}

export function isTourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "completed";
  } catch {
    return false;
  }
}

/** Resolves when `selector` exists in the DOM. Rejects after `timeoutMs`. */
function waitForElement(selector: string, timeoutMs = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`tour: timeout waiting for ${selector}`));
    }, timeoutMs);
  });
}

/** True when we're on a layout where the sidebar is a drawer (mobile/tablet). */
function isMobileLayout(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

type AttachPos = "top" | "bottom" | "left" | "right";

/**
 * Pick an attach position that works for the current viewport. Desktop gets
 * the requested side; mobile falls back to `bottom` (or the requested
 * vertical side) so the popover never spills off the edge.
 */
function pos(desktop: AttachPos): AttachPos {
  if (isMobileLayout()) {
    if (desktop === "right" || desktop === "left") return "bottom";
    return desktop;
  }
  return desktop;
}

/** Open the mobile sidebar drawer if the tour needs to highlight an item
 *  inside it. No-op on desktop where the sidebar is always visible. */
async function ensureSidebarOpen(): Promise<void> {
  if (!isMobileLayout()) return;
  if (typeof window === "undefined") return;
  window.__openSidebar?.();
  // Wait for the slide-in animation to finish so attachTo positions
  // against the final on-screen rectangle, not the off-screen starting one.
  await new Promise((r) => setTimeout(r, 320));
}

/**
 * Build a fresh Tour. Caller is responsible for calling `.start()`.
 * Reusing the same instance across restarts is not safe, make a new one
 * every time the user requests the tour.
 */
export async function createTour(router: Router): Promise<ShepherdTour> {
  // Dynamic import so SSR doesn't try to evaluate the browser-only module.
  // Shepherd 15 puts Tour/Step on the *default* export, not as named exports.
  const Shepherd = (await import("shepherd.js")).default;

  const tour = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      classes: "rt-tour-step",
      scrollTo: { behavior: "smooth", block: "center" },
    },
  });

  // Reusable button factories so every step has consistent affordances.
  type StepCtx = {
    back: () => void;
    next: () => void;
    cancel: () => void;
    complete: () => void;
  };
  const backBtn = {
    text: "Back",
    classes: "shepherd-button-secondary",
    action(this: StepCtx) {
      this.back();
    },
  };
  // Same shape as nextBtn but jumps backward through the tour. Used for
  // steps where the previous step lives on a different route — calling
  // `this.back()` directly fails because Shepherd can't find the prior
  // step's attachTo target on the current page.
  const navigateBack = (href: string, waitSelector: string) => ({
    text: "Back",
    classes: "shepherd-button-secondary",
    action(this: StepCtx) {
      router.push(href);
      (async () => {
        try {
          await waitForElement(waitSelector);
          this.back();
        } catch {
          this.cancel();
        }
      })();
    },
  });
  const skipBtn = {
    text: "Skip tutorial",
    classes: "shepherd-button-secondary",
    action(this: StepCtx) {
      this.cancel();
    },
  };
  const nextBtn = (action?: (ctx: StepCtx) => unknown) => ({
    text: "Next",
    action: action
      ? function (this: StepCtx) {
          return action(this);
        }
      : function (this: StepCtx) {
          this.next();
        },
  });
  const doneBtn = {
    text: "Got it",
    action(this: StepCtx) {
      this.complete();
    },
  };

  // Helper: produce a Next button that navigates to `href`, waits for
  // `selector`, then advances. Wrapped errors trigger cancel so the user
  // isn't stuck in a broken tour.
  const navigateNext = (href: string, waitSelector: string) =>
    nextBtn(async (ctx) => {
      router.push(href);
      try {
        await waitForElement(waitSelector);
        ctx.next();
      } catch {
        ctx.cancel();
      }
    });

  // beforeShowPromise reused for every step that follows a page change.
  const waitFor = (selector: string) => () =>
    waitForElement(selector)
      .then(() => undefined)
      .catch(() => undefined);

  tour.addSteps([
    {
      id: "welcome",
      attachTo: { element: '[data-tour="dashboard-hero"]', on: pos("bottom") },
      title: "Welcome to RealTrack",
      text: "This 30-second tour shows how each page fits together. You can skip anytime.",
      buttons: [skipBtn, nextBtn()],
    },
    {
      id: "sidebar-passing",
      attachTo: { element: 'a[href="/passing-target"]', on: pos("right") },
      title: "Passing Target",
      text: "Work out the minimum score you need on every assessment to pass.",
      // On mobile, the sidebar lives in a drawer. Open it before showing
      // this step so the highlighted link is actually on-screen, and wait
      // for the link to be visible.
      beforeShowPromise: async () => {
        await ensureSidebarOpen();
        await waitForElement('a[href="/passing-target"]').catch(() => undefined);
      },
      buttons: [
        backBtn,
        skipBtn,
        nextBtn(async (ctx) => {
          // Close the drawer before navigating, otherwise the next page
          // mounts behind a still-open overlay on mobile.
          if (isMobileLayout()) {
            window.__closeSidebar?.();
            await new Promise((r) => setTimeout(r, 280));
          }
          router.push("/passing-target");
          try {
            await waitForElement('[data-tour="add-course"]');
            ctx.next();
          } catch {
            ctx.cancel();
          }
        }),
      ],
    },
    {
      id: "add-course",
      attachTo: { element: '[data-tour="add-course"]', on: pos("bottom") },
      title: "Add your courses",
      text: "Start by adding each course with its weights and any grades you already have.",
      beforeShowPromise: waitFor('[data-tour="add-course"]'),
      buttons: [backBtn, skipBtn, navigateNext("/task-value", '[data-tour="add-task"]')],
    },
    {
      id: "add-task",
      attachTo: { element: '[data-tour="add-task"]', on: pos("bottom") },
      title: "Task Value",
      text: "Capture upcoming assignments, the app ranks them by impact vs. effort.",
      beforeShowPromise: waitFor('[data-tour="add-task"]'),
      buttons: [
        navigateBack("/passing-target", '[data-tour="add-course"]'),
        skipBtn,
        navigateNext("/priority-planner", '[data-tour="plan-with-ai"]'),
      ],
    },
    {
      id: "plan-with-ai",
      attachTo: { element: '[data-tour="plan-with-ai"]', on: pos("bottom") },
      title: "Priority Planner",
      text: "Once your tasks are in, this page builds a realistic study schedule across the week.",
      beforeShowPromise: waitFor('[data-tour="plan-with-ai"]'),
      buttons: [
        navigateBack("/task-value", '[data-tour="add-task"]'),
        skipBtn,
        navigateNext("/flashcards", '[data-tour="create-deck"]'),
      ],
    },
    {
      id: "create-deck",
      attachTo: { element: '[data-tour="create-deck"]', on: pos("bottom") },
      title: "Flashcards",
      text: "Make flashcards from notes or even images, great for quick reviews.",
      beforeShowPromise: waitFor('[data-tour="create-deck"]'),
      buttons: [
        navigateBack("/priority-planner", '[data-tour="plan-with-ai"]'),
        skipBtn,
        navigateNext("/quiz-lab", '[data-tour="create-quiz"]'),
      ],
    },
    {
      id: "create-quiz",
      attachTo: { element: '[data-tour="create-quiz"]', on: pos("bottom") },
      title: "Quiz Lab",
      text: "Upload a PDF and generate a multiple-choice quiz to practise with.",
      beforeShowPromise: waitFor('[data-tour="create-quiz"]'),
      buttons: [
        navigateBack("/flashcards", '[data-tour="create-deck"]'),
        skipBtn,
        navigateNext("/dashboard", '[data-tour="dashboard-hero"]'),
      ],
    },
    {
      id: "done",
      title: "You're set",
      text: "Restart this tour any time using the ? button in the top bar. Happy studying!",
      beforeShowPromise: waitFor('[data-tour="dashboard-hero"]'),
      buttons: [
        navigateBack("/quiz-lab", '[data-tour="create-quiz"]'),
        doneBtn,
      ],
    },
  ]);

  tour.on("complete", markTourCompleted);
  tour.on("cancel", markTourCompleted);

  return tour;
}
