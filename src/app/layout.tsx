import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { TopNav } from "./_components/TopNav";
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
        <TopNav displayName={user?.displayName} />
        {children}
      </body>
    </html>
  );
}
