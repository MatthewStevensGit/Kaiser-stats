import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BottomNav } from "./_components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaiser Stats",
  description: "Stats engine for a recurring pickup soccer league",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="demo-banner" role="note">
          <span aria-hidden="true">●</span>
          <span>
            Demo mode: every number on this site is fake, made-up sample data — not
            Vadim&apos;s real Kaiser league. See the <a href="/rules">rulebook</a> for how the
            real thing works.
          </span>
        </div>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
