import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { OnboardingForm } from "../_components/OnboardingForm";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ newSignup?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.onboardingCompleted) redirect("/");

  const { newSignup } = await searchParams;

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Welcome</h1>
      </header>

      <p className="note">
        Before you get started, set your display name and your roster name — both are
        required.
      </p>

      <div className="card">
        <OnboardingForm
          initialName={user.displayName}
          email={user.email}
          skipPassword={newSignup === "1"}
        />
      </div>
    </main>
  );
}
