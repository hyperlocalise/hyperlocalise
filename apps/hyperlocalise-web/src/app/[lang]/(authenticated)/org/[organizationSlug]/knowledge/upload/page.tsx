/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { redirect } from "next/navigation";

import { hasCapability } from "@/api/auth/policy";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { buildOrganizationPath, buildProjectPath } from "@/components/app-shell/navigation-config";
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { getAutumnWorkspaceBooleanFeatureEnabled } from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { GuidelineUploadContent } from "./_components/guideline-upload-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "guideline");
}

export default function GuidelineUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams?: Promise<{ project?: string | string[] }>;
}) {
  return <GuidelineUploadLoader params={params} searchParams={searchParams} />;
}

async function GuidelineUploadLoader({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams?: Promise<{ project?: string | string[] }>;
}) {
  const { organizationSlug } = await params;
  const search = (await searchParams) ?? {};
  const rawProject = Array.isArray(search.project) ? search.project[0] : search.project;
  const initialProjectId = rawProject?.trim() ? rawProject.trim() : undefined;
  const auth = await requireAppAuthContext({ organizationSlug });
  const knowledgeEnabled = await getAutumnWorkspaceBooleanFeatureEnabled(
    autumnFeatureIds.guidelines,
    auth,
  );

  if (!knowledgeEnabled) {
    return <FeatureTeaserPage feature="guideline" scope="workspace" />;
  }

  if (!hasCapability(auth.membership.role, "workspace:update")) {
    redirect(buildOrganizationPath(organizationSlug, "knowledge"));
  }

  return (
    <GuidelineUploadContent
      organizationSlug={organizationSlug}
      initialProjectId={initialProjectId}
      backHref={
        initialProjectId
          ? buildProjectPath(organizationSlug, initialProjectId, "knowledge")
          : buildOrganizationPath(organizationSlug, "knowledge")
      }
    />
  );
}
