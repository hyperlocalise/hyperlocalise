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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

type ToolAttemptRow = {
  id: string;
  runId: string;
  organizationId: string;
  toolCallId: string;
  toolName: string;
  status: "started" | "succeeded" | "failed";
  output: Record<string, unknown> | null;
  error: string | null;
};

const { attempts } = vi.hoisted(() => ({
  attempts: [] as ToolAttemptRow[],
}));

function attemptKey(runId: string, toolCallId: string) {
  return `${runId}:${toolCallId}`;
}

vi.mock("@/lib/database/client", async () => {
  const schema = await import("@/lib/database/schema");

  return {
    schema,
    db: {
      insert: () => ({
        values: (values: Omit<ToolAttemptRow, "id" | "output" | "error">) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              const exists = attempts.some(
                (row) =>
                  attemptKey(row.runId, row.toolCallId) ===
                  attemptKey(values.runId, values.toolCallId),
              );
              if (exists) {
                return [];
              }

              const row: ToolAttemptRow = {
                ...values,
                id: crypto.randomUUID(),
                output: null,
                error: null,
              };
              attempts.push(row);
              return [{ id: row.id }];
            },
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              attempts.slice(-1).map((row) => ({
                status: row.status,
                output: row.output,
                error: row.error,
              })),
          }),
        }),
      }),
      update: () => ({
        set: (values: Partial<Pick<ToolAttemptRow, "status" | "output" | "error">>) => ({
          where: async () => {
            const row = attempts.at(-1);
            if (row) {
              Object.assign(row, values);
            }
          },
        }),
      }),
    },
  };
});

import {
  claimWorkspaceAutomationToolAttempt,
  settleWorkspaceAutomationToolAttempt,
} from "./workspace-automation-tool-attempts";

beforeEach(() => {
  attempts.splice(0);
});

describe("workspace automation tool attempts", () => {
  it("claims a tool call once and treats an in-flight replay as in_doubt", async () => {
    const input = {
      runId: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
      toolCallId: "call_slack_1",
      toolName: "send_slack_message",
    };

    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({ kind: "claimed" });
    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({ kind: "in_doubt" });
  });

  it("replays a settled success instead of running the tool again", async () => {
    const input = {
      runId: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
      toolCallId: "call_email_1",
      toolName: "send_email",
    };

    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({ kind: "claimed" });
    await settleWorkspaceAutomationToolAttempt({
      runId: input.runId,
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
    const input = {
      runId: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
      toolCallId: "call_github_1",
      toolName: "create_github_issue",
    };

    await expect(claimWorkspaceAutomationToolAttempt(input)).resolves.toEqual({ kind: "claimed" });
    await settleWorkspaceAutomationToolAttempt({
      runId: input.runId,
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
