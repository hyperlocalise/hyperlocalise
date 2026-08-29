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
import type { ApiAuthContext } from "@/api/auth/workos";
import type { ProjectFileContentEditorQueueFilter } from "@/api/routes/project/project.schema";
import { getOrganizationJobById } from "@/lib/projects/jobs/organization-job-query-service";
import {
  parseJobContentEditorQueueFilterParam,
  resolveDefaultJobContentEditorQueueFilter,
  type JobContentEditorQueueFilterContext,
} from "@/lib/projects/job-content-editor-routing";
import { getTmsProviderLiveJobDetail } from "@/lib/providers/jobs/tms-provider-live";
import { parseProviderJobId } from "@/lib/providers/jobs/tms-provider-resource-id";

const JOB_CAT_QUEUE_FILTER_FALLBACK: ProjectFileContentEditorQueueFilter = "untranslated";

async function loadJobContentEditorQueueFilterContext(
  auth: ApiAuthContext,
  jobId: string,
): Promise<JobContentEditorQueueFilterContext | null> {
  try {
    if (parseProviderJobId(jobId)) {
      const job = await getTmsProviderLiveJobDetail(auth.organization.localOrganizationId, jobId, {
        actorUserId: auth.user.localUserId,
      });

      return job ? { kind: job.kind, status: job.status } : null;
    }

    const job = await getOrganizationJobById(auth, jobId);
    return job ? { kind: job.kind, status: job.status } : null;
  } catch {
    return null;
  }
}

export async function resolveJobContentEditorInitialQueueFilter(input: {
  auth: ApiAuthContext;
  jobId: string;
  queueFilterParam?: string;
}): Promise<ProjectFileContentEditorQueueFilter> {
  const fromParam = parseJobContentEditorQueueFilterParam(input.queueFilterParam);
  if (fromParam) {
    return fromParam;
  }

  const context = await loadJobContentEditorQueueFilterContext(input.auth, input.jobId);
  if (!context) {
    return JOB_CAT_QUEUE_FILTER_FALLBACK;
  }

  return resolveDefaultJobContentEditorQueueFilter(context);
}
