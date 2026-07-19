export interface TourStep {
  id: string;
  /** Route this step's element lives on — the tour navigates here before highlighting. */
  path: string;
  /** CSS selector, targeted via a data-tour-id attribute added directly in the target's JSX. */
  selector: string;
  title: string;
  description: string;
}

/**
 * The general app tour — identical for every member regardless of admin status
 * (per the user's call: admin status is usually granted well after someone's first
 * visit, not at signup, so the first-run experience should be the same for everyone;
 * see ADMIN_TOUR_STEPS below for the separate, admin-only supplemental walkthrough).
 * Order here is the order the tour walks in — safe to reorder/extend without
 * touching TourGuide.tsx.
 */
export const GENERAL_TOUR_STEPS: TourStep[] = [
  {
    id: "nav-stats",
    path: "/",
    selector: '[data-tour-id="nav-stats"]',
    title: "Stats",
    description: "Season leaderboards — plus/minus, Golden Boot, MVP, draft position, assists, and recent form.",
  },
  {
    id: "stats-tabs",
    path: "/",
    selector: '[data-tour-id="stats-tabs"]',
    title: "Switch views",
    description: "Pick a year and a stat to sort the leaderboard by. \"All Years\" shows career totals.",
  },
  {
    id: "nav-history",
    path: "/matches",
    selector: '[data-tour-id="nav-history"]',
    title: "History",
    description: "Every recorded match, most recent first — tap a card to see the full report, goals, and MVP.",
  },
  {
    id: "match-card",
    path: "/matches",
    selector: '[data-tour-id="match-card"]',
    title: "A match card",
    description: "The score, date, and MVP pick for that game. Tap it for the full breakdown.",
  },
  {
    id: "nav-checkin",
    path: "/matchday",
    selector: '[data-tour-id="nav-checkin"]',
    title: "Check-In",
    description:
      "Upcoming games — see who's in and check yourself in. Once registration closes you won't be able to check in anymore — message an admin if anything needs to change after that.",
  },
  {
    id: "scheduled-game-card",
    path: "/matchday",
    selector: '[data-tour-id="scheduled-game-card"]',
    title: "A scheduled game",
    description: "Its status color shows whether check-in is open, closing soon, full, or closed. Tap the count to see who's in.",
  },
  {
    id: "nav-rules",
    path: "/rules",
    selector: '[data-tour-id="nav-rules"]',
    title: "Rules",
    description: "In-app league rules — no more digging through old email threads.",
  },
  {
    id: "nav-chat",
    path: "/chat",
    selector: '[data-tour-id="nav-chat"]',
    title: "Chat",
    description: "A shared message board for the whole club.",
  },
  {
    id: "profile-menu",
    path: "/chat",
    selector: '[data-tour-id="profile-menu"]',
    title: "Profile",
    description: "Your account menu — Settings, and logging in or out, live here.",
  },
  {
    id: "settings-link",
    path: "/chat",
    selector: '[data-tour-id="settings-link"]',
    title: "Settings",
    description: "Change your own display name, and (for admins) manage members.",
  },
];

/**
 * The admin-only supplemental tour — never bundled into the general tour above.
 * Auto-launches (see tour-state.ts/TourGuide.tsx) the first time someone with
 * is_admin=true visits after the general tour is behind them, which covers both
 * a brand-new admin account and someone promoted long after their first visit.
 */
export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    id: "admin-members-link",
    path: "/settings",
    selector: '[data-tour-id="members-link"]',
    title: "Members",
    description:
      "Promote or demote admins, remove or restore members, and set each member's roster name — the name used in game reports and the live draft, separate from their own private display name.",
  },
  {
    id: "admin-import-report",
    path: "/matches",
    selector: '[data-tour-id="import-report-link"]',
    title: "Import a report",
    description: "Paste a full match report thread here to record its score, roster, goals, and MVP.",
  },
  {
    id: "admin-add-game",
    path: "/matchday",
    selector: '[data-tour-id="add-game-link"]',
    title: "Add a game",
    description: "Schedule a one-off game outside the normal recurring schedule.",
  },
  {
    id: "admin-start-draft",
    path: "/matchday",
    selector: '[data-tour-id="scheduled-game-card"]',
    title: "Starting the draft",
    description:
      "Open a specific game after its registration closes and you'll see a Start Draft button there, to run the live snake draft for that game.",
  },
];
