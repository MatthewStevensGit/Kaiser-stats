import { requireAdmin } from "@/lib/auth/session";
import { ReportImportForm } from "../../_components/ReportImportForm";

export const dynamic = "force-dynamic";

export default async function ImportReportPage() {
  await requireAdmin("/matches");

  return (
    <main>
      <a href="/matches" className="back-link">
        ← Back to past matches
      </a>
      <header className="screen-header-row">
        <h1 className="screen-header">Import Match Report</h1>
      </header>
      <p className="note">
        Paste a report email thread (including replies) to extract goals, MVP, and notable
        mentions, then review before saving.
      </p>

      <section className="card">
        <ReportImportForm />
      </section>
    </main>
  );
}
