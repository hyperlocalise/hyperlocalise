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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

export type WorkspaceAutomationToolAttemptClaim =
  | { kind: "claimed" }
  | { kind: "succeeded"; output: Record<string, unknown> }
  | { kind: "failed"; error: string; output: Record<string, unknown> | null }
  /** A previous attempt started but never recorded an outcome (its function was killed). */
  | { kind: "in_doubt" };

/**
 * Claim a tool call before running it. Only the first claim for a `(runId, toolCallId)` pair
 * proceeds; later claims see the recorded outcome instead.
 */
export async function claimWorkspaceAutomationToolAttempt(input: {
  runId: string;
  organizationId: string;
  toolCallId: string;
  toolName: string;
}): Promise<WorkspaceAutomationToolAttemptClaim> {
  const [inserted] = await db
    .insert(schema.workspaceAutomationToolAttempts)
    .values({
      runId: input.runId,
      organizationId: input.organizationId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      status: "started",
    })
    .onConflictDoNothing({
      target: [
        schema.workspaceAutomationToolAttempts.runId,
        schema.workspaceAutomationToolAttempts.toolCallId,
      ],
    })
    .returning({ id: schema.workspaceAutomationToolAttempts.id });

  if (inserted) {
    return { kind: "claimed" };
  }

  const [existing] = await db
    .select({
      status: schema.workspaceAutomationToolAttempts.status,
      output: schema.workspaceAutomationToolAttempts.output,
      error: schema.workspaceAutomationToolAttempts.error,
    })
    .from(schema.workspaceAutomationToolAttempts)
    .where(
      and(
        eq(schema.workspaceAutomationToolAttempts.runId, input.runId),
        eq(schema.workspaceAutomationToolAttempts.toolCallId, input.toolCallId),
      ),
    )
    .limit(1);

  if (existing?.status === "succeeded") {
    return { kind: "succeeded", output: existing.output ?? {} };
  }
  if (existing?.status === "failed") {
    return {
      kind: "failed",
      error: existing.error ?? `${input.toolName}_failed`,
      output: existing.output,
    };
  }
  return { kind: "in_doubt" };
}

export async function settleWorkspaceAutomationToolAttempt(input: {
  runId: string;
  toolCallId: string;
  status: "succeeded" | "failed";
  output: Record<string, unknown>;
  error?: string;
}) {
  await db
    .update(schema.workspaceAutomationToolAttempts)
    .set({ status: input.status, output: input.output, error: input.error ?? null })
    .where(
      and(
        eq(schema.workspaceAutomationToolAttempts.runId, input.runId),
        eq(schema.workspaceAutomationToolAttempts.toolCallId, input.toolCallId),
      ),
    );
}
