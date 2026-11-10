import { redirect } from "next/navigation";

import { hasCapability } from "@/api/auth/policy";
import { GuidelineUploadContent } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/knowledge/upload/_components/guideline-upload-content";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { buildProjectPath } from "@/components/app-shell/navigation-config";
import {
  getWorkspaceFeatureFlagEnabled,
  workspaceKnowledgeFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "projectGuideline");
}

export default function ProjectGuidelineUploadPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  return <ProjectGuidelineUploadLoader params={params} />;
}

async function ProjectGuidelineUploadLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const knowledgeEnabled = await getWorkspaceFeatureFlagEnabled(workspaceKnowledgeFlag, auth);

  if (!knowledgeEnabled) {
    return <FeatureTeaserPage feature="guideline" scope="project" />;
  }

  if (!hasCapability(auth.membership.role, "workspace:update")) {
    redirect(buildProjectPath(organizationSlug, projectId, "knowledge"));
  }

  return (
    <GuidelineUploadContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      backHref={buildProjectPath(organizationSlug, projectId, "knowledge")}
    />
  );
}
