import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import type { ProviderWebhookReconciliationQueue } from "@/lib/workflow/types";

import {
  checkExternalTmsProviderHealth,
  persistExternalTmsProviderHealth,
} from "./external-tms-health-check";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import type { ProviderSyncIntentKind } from "./provider-sync-intent-kinds";
import { enqueueProviderSyncIntent } from "./provider-sync-intents";
import {
  DEFAULT_SCHEDULED_RECONCILIATION_CONFIG,
  resolveDueSchedules,
  type ScheduledReconciliationConfig,
  type ScheduledReconciliationSchedule,
} from "./provider-scheduled-reconciliation-config";
import { auditProviderWebhookSubscriptions } from "./provider-webhook-subscription-manager";

const logger = createLogger("tms-scheduled-reconciliation");

const ELIGIBLE_CREDENTIAL_STATUSES = ["connected", "degraded"] as const;

export type ScheduledReconciliationCredential = {
  id: string;
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  validationStatus: string;
};

export type ScheduledReconciliationProject = {
  id: string;
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
};

export type ScheduledReconciliationEnqueueResult = {
  schedule: ScheduledReconciliationSchedule;
  intentsEnqueued: number;
  intentsCoalesced: number;
  intentsSkipped: number;
  credentialsSkipped: number;
  projectsSkipped: number;
  auditsCompleted: number;
  healthChecksCompleted: number;
};

export type RunScheduledReconciliationInput = {
  now?: Date;
  config?: ScheduledReconciliationConfig;
  forceSchedule?: ScheduledReconciliationSchedule;
  queue: ProviderWebhookReconciliationQueue;
  listCredentials?: () => Promise<ScheduledReconciliationCredential[]>;
  listProjects?: () => Promise<ScheduledReconciliationProject[]>;
};

export function shouldIncludeCredentialForScheduledReconciliation(
  validationStatus: string,
): validationStatus is (typeof ELIGIBLE_CREDENTIAL_STATUSES)[number] {
  return (ELIGIBLE_CREDENTIAL_STATUSES as readonly string[]).includes(validationStatus);
}

export function syncKindsForSchedule(
  schedule: ScheduledReconciliationSchedule,
): ProviderSyncIntentKind[] {
  switch (schedule) {
    case "incremental":
      return ["file_key_scan", "job_task_scan"];
    case "resource_import":
      return ["tm_scan", "glossary_scan"];
    case "full":
      return ["project_scan", "file_key_scan", "job_task_scan", "tm_scan", "glossary_scan"];
    case "audit":
      return [];
  }
}

export async function listScheduledReconciliationCredentials(): Promise<
  ScheduledReconciliationCredential[]
> {
  const credentials = await db
    .select({
      id: schema.organizationExternalTmsProviderCredentials.id,
      organizationId: schema.organizationExternalTmsProviderCredentials.organizationId,
      providerKind: schema.organizationExternalTmsProviderCredentials.providerKind,
      validationStatus: schema.organizationExternalTmsProviderCredentials.validationStatus,
    })
    .from(schema.organizationExternalTmsProviderCredentials);

  return credentials.map((credential) => ({
    id: credential.id,
    organizationId: credential.organizationId,
    providerKind: credential.providerKind as ExternalTmsProviderKind,
    validationStatus: credential.validationStatus,
  }));
}

export async function listScheduledReconciliationProjects(): Promise<
  ScheduledReconciliationProject[]
> {
  const projects = await db
    .select({
      id: schema.projects.id,
      organizationId: schema.projects.organizationId,
      providerKind: schema.projects.externalProviderKind,
      providerCredentialId: schema.projects.externalProviderCredentialId,
      validationStatus: schema.organizationExternalTmsProviderCredentials.validationStatus,
    })
    .from(schema.projects)
    .innerJoin(
      schema.organizationExternalTmsProviderCredentials,
      eq(
        schema.projects.externalProviderCredentialId,
        schema.organizationExternalTmsProviderCredentials.id,
      ),
    )
    .where(
      and(
        eq(schema.projects.source, "external_tms"),
        eq(schema.projects.isActive, true),
        isNotNull(schema.projects.externalProviderCredentialId),
        isNotNull(schema.projects.externalProviderKind),
        inArray(schema.organizationExternalTmsProviderCredentials.validationStatus, [
          ...ELIGIBLE_CREDENTIAL_STATUSES,
        ]),
      ),
    );

  return projects.flatMap((project) => {
    if (!project.providerCredentialId || !project.providerKind) {
      return [];
    }

    return [
      {
        id: project.id,
        organizationId: project.organizationId,
        providerKind: project.providerKind as ExternalTmsProviderKind,
        providerCredentialId: project.providerCredentialId,
      },
    ];
  });
}

async function enqueueScheduledSyncIntent(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId?: string | null;
  syncKind: ProviderSyncIntentKind;
  queue: ProviderWebhookReconciliationQueue;
}) {
  const { intent, coalesced } = await enqueueProviderSyncIntent({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    providerCredentialId: input.providerCredentialId,
    projectId: input.projectId,
    syncKind: input.syncKind,
    cause: "scheduled",
    eventReferences: [],
  });

  await input.queue.enqueue({
    providerWebhookEventId: "",
    providerSyncIntentId: intent.id,
    organizationId: input.organizationId,
    subscriptionId: "",
    providerKind: input.providerKind,
  });

  return { coalesced };
}

async function runAuditSchedule(credentials: ScheduledReconciliationCredential[]) {
  let auditsCompleted = 0;
  let healthChecksCompleted = 0;

  for (const credential of credentials) {
    if (!shouldIncludeCredentialForScheduledReconciliation(credential.validationStatus)) {
      continue;
    }

    try {
      const { credential: credentialRow, health } = await checkExternalTmsProviderHealth({
        organizationId: credential.organizationId,
        providerKind: credential.providerKind,
      });

      if (credentialRow && health) {
        await persistExternalTmsProviderHealth({
          credentialId: credentialRow.id,
          health,
        });
        healthChecksCompleted += 1;
      }
    } catch (error) {
      logger.warn(
        {
          organizationId: credential.organizationId,
          providerCredentialId: credential.id,
          providerKind: credential.providerKind,
          errorCode:
            error instanceof Error ? error.message : "scheduled_provider_health_check_failed",
        },
        "scheduled provider health check failed",
      );
    }

    try {
      const auditResults = await auditProviderWebhookSubscriptions({
        organizationId: credential.organizationId,
      });
      auditsCompleted += auditResults.length;
    } catch (error) {
      logger.warn(
        {
          organizationId: credential.organizationId,
          providerCredentialId: credential.id,
          providerKind: credential.providerKind,
          errorCode: error instanceof Error ? error.message : "scheduled_webhook_audit_failed",
        },
        "scheduled webhook subscription audit failed",
      );
    }
  }

  return { auditsCompleted, healthChecksCompleted };
}

export async function runScheduledReconciliation(
  input: RunScheduledReconciliationInput,
): Promise<ScheduledReconciliationEnqueueResult[]> {
  const now = input.now ?? new Date();
  const config = input.config ?? DEFAULT_SCHEDULED_RECONCILIATION_CONFIG;
  const schedules = resolveDueSchedules({
    now,
    config,
    forceSchedule: input.forceSchedule,
  });

  if (schedules.length === 0) {
    return [];
  }

  const credentials =
    (await input.listCredentials?.()) ?? (await listScheduledReconciliationCredentials());
  const projects = (await input.listProjects?.()) ?? (await listScheduledReconciliationProjects());

  const eligibleCredentials = credentials.filter((credential) =>
    shouldIncludeCredentialForScheduledReconciliation(credential.validationStatus),
  );
  const credentialsSkipped = credentials.length - eligibleCredentials.length;

  const results: ScheduledReconciliationEnqueueResult[] = [];

  for (const schedule of schedules) {
    if (schedule === "audit") {
      const auditCounts = await runAuditSchedule(eligibleCredentials);
      results.push({
        schedule,
        intentsEnqueued: 0,
        intentsCoalesced: 0,
        intentsSkipped: 0,
        credentialsSkipped,
        projectsSkipped: 0,
        ...auditCounts,
      });
      continue;
    }

    const syncKinds = syncKindsForSchedule(schedule);
    let intentsEnqueued = 0;
    let intentsCoalesced = 0;
    let intentsSkipped = 0;
    let remainingBudget = config.maxIntentsPerTick;

    if (syncKinds.includes("project_scan")) {
      for (const credential of eligibleCredentials) {
        if (remainingBudget <= 0) {
          intentsSkipped += 1;
          continue;
        }

        const result = await enqueueScheduledSyncIntent({
          organizationId: credential.organizationId,
          providerKind: credential.providerKind,
          providerCredentialId: credential.id,
          syncKind: "project_scan",
          queue: input.queue,
        });

        remainingBudget -= 1;
        if (result.coalesced) {
          intentsCoalesced += 1;
        } else {
          intentsEnqueued += 1;
        }
      }
    }

    const projectSyncKinds = syncKinds.filter((kind) => kind !== "project_scan");

    for (const project of projects) {
      for (const syncKind of projectSyncKinds) {
        if (remainingBudget <= 0) {
          intentsSkipped += 1;
          continue;
        }

        const result = await enqueueScheduledSyncIntent({
          organizationId: project.organizationId,
          providerKind: project.providerKind,
          providerCredentialId: project.providerCredentialId,
          projectId: project.id,
          syncKind,
          queue: input.queue,
        });

        remainingBudget -= 1;
        if (result.coalesced) {
          intentsCoalesced += 1;
        } else {
          intentsEnqueued += 1;
        }
      }
    }

    logger.info(
      {
        schedule,
        intentsEnqueued,
        intentsCoalesced,
        intentsSkipped,
        credentialsSkipped,
        eligibleCredentialCount: eligibleCredentials.length,
        projectCount: projects.length,
      },
      "scheduled TMS reconciliation tick completed",
    );

    results.push({
      schedule,
      intentsEnqueued,
      intentsCoalesced,
      intentsSkipped,
      credentialsSkipped,
      projectsSkipped: 0,
      auditsCompleted: 0,
      healthChecksCompleted: 0,
    });
  }

  return results;
}
