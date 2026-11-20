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
import { canAccessProject } from "@/api/auth/team-access";
import { isInVendorTeam, vendorHomePath } from "@/api/auth/vendor-access";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
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
  const isVendor = isInVendorTeam(auth);
  // A person is here through the project's team, as before, or only through a task they own:
  // a vendor always, anyone else when the project is outside their teams. A task owner gets
  // the task's details, Open Editor and Mark done, and none of the page's other controls,
  // which all go through the team. (A provider project is not asked about: only native
  // projects have such tasks, and asking would call the provider on every page load.)
  let taskOwnerOnly = false;
  if (
    isVendor ||
    (!parseProviderProjectId(projectId) && !(await canAccessProject(auth, projectId)))
  ) {
    const task = await findOwnedFileTask({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      jobId,
      includeWaiting: true,
    });
    taskOwnerOnly = Boolean(task && task.projectId === projectId);
    if (isVendor && !taskOwnerOnly) {
      redirect(vendorHomePath(organizationSlug));
    }
  }
  const mayWorkOnJobs = hasCapability(auth.membership.role, "jobs:write");
  const canEditJobFields = mayWorkOnJobs && !taskOwnerOnly;
  // A vendor finishes only their own tasks, whatever their role.
  const canMarkAnyTaskDone = !isVendor && hasCapability(auth.membership.role, "reviews:approve");
  const canEditSharedCredentialProviderJobFields = isWorkspaceOperatorRole(auth.membership.role);

  return (
    <JobDetailPageContent
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      canEditJobFields={canEditJobFields}
      canMarkAnyTaskDone={canMarkAnyTaskDone}
      taskOwnerOnly={taskOwnerOnly}
      canMarkOwnTaskDone={mayWorkOnJobs}
      currentUserId={auth.user.localUserId}
      canEditSharedCredentialProviderJobFields={canEditSharedCredentialProviderJobFields}
    />
  );
}
