import { hasCapability } from "@/api/auth/policy";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { getAutumnWorkspaceBooleanFeatureEnabled } from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { GuidelineDocumentDetailContent } from "../_components/guideline-document-detail-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "guideline");
}

export default function GuidelineDocumentPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; documentId: string }>;
}) {
  return <GuidelineDocumentLoader params={params} />;
}

async function GuidelineDocumentLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; documentId: string }>;
}) {
  const { organizationSlug, documentId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const knowledgeEnabled = await getAutumnWorkspaceBooleanFeatureEnabled(
    autumnFeatureIds.guidelines,
    auth,
  );

  if (!knowledgeEnabled) {
    return <FeatureTeaserPage feature="guideline" scope="workspace" />;
  }

  return (
    <GuidelineDocumentDetailContent
      organizationSlug={organizationSlug}
      documentId={documentId}
      canUpdate={hasCapability(auth.membership.role, "workspace:update")}
    />
  );
}
