import { requireAdmin } from "@/lib/auth/session";
import { OneOffGameForm } from "../../_components/OneOffGameForm";

export const dynamic = "force-dynamic";

export default async function NewGamePage() {
  await requireAdmin("/matchday");

  return (
    <main>
      <a href="/matchday" className="back-link">
        ← Back to matchday
      </a>
      <header className="screen-header-row">
        <h1 className="screen-header">Add One-Off Game</h1>
      </header>
      <p className="note">
        For a holiday weekday game or any other one-time change to the regular schedule.
      </p>

      <section className="card">
        <OneOffGameForm />
      </section>
    </main>
  );
}
