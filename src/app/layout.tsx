import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomNav } from "./_components/BottomNav";
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
        {children}
        <BottomNav displayName={user?.displayName} />
      </body>
    </html>
  );
}
