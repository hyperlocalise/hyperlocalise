import { redirect } from "next/navigation";

import { hasCapability } from "@/api/auth/policy";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { buildOrganizationPath } from "@/components/app-shell/navigation-config";
import {
  getWorkspaceFeatureFlagEnabled,
  workspaceKnowledgeFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { GuidelineUploadContent } from "./_components/guideline-upload-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "guideline");
}

export default function GuidelineUploadPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return <GuidelineUploadLoader params={params} />;
}

async function GuidelineUploadLoader({
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

  if (!hasCapability(auth.membership.role, "workspace:update")) {
    redirect(buildOrganizationPath(organizationSlug, "knowledge"));
  }

  return (
    <GuidelineUploadContent
      organizationSlug={organizationSlug}
      backHref={buildOrganizationPath(organizationSlug, "knowledge")}
    />
  );
}
