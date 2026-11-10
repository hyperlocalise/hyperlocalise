import { hasCapability } from "@/api/auth/policy";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import {
  getWorkspaceFeatureFlagEnabled,
  workspaceKnowledgeFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { GuidelineAssignmentsContent } from "./_components/guideline-assignments-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "guideline");
}

export default function GuidelineAssignmentsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return <GuidelineAssignmentsLoader params={params} />;
}

async function GuidelineAssignmentsLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const knowledgeEnabled = await getWorkspaceFeatureFlagEnabled(workspaceKnowledgeFlag, auth);

  if (!knowledgeEnabled) {
    return <FeatureTeaserPage feature="guideline" scope="workspace" />;
  }

  return (
    <GuidelineAssignmentsContent
      organizationSlug={organizationSlug}
      canUpdate={hasCapability(auth.membership.role, "workspace:update")}
    />
  );
}
