import { hasCapability } from "@/api/auth/policy";
import { GuidelineDocumentDetailContent } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/knowledge/_components/guideline-document-detail-content";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import {
  getWorkspaceFeatureFlagEnabled,
  workspaceKnowledgeFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "projectGuideline");
}

export default function ProjectGuidelineDocumentPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; documentId: string }>;
}) {
  return <ProjectGuidelineDocumentLoader params={params} />;
}

async function ProjectGuidelineDocumentLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; documentId: string }>;
}) {
  const { organizationSlug, projectId, documentId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const knowledgeEnabled = await getWorkspaceFeatureFlagEnabled(workspaceKnowledgeFlag, auth);

  if (!knowledgeEnabled) {
    return <FeatureTeaserPage feature="guideline" scope="project" />;
  }

  return (
    <GuidelineDocumentDetailContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      documentId={documentId}
      canUpdate={hasCapability(auth.membership.role, "workspace:update")}
    />
  );
}
