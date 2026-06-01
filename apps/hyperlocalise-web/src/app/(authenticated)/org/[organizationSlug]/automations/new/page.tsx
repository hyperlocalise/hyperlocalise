import { Suspense } from "react";

import { AutomationsNewPageContent } from "../_components/automations-new-page-content";

export default async function NewAutomationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { organizationSlug } = await params;
  const { template } = await searchParams;

  return (
    <Suspense fallback={null}>
      <AutomationsNewPageContent organizationSlug={organizationSlug} templateId={template} />
    </Suspense>
  );
}
