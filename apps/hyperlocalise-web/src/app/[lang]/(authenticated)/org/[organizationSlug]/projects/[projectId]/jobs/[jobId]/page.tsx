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

import { hasCapability, isWorkspaceOperatorRole } from "@/api/auth/policy";
import { isVendorRole, vendorHomePath } from "@/api/auth/vendor-access";
import { findOwnedFileTask } from "@/lib/projects/jobs/task-access";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { JobDetailPageContent } from "./_components/job-detail-page-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "projectJobDetail");
}

export default function ProjectJobDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; jobId: string }>;
}) {
  return <ProjectJobDetailPageLoader params={params} />;
}

async function ProjectJobDetailPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; jobId: string }>;
}) {
  const { organizationSlug, projectId: rawProjectId, jobId } = await params;
  const projectId = normalizeProjectId(rawProjectId);
  // Open to vendors (`vendor-access.ts`), for an open or waiting task they own.
  const auth = await requireAppAuthContext({ organizationSlug, allowVendor: true });
  if (isVendorRole(auth.membership.role)) {
    const task = await findOwnedFileTask({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      jobId,
      includeWaiting: true,
    });
    if (!task || task.projectId !== projectId) {
      redirect(vendorHomePath(organizationSlug));
    }
  }
  const canEditJobFields = hasCapability(auth.membership.role, "jobs:write");
  const canMarkAnyTaskDone = hasCapability(auth.membership.role, "reviews:approve");
  const canEditSharedCredentialProviderJobFields = isWorkspaceOperatorRole(auth.membership.role);

  return (
    <JobDetailPageContent
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      canEditJobFields={canEditJobFields}
      canMarkAnyTaskDone={canMarkAnyTaskDone}
      currentUserId={auth.user.localUserId}
      canEditSharedCredentialProviderJobFields={canEditSharedCredentialProviderJobFields}
    />
  );
}
