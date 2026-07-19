import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { OnboardingGate } from "./_components/OnboardingGate";
import { ToastProvider } from "./_components/ToastProvider";
import { TopNav } from "./_components/TopNav";
import { TourGuide } from "./_components/TourGuide";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaiser",
  description: "Stats engine for a recurring pickup soccer league",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <OnboardingGate needsOnboarding={!!user && !user.onboardingCompleted} />
        <TopNav displayName={user?.displayName} isAdmin={user?.isAdmin} />
        {user?.onboardingCompleted && <TourGuide isAdmin={user.isAdmin} />}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
