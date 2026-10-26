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
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/database/client";
import { isWorkspaceReportsCaptureEnabled, reportingStart } from "./capture";

export type AiReportingUsage = {
  invocationId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  tokenCategories?: Record<string, number>;
  reportedUsd?: string;
  usageUnavailable?: boolean;
};
export async function captureAiUsage(
  input: AiReportingUsage & {
    organizationId: string;
    projectId?: string | null;
    jobId?: string | null;
    step?: string;
    targetLocale?: string;
  },
) {
  try {
    if (!(await isWorkspaceReportsCaptureEnabled(input.organizationId))) {
      return;
    }
    await reportingStart(input.organizationId);
    if (input.jobId) {
      const [external] = await db
        .select({ id: schema.externalJobDetails.jobId })
        .from(schema.externalJobDetails)
        .where(
          and(
            eq(schema.externalJobDetails.jobId, input.jobId),
            eq(schema.externalJobDetails.organizationId, input.organizationId),
          ),
        );
      if (external) return;
    }
    // Reports keeps tokens and where they were used; the money is billing's actual charge, so no
    // price is estimated here.
    const amountUsd = input.reportedUsd ?? null;
    await db
      .insert(schema.reportingCosts)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        jobId: input.jobId,
        operationKey: `ai:${input.invocationId}`,
        kind: "ai",
        step: input.step ?? "translation",
        targetLocale: input.targetLocale,
        amountUsd,
        basis: amountUsd !== null ? "reported" : "unpriced",
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        tokenCategories: input.tokenCategories,
      })
      .onConflictDoNothing();
  } catch (error) {
    console.warn("reporting_ai_usage_failed", { jobId: input.jobId, error });
  }
}
