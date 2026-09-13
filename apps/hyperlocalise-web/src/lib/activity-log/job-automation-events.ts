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
import "server-only";

import {
  PRODUCT_USAGE_ANALYTICS_EVENTS,
  productUsageJobFeature,
  productUsageSourceForActorKind,
} from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";

import type { ActivityActorKind } from "./activity-log-contract";
import { enqueueActivityLogEvent } from "./activity-log-writer";

type ActivityActor = {
  actorCredentialId: string | null;
  actorKind: ActivityActorKind;
  actorUserId: string | null;
};

function activityActor(input: ActivityActor) {
  return {
    actorCredentialId: input.actorCredentialId,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId,
  };
}

type JobActivityInput = ActivityActor & {
  jobId: string;
  kind: string;
  organizationId: string;
  projectId?: string | null;
  status: string;
};

function jobPayload<Status extends string>(input: JobActivityInput & { status: Status }) {
  return {
    jobId: input.jobId,
    kind: input.kind,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    status: input.status,
  };
}

export function stableJobFailureCode(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(value)) {
    return "unknown_error";
  }
  return value;
}

export async function enqueueJobCreatedActivity(input: JobActivityInput) {
  serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.jobCreated, {
    feature: productUsageJobFeature(input.kind),
    source: productUsageSourceForActorKind(input.actorKind),
  });
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "job_created",
    organizationId: input.organizationId,
    payload: jobPayload(input),
    targetId: input.jobId,
    targetKind: "job",
  });
}

export async function enqueueJobCancelledActivity(
  input: Omit<JobActivityInput, "status"> & { status: "cancelled" },
) {
  serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.jobCancelled, {
    feature: productUsageJobFeature(input.kind),
    source: productUsageSourceForActorKind(input.actorKind),
  });
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "job_cancelled",
    organizationId: input.organizationId,
    payload: jobPayload(input),
    targetId: input.jobId,
    targetKind: "job",
  });
}

export async function enqueueJobFailedActivity(
  input: Omit<JobActivityInput, "status"> & { errorCode: string; status: "failed" },
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "job_failed",
    organizationId: input.organizationId,
    payload: {
      ...jobPayload(input),
      errorCode: stableJobFailureCode(input.errorCode),
    },
    targetId: input.jobId,
    targetKind: "job",
  });
}

type AutomationActivityInput = ActivityActor & {
  automationId: string;
  name: string;
  organizationId: string;
};

export async function enqueueAutomationRunStartedActivity(
  input: AutomationActivityInput & { runId: string; triggerSource: string },
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "automation_run_started",
    organizationId: input.organizationId,
    payload: {
      automationId: input.automationId,
      name: input.name,
      runId: input.runId,
      status: "running",
      triggerSource: input.triggerSource,
    },
    targetId: input.automationId,
    targetKind: "automation",
  });
}

export async function enqueueAutomationStatusActivity(
  input: AutomationActivityInput & { status: "active" | "archived" | "paused" },
) {
  if (input.status === "active") {
    return enqueueActivityLogEvent({
      ...activityActor(input),
      eventType: "automation_enabled",
      organizationId: input.organizationId,
      payload: {
        automationId: input.automationId,
        name: input.name,
        status: input.status,
      },
      targetId: input.automationId,
      targetKind: "automation",
    });
  }

  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "automation_disabled",
    organizationId: input.organizationId,
    payload: {
      automationId: input.automationId,
      name: input.name,
      status: input.status,
    },
    targetId: input.automationId,
    targetKind: "automation",
  });
}
