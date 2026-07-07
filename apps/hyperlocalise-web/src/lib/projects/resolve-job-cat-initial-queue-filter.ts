import type { ApiAuthContext } from "@/api/auth/workos";
import type { ProjectFileCatQueueFilter } from "@/api/routes/project/project.schema";
import { getOrganizationJobById } from "@/lib/projects/jobs/organization-job-query-service";
import {
  parseJobCatQueueFilterParam,
  resolveDefaultJobCatQueueFilter,
  type JobCatQueueFilterContext,
} from "@/lib/projects/job-cat-routing";
import { getTmsProviderLiveJobDetail } from "@/lib/providers/jobs/tms-provider-live";
import { parseProviderJobId } from "@/lib/providers/jobs/tms-provider-resource-id";

const JOB_CAT_QUEUE_FILTER_FALLBACK: ProjectFileCatQueueFilter = "untranslated";

async function loadJobCatQueueFilterContext(
  auth: ApiAuthContext,
  jobId: string,
): Promise<JobCatQueueFilterContext | null> {
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

export async function resolveJobCatInitialQueueFilter(input: {
  auth: ApiAuthContext;
  jobId: string;
  queueFilterParam?: string;
}): Promise<ProjectFileCatQueueFilter> {
  const fromParam = parseJobCatQueueFilterParam(input.queueFilterParam);
  if (fromParam) {
    return fromParam;
  }

  const context = await loadJobCatQueueFilterContext(input.auth, input.jobId);
  if (!context) {
    return JOB_CAT_QUEUE_FILTER_FALLBACK;
  }

  return resolveDefaultJobCatQueueFilter(context);
}
