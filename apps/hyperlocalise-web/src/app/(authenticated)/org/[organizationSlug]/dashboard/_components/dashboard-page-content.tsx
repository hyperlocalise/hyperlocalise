"use client";

import { TmsDashboardSummarySection } from "./tms-dashboard-summary-section";

export function DashboardPageContent({ organizationSlug }: { organizationSlug: string }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <TmsDashboardSummarySection organizationSlug={organizationSlug} />
    </div>
  );
}
