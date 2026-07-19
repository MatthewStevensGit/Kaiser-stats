import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "../_components/ChangePasswordForm";
import { LogOutButton } from "../_components/LogOutButton";
import { SettingsForm } from "../_components/SettingsForm";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Settings</h1>
      </header>

      <div className="card">
        <SettingsForm displayName={user.displayName} email={user.email} positions={user.positions} />
      </div>

      <div className="card">
        <h2>Change password</h2>
        <ChangePasswordForm email={user.email} />
      </div>

      {user.isAdmin && (
        <div className="card">
          <Link href="/settings/members" className="rulebook-link" data-tour-id="members-link">
            Members →
          </Link>
        </div>
      )}

      <div className="card">
        <LogOutButton />
      </div>
    </main>
  );
}
