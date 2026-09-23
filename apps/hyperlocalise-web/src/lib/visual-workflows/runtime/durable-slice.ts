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
import { and, eq, asc } from "drizzle-orm";
import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { runVisualWorkflowV3Interpreter } from "./interpreter-v3";
import { executeVisualWorkflowNode } from "./execute-node";
import { createMockWorkflowExecutor } from "./mock-executor";
import {
  encryptWorkflowPayload,
  decryptWorkflowPayload,
  resolveWorkflowCredential,
} from "../workflow-credentials";
import { redactWorkflowSnapshot, collectWorkflowSecrets } from "./snapshots";
import { resolveSelectedNodeCredentials } from "./resolve-node-credentials";
import { upsertVisualWorkflowNodeRun } from "../visual-workflow-runs";
import type { VisualWorkflowV3Definition } from "../schema/types";
import type { VisualWorkflowRunRecord } from "../visual-workflow-run-types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";
import { WORKFLOW_LIMITS } from "./limits";
import {
  buildVisualWorkflowNodeIdempotencyKey,
  collectRetryBodyNodeIds,
  findRetryNodeForBodyNodeId,
  shouldReuseCompletedNodeRun,
} from "../validation/retry-idempotency";
import { isLogicRetryConfig } from "../schema/retry-policy";
import { parseRetryResumeState } from "./retry-delay";
const logger = createLogger("visual-workflow-node");
export async function executeDurableWorkflowSlice(input: {
  run: VisualWorkflowRunRecord;
  leaseToken: string;
  definition: VisualWorkflowV3Definition;
  payload: Record<string, unknown>;
  organizationId: string;
}) {
  const records = await db
    .select()
    .from(schema.visualWorkflowNodeRuns)
    .where(
      and(
        eq(schema.visualWorkflowNodeRuns.runId, input.run.id),
        eq(schema.visualWorkflowNodeRuns.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(schema.visualWorkflowNodeRuns.attempt));
  const key = (id: string, iteration = -1) => JSON.stringify([id, iteration]);
  const retryBodyNodeIds = collectRetryBodyNodeIds(input.definition);
  const retryBackoff = parseRetryResumeState(input.payload.retryBackoff);
  const resumeAttempt = retryBackoff?.nextAttempt ?? null;
  const completed = new Map(
    records
      .filter(
        (record) =>
          record.encryptedOutput &&
          ["succeeded", "handled_error"].includes(record.status) &&
          shouldReuseCompletedNodeRun({
            nodeId: record.nodeId,
            attempt: record.attempt,
            retryBodyNodeIds,
            resumeAttempt,
          }),
      )
      .map((record) => [
        key(record.nodeId, record.iteration),
        decryptWorkflowPayload(record.encryptedOutput!) as VisualWorkflowNodeExecutionResult,
      ]),
  );
  const pending = new Map<string, VisualWorkflowNodeExecutionResult>();
  const inputs = new Map<string, Record<string, unknown>>();
  const attempts = new Map<string, number>();
  const secrets = collectWorkflowSecrets(input.payload);
  const credentials = new Map<string, string>();
  for (const result of completed.values())
    if (result.ok) secrets.push(...collectWorkflowSecrets(result.output));
  let externalExecuted = false;
  const mock = createMockWorkflowExecutor(
    (input.payload.mockOutputs as Record<string, Record<string, unknown>>) ?? {},
  );
  const controller = new AbortController();
  const isCancelled = async () => {
    const [run] = await db
      .select({
        cancel: schema.visualWorkflowRuns.cancelRequestedAt,
        leaseToken: schema.visualWorkflowRuns.leaseToken,
      })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.id, input.run.id));
    if (run?.leaseToken !== input.leaseToken) throw new Error("workflow_lease_lost");
    if (run?.cancel) controller.abort();
    return Boolean(run?.cancel);
  };
  const timer = setInterval(() => {
    void isCancelled().catch(() => controller.abort());
  }, 1000);
  try {
    const result = await runVisualWorkflowV3Interpreter({
      definition: input.definition,
      organizationId: input.organizationId,
      triggerInput: {
        triggeredAt: input.run.createdAt,
        scheduledRunAt: input.run.createdAt,
        ...Object.fromEntries(
          Object.entries(input.payload).filter(
            ([name]) =>
              ![
                "definitionSnapshot",
                "mockOutputs",
                "triggeredAt",
                "executionPlanVersion",
                "retryBackoff",
              ].includes(name),
          ),
        ),
      },
      signal: controller.signal,
      shouldCancel: isCancelled,
      mockMode: input.run.mode === "mock",
      retryBackoff: retryBackoff ?? null,
      executeNode: async (args) => {
        const id = key(args.node.id, args.iteration);
        const isExternal = args.node.type.startsWith("action.") || args.node.type === "ai.agent";
        if (
          args.node.type !== "logic.for_each" &&
          args.node.type !== "logic.retry" &&
          completed.has(id)
        )
          return completed.get(id)!;
        if (isExternal && externalExecuted)
          return {
            ok: false,
            error: { code: "yield_execution", message: "Continue in the next durable step." },
          };
        const previous = records
          .filter((record) => key(record.nodeId, record.iteration) === id)
          .at(-1);
        const safe =
          args.node.config.kind === "action.http" &&
          (args.node.config.method === "GET" || Boolean(args.node.config.idempotencyHeader));
        if (isExternal && previous?.status === "running" && input.run.mode !== "mock" && !safe)
          return {
            ok: false,
            error: {
              code: "needs_attention",
              message:
                "The previous action outcome is unknown. Inspect the provider before retrying.",
            },
          };
        if (isExternal) externalExecuted = true;
        let config = { ...args.node.config } as Record<string, unknown>;
        if (input.run.mode !== "mock") {
          const resolvedSecrets = await resolveSelectedNodeCredentials({
            organizationId: input.organizationId,
            node: args.node,
            cache: credentials,
            resolve: resolveWorkflowCredential,
          });
          if (!resolvedSecrets.ok) {
            return { ok: false, error: resolvedSecrets.error };
          }
          config = resolvedSecrets.value.config;
          secrets.push(...resolvedSecrets.value.secrets);
        }
        inputs.set(id, { config });
        const inRetryBody = retryBodyNodeIds.has(args.node.id);
        const resolved = {
          ...args,
          node: { ...args.node, config: config as typeof args.node.config },
          inputsResolved: true,
          idempotencyKey: buildVisualWorkflowNodeIdempotencyKey({
            runId: input.run.id,
            nodeId: args.node.id,
            iteration: args.iteration,
            inRetryBody,
            node: args.node,
          }),
        };
        const firstAttempt = (previous?.attempt ?? 0) + 1;
        const currentAttempts = records.filter(
          (record) =>
            key(record.nodeId, record.iteration) === id &&
            (!input.run.startedAt || record.createdAt.getTime() >= Date.parse(input.run.startedAt)),
        ).length;
        const retryParent = findRetryNodeForBodyNodeId(input.definition, args.node.id);
        const duplicateRiskAcknowledged =
          inRetryBody &&
          retryParent?.config.kind === "logic.retry" &&
          isLogicRetryConfig(retryParent.config) &&
          retryParent.config.acknowledgeDuplicateRisk;
        const maxAttempts =
          inRetryBody || input.run.mode === "mock"
            ? 1
            : safe
              ? Math.max(0, WORKFLOW_LIMITS.attempts - currentAttempts)
              : 1;
        let execution: VisualWorkflowNodeExecutionResult = {
          ok: false,
          error: { message: "Execution did not start." },
        };
        for (let offset = 0; offset < maxAttempts; offset++) {
          const attempt = firstAttempt + offset;
          attempts.set(id, attempt);
          if (isExternal)
            await upsertVisualWorkflowNodeRun({
              leaseToken: input.leaseToken,
              runId: input.run.id,
              organizationId: input.organizationId,
              nodeId: args.node.id,
              nodeType: args.node.type,
              iteration: args.iteration,
              attempt,
              status: "running",
              inputSnapshot: redactWorkflowSnapshot({ config }, secrets) as Record<string, unknown>,
              startedAt: new Date(),
            });
          try {
            execution =
              input.run.mode === "mock"
                ? await mock(resolved)
                : await executeVisualWorkflowNode(resolved);
          } catch {
            execution = {
              ok: false,
              error: {
                code:
                  isExternal && !safe && !duplicateRiskAcknowledged
                    ? "needs_attention"
                    : "node_execution_failed",
                message: "Execution failed. Check the action configuration and provider.",
              },
            };
          }
          if (controller.signal.aborted)
            return { ok: false, error: { code: "cancelled", message: "Run cancelled." } };
          if (execution.ok || offset === maxAttempts - 1) break;
          await upsertVisualWorkflowNodeRun({
            leaseToken: input.leaseToken,
            runId: input.run.id,
            organizationId: input.organizationId,
            nodeId: args.node.id,
            nodeType: args.node.type,
            iteration: args.iteration,
            attempt,
            status: "failed",
            error: redactWorkflowSnapshot(execution.error, secrets) as Record<string, unknown>,
            finishedAt: new Date(),
          });
          await new Promise<void>((resolve) => setTimeout(resolve, 1000 * 2 ** offset));
        }
        if (
          !execution.ok &&
          !safe &&
          !duplicateRiskAcknowledged &&
          input.run.mode !== "mock" &&
          ["http_request_failed", "slack_send_failed", "email_send_failed", "http_error"].includes(
            execution.error.code ?? "",
          )
        )
          execution = {
            ok: false,
            error: {
              code: "needs_attention",
              message: "Delivery could not be confirmed. Inspect the provider before retrying.",
            },
          };
        if (execution.ok) secrets.push(...collectWorkflowSecrets(execution.output));
        pending.set(id, execution);
        logger.info(
          {
            runId: input.run.id,
            nodeId: args.node.id,
            iteration: args.iteration ?? -1,
            attempt: attempts.get(id),
            outcome: execution.ok ? "succeeded" : (execution.error.code ?? "failed"),
          },
          "visual workflow node completed",
        );
        return execution;
      },
      onNodeUpdate: async (update) => {
        const id = key(update.nodeId, update.iteration);
        if (
          completed.has(id) &&
          update.nodeType !== "logic.for_each" &&
          update.nodeType !== "logic.retry"
        )
          return;
        if (update.status === "running") {
          inputs.set(id, update.inputSnapshot ?? {});
          return;
        }
        const execution = pending.get(id);
        await upsertVisualWorkflowNodeRun({
          leaseToken: input.leaseToken,
          runId: input.run.id,
          organizationId: input.organizationId,
          nodeId: update.nodeId,
          nodeType: update.nodeType,
          iteration: update.iteration,
          attempt: attempts.get(id) ?? 1,
          status: update.status,
          inputSnapshot: redactWorkflowSnapshot(inputs.get(id) ?? {}, secrets) as Record<
            string,
            unknown
          >,
          outputSnapshot: redactWorkflowSnapshot(update.outputSnapshot ?? {}, secrets) as Record<
            string,
            unknown
          >,
          error: redactWorkflowSnapshot(update.error ?? null, secrets) as Record<
            string,
            unknown
          > | null,
          encryptedOutput: execution ? encryptWorkflowPayload(execution) : undefined,
          finishedAt: new Date(),
        });
      },
    });
    // Only redacted inspection data leaves the durable execution boundary.
    const nodeResults = redactWorkflowSnapshot(
      result.nodeResults,
      secrets,
    ) as typeof result.nodeResults;
    if (!result.ok)
      return {
        ...result,
        nodeResults,
        error: redactWorkflowSnapshot(result.error, secrets) as typeof result.error,
      };
    return { ...result, nodeResults };
  } finally {
    clearInterval(timer);
  }
}
