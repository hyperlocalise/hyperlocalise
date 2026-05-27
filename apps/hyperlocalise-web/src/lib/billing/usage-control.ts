import { and, eq } from "drizzle-orm";

import { env } from "@/lib/env";
import type { DatabaseClient } from "@/lib/database";
import { db, schema } from "@/lib/database";

export const usageFeatureIds = {
  translationJobs: "translation_jobs",
  translationUnits: "translation_units",
  sourceCharacters: "source_characters",
  aiTokens: "ai_tokens",
  apiRequests: "api_requests",
  agentRuns: "agent_runs",
} as const;

type UsageFeatureId = (typeof usageFeatureIds)[keyof typeof usageFeatureIds];

export async function reserveUsageEvent(input: {
  db?: DatabaseClient;
  organizationId: string;
  featureId: UsageFeatureId;
  operationKey: string;
  source: string;
  quantity?: number;
  jobId?: string;
  interactionId?: string;
}) {
  const database = input.db ?? db;
  const [existing] = await database
    .select({ id: schema.usageEvents.id })
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, input.operationKey))
    .limit(1);

  if (existing) return existing;

  const [event] = await database
    .insert(schema.usageEvents)
    .values({
      organizationId: input.organizationId,
      featureId: input.featureId,
      operationKey: input.operationKey,
      source: input.source,
      quantity: input.quantity ?? 1,
      jobId: input.jobId,
      interactionId: input.interactionId,
    })
    .returning({ id: schema.usageEvents.id });

  if (!event) throw new Error("failed to reserve usage event");
  return event;
}

export async function markUsageEventSucceededByOperationKey(input: {
  db?: DatabaseClient;
  operationKey: string;
}) {
  const database = input.db ?? db;
  await database
    .update(schema.usageEvents)
    .set({ status: "succeeded", autumnTrackError: null })
    .where(eq(schema.usageEvents.operationKey, input.operationKey));
}

export async function trackUsageEventInAutumnByOperationKey(input: {
  db?: DatabaseClient;
  operationKey: string;
}) {
  const database = input.db ?? db;
  const [event] = await database
    .select()
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, input.operationKey))
    .limit(1);

  if (!event || event.status === "tracking_succeeded") return;

  if (!env.AUTUMN_API_KEY) {
    await database
      .update(schema.usageEvents)
      .set({ status: "tracking_pending", autumnTrackError: "autumn_not_configured" })
      .where(eq(schema.usageEvents.id, event.id));
    return;
  }

  await database
    .update(schema.usageEvents)
    .set({ status: "tracking_succeeded", autumnTrackedAt: new Date(), autumnTrackError: null })
    .where(and(eq(schema.usageEvents.id, event.id), eq(schema.usageEvents.status, "succeeded")));
}
