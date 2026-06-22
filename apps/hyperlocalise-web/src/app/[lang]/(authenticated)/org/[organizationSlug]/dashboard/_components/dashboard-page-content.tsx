"use client";

import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { WORKSPACE_FEATURE_UNAVAILABLE_REASON } from "@/lib/flags/workos-flag-entities";
import { TmsDashboardSummarySection } from "./tms-dashboard-summary-section";

export function DashboardPageContent({ organizationSlug }: { organizationSlug: string }) {
  const searchParams = useSearchParams();
  const handledFeatureUnavailableRef = useRef(false);

  useEffect(() => {
    if (
      searchParams.get("reason") !== WORKSPACE_FEATURE_UNAVAILABLE_REASON ||
      handledFeatureUnavailableRef.current
    ) {
      return;
    }

    handledFeatureUnavailableRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("reason");
    window.history.replaceState(null, "", url.toString());

    toast.error("This feature is not available for your workspace yet.");
  }, [searchParams]);

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={DashboardSquare01Icon}
        label="Workspace"
        title="Overview"
        description="Overview of your workspace"
      />
      <TmsDashboardSummarySection organizationSlug={organizationSlug} />
    </WorkspacePageShell>
  );
}
