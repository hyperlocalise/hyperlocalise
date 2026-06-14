import { Suspense } from "react";

import { AutomationDetailPageContent } from "../_components/automation-detail-page-content";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; automationId: string }>;
}) {
  const { organizationSlug, automationId } = await params;

  return (
    <Suspense fallback={null}>
      <AutomationDetailPageContent
        organizationSlug={organizationSlug}
        automationId={automationId}
      />
    </Suspense>
  );
}
