"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const EXEMPT_PATHS = ["/onboarding", "/login"];

/**
 * Bounces a logged-in-but-not-yet-onboarded user to /onboarding from
 * anywhere else in the app. Client-side rather than Next.js middleware —
 * this app has no middleware.ts today, and the login page already controls
 * its own post-verify redirect the same way (see login/page.tsx), so this
 * just extends that pattern to every other page instead of adding a new,
 * riskier Supabase-SSR-in-middleware auth path.
 */
export function OnboardingGate({ needsOnboarding }: { needsOnboarding: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (needsOnboarding && !EXEMPT_PATHS.includes(pathname)) {
      router.push("/onboarding");
    }
  }, [needsOnboarding, pathname, router]);

  return null;
}
