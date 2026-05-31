"use client";

import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { TmsDashboardSummarySection } from "./tms-dashboard-summary-section";

export function DashboardPageContent({ organizationSlug }: { organizationSlug: string }) {
  return (
    <WorkspacePageShell>
      <PageHeader
        icon={DashboardSquare01Icon}
        label="Workspace"
        title="Overview"
        description="TMS connectivity, sync health, and locale readiness across your workspace."
      />
      <TmsDashboardSummarySection organizationSlug={organizationSlug} />
    </WorkspacePageShell>
  );
}
