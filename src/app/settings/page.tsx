import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
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
        <SettingsForm displayName={user.displayName} email={user.email} />
      </div>
    </main>
  );
}
