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
import { describe, expect, it } from "vite-plus/test";

import type { VisualWorkflowDefinition } from "../schema/types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";
import { runVisualWorkflowInterpreter } from "./interpreter";
import { shouldReuseTryCatchBodyFailure } from "./durable-execution-reuse";

function definition(): VisualWorkflowDefinition {
  return {
    schemaVersion: 2,
    name: "Try / Catch runtime",
    nodes: [
      { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
      {
        id: "boundary",
        type: "logic.try_catch",
        config: { kind: "logic.try_catch" },
        bodyNodeIds: ["work"],
      },
      { id: "work", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
      { id: "success", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
      { id: "catch", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
      { id: "finally", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
    ],
    edges: [
      {
        id: "start",
        source: "trigger",
        target: "boundary",
        sourceHandle: null,
        targetHandle: null,
      },
      { id: "try", source: "boundary", target: "work", sourceHandle: "try", targetHandle: null },
      {
        id: "success",
        source: "boundary",
        target: "success",
        sourceHandle: "success",
        targetHandle: null,
      },
      {
        id: "catch",
        source: "boundary",
        target: "catch",
        sourceHandle: "catch",
        targetHandle: null,
      },
      {
        id: "finally",
        source: "boundary",
        target: "finally",
        sourceHandle: "finally",
        targetHandle: null,
      },
    ],
    editor: { positions: {} },
  };
}

async function run(workResult: VisualWorkflowNodeExecutionResult) {
  const executed: string[] = [];
  const result = await runVisualWorkflowInterpreter({
    definition: definition(),
    organizationId: "00000000-0000-4000-8000-000000000001",
    executeNode: async ({ node }) => {
      executed.push(node.id);
      if (node.id === "work") return workResult;
      if (node.type === "trigger.manual") {
        return { ok: true, output: { triggeredAt: "2026-10-08T00:00:00.000Z" } };
      }
      return { ok: true, output: {} };
    },
  });

  return { executed, result };
}

describe("Try / Catch runtime", () => {
  it("runs Success and then Finally when the protected region succeeds", async () => {
    const { executed, result } = await run({ ok: true, output: {} });

    expect(result.ok).toBe(true);
    expect(executed).toEqual(["trigger", "boundary", "work", "success", "finally"]);
  });

  it("handles an ordinary failure through Catch and then Finally", async () => {
    const { executed, result } = await run({
      ok: false,
      error: { code: "HTTP_FAILED", message: "The request failed." },
    });

    expect(result.ok).toBe(true);
    expect(executed).toEqual(["trigger", "boundary", "work", "catch", "finally"]);
    expect(result.nodeResults.boundary).toEqual({
      errorCode: "HTTP_FAILED",
      errorMessage: "The protected workflow region failed.",
      failedNodeId: "work",
      attempt: {},
      boundaryStatus: "caught",
    });
  });

  it("does not expose secrets from protected error messages", async () => {
    const secret = "secret-token-that-must-not-leak";
    const { result } = await run({
      ok: false,
      error: { code: "HTTP_FAILED", message: `Provider rejected ${secret}.` },
    });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.nodeResults.boundary)).not.toContain(secret);
    expect(result.nodeResults.boundary?.errorMessage).toBe("The protected workflow region failed.");
  });

  it("resumes a completed caught boundary without executing its protected body again", async () => {
    const executed: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition: definition(),
      organizationId: "00000000-0000-4000-8000-000000000001",
      executeNode: async ({ node }) => {
        executed.push(node.id);
        if (node.type === "trigger.manual") {
          return { ok: true, output: { triggeredAt: "2026-10-08T00:00:00.000Z" } };
        }
        if (node.type === "logic.try_catch") {
          return {
            ok: true,
            output: {
              boundaryStatus: "caught",
              errorCode: "HTTP_FAILED",
              errorMessage: "The request failed.",
              failedNodeId: "work",
              attempt: {},
            },
          };
        }
        return { ok: true, output: {} };
      },
    });

    expect(result.ok).toBe(true);
    expect(executed).toEqual(["trigger", "boundary", "catch", "finally"]);
  });

  it("reuses an ordinary persisted failure only inside a Try body", () => {
    expect(
      shouldReuseTryCatchBodyFailure("failed", {
        ok: false,
        error: { code: "HTTP_FAILED", message: "The request failed." },
      }),
    ).toBe(true);
    expect(
      shouldReuseTryCatchBodyFailure("failed", {
        ok: false,
        error: { code: "needs_attention", message: "Check the provider." },
      }),
    ).toBe(false);
    expect(
      shouldReuseTryCatchBodyFailure("cancelled", {
        ok: false,
        error: { code: "cancelled", message: "Run cancelled." },
      }),
    ).toBe(false);
  });

  it.each(["cancelled", "needs_attention"])("does not swallow %s", async (code) => {
    const { executed, result } = await run({
      ok: false,
      error: { code, message: `Run entered ${code}.` },
    });

    expect(result.ok).toBe(false);
    expect(executed).toEqual(["trigger", "boundary", "work"]);
  });
});
