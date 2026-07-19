import { requireAdmin } from "@/lib/auth/session";
import { BackLink } from "../../_components/BackLink";
import { ReportImportForm } from "../../_components/ReportImportForm";

export const dynamic = "force-dynamic";

export default async function ImportReportPage() {
  const admin = await requireAdmin("/matches");

  return (
    <main>
      <BackLink fallbackHref="/matches" />
      <header className="screen-header-row">
        <h1 className="screen-header">Import Match Report</h1>
      </header>
      <p className="note">
        Paste a report email thread (including replies) to extract goals, MVP, and notable
        mentions, then review before saving.
      </p>

      <section className="card">
        <ReportImportForm currentUserCanonicalId={admin.canonicalId} />
      </section>
    </main>
  );
}
