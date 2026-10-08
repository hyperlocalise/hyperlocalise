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
import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";

import {
  claimWorkspaceAutomationToolAttempt,
  settleWorkspaceAutomationToolAttempt,
} from "./workspace-automation-tool-attempts";

const organizationIds: string[] = [];

async function seedToolAttemptRun() {
  const organizationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `tool-attempt-${organizationId.slice(0, 8)}`,
    name: "Tool Attempt Test Org",
  });
  await db.insert(schema.users).values({
    id: userId,
    workosUserId: `user_${userId}`,
    email: `${userId}@example.test`,
  });
  const [automation] = await db
    .insert(schema.workspaceAutomations)
    .values({
      organizationId,
      authorUserId: userId,
      status: "active",
      name: "Ledger",
      instructions: "Run once.",
      triggerConfig: { mode: "manual" },
    })
    .returning({ id: schema.workspaceAutomations.id });
  if (!automation) {
    throw new Error("failed to seed workspace automation");
  }
  const [run] = await db
    .insert(schema.workspaceAutomationRuns)
    .values({
      automationId: automation.id,
      organizationId,
      triggerSource: "manual",
      status: "running",
    })
    .returning({ id: schema.workspaceAutomationRuns.id });
  if (!run) {
    throw new Error("failed to seed workspace automation run");
  }

  return { organizationId, runId: run.id };
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  for (const organizationId of organizationIds.splice(0)) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
  }
});

describe("workspace automation tool attempts", () => {
  it("claims a tool call once and treats an in-flight replay as in_doubt", async () => {
    const { organizationId, runId } = await seedToolAttemptRun();
    const input = {
      runId,
      organizationId,
      toolCallId: "call_slack_1",
      toolName: "send_slack_message",
    };

    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({ kind: "claimed" });
    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({ kind: "in_doubt" });
  });

  it("replays a settled success instead of running the tool again", async () => {
    const { organizationId, runId } = await seedToolAttemptRun();
    const input = {
      runId,
      organizationId,
      toolCallId: "call_email_1",
      toolName: "send_email",
    };

    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({ kind: "claimed" });
    await settleWorkspaceAutomationToolAttempt({
      runId,
      toolCallId: input.toolCallId,
      status: "succeeded",
      output: { messageId: "msg_1" },
    });

    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({
      kind: "succeeded",
      output: { messageId: "msg_1" },
    });
  });

  it("replays a settled failure and falls back to a tool-name error", async () => {
    const { organizationId, runId } = await seedToolAttemptRun();
    const input = {
      runId,
      organizationId,
      toolCallId: "call_github_1",
      toolName: "create_github_issue",
    };

    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({ kind: "claimed" });
    await settleWorkspaceAutomationToolAttempt({
      runId,
      toolCallId: input.toolCallId,
      status: "failed",
      output: { attempted: true },
    });

    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({
      kind: "failed",
      error: "create_github_issue_failed",
      output: { attempted: true },
    });
  });
});
