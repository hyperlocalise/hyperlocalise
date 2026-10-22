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
import { generateText, Output } from "ai";

import { validateContentSyncConfig } from "@/lib/agents/content-sync/content-sync-config";
import { executeContentSyncConfig } from "@/lib/agents/content-sync/execute-content-sync";
import { extractAiSdkTokenUsage, trackAiCallTokenUsage } from "@/lib/billing/agent-runtime-usage";
import { db, schema } from "@/lib/database/client";
import { isErr } from "@/lib/primitives/result/results";
import {
  runWorkspaceAutomationEmailNotificationTool,
  runWorkspaceAutomationSlackNotificationTool,
} from "@/lib/agents/workspace-automation/notification-tools";
import { resolveHyperlocaliseAgentLanguageModel } from "@/lib/providers/organization-language-model";
import { readBoundedResponseBody, withPublicHttpFetch } from "@/lib/security/public-http-fetch";

import type { CanonicalVisualWorkflowNode } from "../schema/types";
import type { VisualWorkflowExecutionContext } from "./context";
import { runPickAssigneeAction } from "./assignment-actions";
import { executeLogicVisualWorkflowNode } from "./execute-logic-node";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";
import { resolveVisualWorkflowTemplate } from "./expressions";
import {
  appendQueryParams,
  buildHttpRequestHeaders,
  parseHttpResponseBody,
  resolveHttpRequestBody,
  resolveKeyValuePairs,
} from "./http-request";
import {
  runCrowdinCheckProgressAction,
  runCrowdinCreateTaskAction,
  runCrowdinPreTranslateAction,
} from "./crowdin-actions";
import {
  runCheckProgressAction,
  runCreateTaskAction,
  runListSourceFilesAction,
  runMachineTranslateAction,
  runQaChecksAction,
  runUpdateJobAction,
} from "./localization-actions";

export type { VisualWorkflowNodeExecutionResult } from "./execution-result";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { WORKFLOW_LIMITS } from "./limits";
import { workflowStructuredOutputSchema } from "./structured-output";
const MAX_HTTP_BODY_CHARS = 8_000;

export async function executeVisualWorkflowNode(input: {
  node: CanonicalVisualWorkflowNode;
  context: VisualWorkflowExecutionContext;
  organizationId: string;
  visualWorkflowId?: string;
  visualWorkflowRunId?: string;
  signal?: AbortSignal;
  inputsResolved?: boolean;
  idempotencyKey?: string;
}): Promise<VisualWorkflowNodeExecutionResult> {
  const { node, context } = input;
  const text = (value: string) =>
    input.inputsResolved ? value : resolveVisualWorkflowTemplate(value, context);
  // A wired list setting holds the earlier step's array, not text.
  const list = (value: unknown) => (typeof value === "string" ? text(value) : value);
  const logicResult = executeLogicVisualWorkflowNode({
    node,
    context,
    inputsResolved: input.inputsResolved,
  });
  if (logicResult.ok || logicResult.error.code !== "not_logic_node") {
    return logicResult;
  }

  switch (node.config.kind) {
    case "action.http": {
      const httpConfig = node.config;
      const url = text(httpConfig.url).trim();
      if (!url) {
        return { ok: false, error: { code: "missing_url", message: "HTTP URL is required." } };
      }

      const queryParams = resolveKeyValuePairs(httpConfig.queryParams, context, {
        resolved: input.inputsResolved,
      });
      const resolvedUrl = appendQueryParams(url, queryParams);
      const bodyType = httpConfig.bodyType ?? "none";
      const requestBody = resolveHttpRequestBody({
        body: httpConfig.body,
        bodyType,
        context,
        method: httpConfig.method,
        resolved:
          input.inputsResolved ||
          Boolean(node.inputs?.body) ||
          Object.keys(node.inputs ?? {}).some((name) => name.startsWith("body.")),
      });
      const headers = buildHttpRequestHeaders({
        headers: resolveKeyValuePairs(httpConfig.headers, context, {
          resolved: input.inputsResolved,
        }),
        auth: httpConfig.auth
          ? {
              type: httpConfig.auth.type,
              token: httpConfig.auth.token
                ? input.inputsResolved || httpConfig.auth.credentialId
                  ? httpConfig.auth.token
                  : resolveVisualWorkflowTemplate(httpConfig.auth.token, context)
                : undefined,
              headerName: httpConfig.auth.headerName,
            }
          : undefined,
        bodyType,
        hasBody: Boolean(requestBody),
      });
      if (httpConfig.idempotencyHeader && input.idempotencyKey)
        headers[httpConfig.idempotencyHeader] = input.idempotencyKey;
      const parseJsonBody = httpConfig.parseJsonBody ?? true;

      try {
        const result = await withPublicHttpFetch(
          resolvedUrl,
          {
            method: httpConfig.method,
            redirect: "manual",
            signal: input.signal
              ? AbortSignal.any([input.signal, AbortSignal.timeout(WORKFLOW_LIMITS.httpTimeoutMs)])
              : AbortSignal.timeout(WORKFLOW_LIMITS.httpTimeoutMs),
            headers,
            body: requestBody,
          },
          async (response) => {
            const bodyBytes = await readBoundedResponseBody(response);
            const bodyText = new TextDecoder().decode(bodyBytes);
            const json = parseHttpResponseBody(bodyText, parseJsonBody);
            return {
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
              body: bodyText,
              bodyPreview: bodyText.slice(0, MAX_HTTP_BODY_CHARS),
              headers: Object.fromEntries(
                [...response.headers].filter(
                  ([key]) => !/^(set-cookie|authorization|cookie|x-api-key)$/i.test(key),
                ),
              ),
              json,
            };
          },
        );

        const failOnHttpError = httpConfig.failOnHttpError ?? true;
        if (failOnHttpError && !result.ok) {
          return {
            ok: false,
            error: {
              code: "http_error",
              message: `HTTP ${result.status} ${result.statusText}`,
            },
          };
        }

        return { ok: true, output: result };
      } catch (error) {
        const code =
          error instanceof Error && error.message === "invalid_http_json"
            ? "invalid_http_json"
            : error instanceof Error && error.message.startsWith("Response too large")
              ? "http_response_too_large"
              : "http_request_failed";
        return {
          ok: false,
          error: {
            code,
            message: "HTTP request failed. Check the URL, response format, size, and timeout.",
          },
        };
      }
    }
    case "action.machine_translate":
      return runMachineTranslateAction({
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        projectId: text(node.config.projectId).trim(),
        sourceFileId: text(node.config.sourceFileId).trim(),
        targetLocales: list(node.config.targetLocales),
        useTranslationMemory: node.config.useTranslationMemory !== false,
      });
    case "action.create_task":
      return runCreateTaskAction({
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        projectId: text(node.config.projectId).trim(),
        sourceFileId: text(node.config.sourceFileId).trim(),
        targetLocales: list(node.config.targetLocales),
        step: node.config.step,
        assigneeWorkosUserId: text(node.config.assigneeWorkosUserId).trim(),
        title: text(node.config.title),
        dueAt: text(node.config.dueAt ?? ""),
      });
    case "action.check_progress":
      return runCheckProgressAction({
        organizationId: input.organizationId,
        projectId: text(node.config.projectId).trim(),
        sourceFileId: text(node.config.sourceFileId).trim(),
        targetLocales: list(node.config.targetLocales),
        jobId: text(node.config.jobId).trim(),
      });
    case "action.run_qa":
      return runQaChecksAction({
        organizationId: input.organizationId,
        projectId: text(node.config.projectId).trim(),
      });
    case "action.list_source_files":
      return runListSourceFilesAction({
        organizationId: input.organizationId,
        projectId: text(node.config.projectId).trim(),
        pathPrefix: text(node.config.pathPrefix),
      });
    case "action.update_job":
      return runUpdateJobAction({
        organizationId: input.organizationId,
        jobId: text(node.config.jobId).trim(),
        assigneeWorkosUserId: text(node.config.assigneeWorkosUserId).trim(),
        title: text(node.config.title),
        dueAt: text(node.config.dueAt ?? ""),
      });
    case "action.pick_assignee":
      return runPickAssigneeAction({
        organizationId: input.organizationId,
        visualWorkflowId: input.visualWorkflowId,
        nodeId: node.id,
        idempotencyKey: input.idempotencyKey,
        locale: list(node.config.locale),
        jobType: text(node.config.jobType),
        size: list(node.config.size),
        dueAt: text(node.config.dueAt),
        rules: node.config.rules,
        fallbackAssigneeIds: node.config.fallbackAssigneeIds,
        strategy: node.config.strategy,
        peopleSource: node.config.peopleSource,
        crowdinProjectId: text(node.config.crowdinProjectId ?? ""),
        workosUserId: node.config.workosUserId?.trim(),
        signal: input.signal,
      });
    case "action.crowdin_pre_translate":
      return runCrowdinPreTranslateAction({
        organizationId: input.organizationId,
        workosUserId: node.config.workosUserId?.trim(),
        signal: input.signal,
        crowdinProjectId: text(node.config.crowdinProjectId),
        fileIds: list(node.config.fileIds),
        languageIds: list(node.config.languageIds),
        method: node.config.method,
        engineId: text(node.config.engineId),
        aiPromptId: text(node.config.aiPromptId),
      });
    case "action.crowdin_create_task":
      return runCrowdinCreateTaskAction({
        organizationId: input.organizationId,
        workosUserId: node.config.workosUserId?.trim(),
        signal: input.signal,
        crowdinProjectId: text(node.config.crowdinProjectId),
        fileIds: list(node.config.fileIds),
        languageIds: list(node.config.languageIds),
        taskType: node.config.taskType,
        assigneeIds: list(node.config.assigneeIds),
        title: text(node.config.title),
        description: text(node.config.description),
        dueAt: text(node.config.dueAt ?? ""),
      });
    case "action.crowdin_check_progress":
      return runCrowdinCheckProgressAction({
        organizationId: input.organizationId,
        workosUserId: node.config.workosUserId?.trim(),
        signal: input.signal,
        crowdinProjectId: text(node.config.crowdinProjectId),
        fileIds: list(node.config.fileIds),
        languageIds: list(node.config.languageIds),
        taskIds: list(node.config.taskIds),
        preTranslationId: text(node.config.preTranslationId),
      });
    case "action.content_sync": {
      const projectId = text(node.config.projectId).trim();
      const connectionId = text(node.config.connectionId).trim();
      const resourceKey = text(node.config.resourceKey).trim();
      const projectFolder = text(node.config.projectFolder).trim();
      if (!projectId || !connectionId || !resourceKey || !projectFolder) {
        return {
          ok: false,
          error: {
            code: "missing_content_sync_config",
            message: "Choose a project, source, and project folder before syncing.",
          },
        };
      }

      const syncValidation = validateContentSyncConfig({
        provider: node.config.provider,
        connectionId,
        resourceKey,
        providerFolder: text(node.config.providerFolder).trim(),
        projectFolder,
      });
      if (isErr(syncValidation)) {
        return {
          ok: false,
          error: {
            code: syncValidation.error.code,
            message: syncValidation.error.message,
          },
        };
      }

      const [scopedProject] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.organizationId, input.organizationId),
            eq(schema.projects.id, projectId),
          ),
        )
        .limit(1);
      if (!scopedProject) {
        return {
          ok: false,
          error: {
            code: "project_not_found",
            message: "Choose a project in this organization.",
          },
        };
      }

      const result = await executeContentSyncConfig({
        organizationId: input.organizationId,
        projectId,
        workflowId: input.visualWorkflowId ?? input.organizationId,
        runId: input.visualWorkflowRunId ?? input.idempotencyKey ?? crypto.randomUUID(),
        syncConfig: syncValidation.value,
      });
      if (isErr(result)) {
        return {
          ok: false,
          error: {
            code: result.error.code,
            message: result.error.message,
          },
        };
      }

      return { ok: true, output: result.value };
    }
    case "action.notify_slack": {
      const channelId = text(node.config.channelId).trim();
      const message = text(node.config.message).trim();
      if (!channelId) {
        return {
          ok: false,
          error: { code: "missing_channel", message: "Slack channel ID is required." },
        };
      }
      if (!message) {
        return {
          ok: false,
          error: { code: "missing_message", message: "Slack message is required." },
        };
      }

      const result = await runWorkspaceAutomationSlackNotificationTool({
        organizationId: input.organizationId,
        channelId,
        message,
      });

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: result.error.code,
            message: result.error.message,
          },
        };
      }

      return {
        ok: true,
        output: {
          sent: true,
          channelId,
        },
      };
    }
    case "action.notify_email": {
      const from = text(node.config.from).trim();
      const recipientsRaw = text(node.config.recipients).trim();
      const subject = text(node.config.subject).trim();
      const message = text(node.config.message).trim();
      const workosUserId = node.config.workosUserId?.trim();

      if (!workosUserId) {
        return {
          ok: false,
          error: {
            code: "email_provider_not_connected",
            message:
              "Reconnect the email provider in Integrations and save the workflow before sending email.",
          },
        };
      }
      if (!z.email().safeParse(from).success) {
        return {
          ok: false,
          error: { code: "missing_from", message: "Sender email address is required." },
        };
      }
      const recipients = recipientsRaw
        .split(/[\n,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (
        recipients.length === 0 ||
        recipients.some((recipient) => !z.email().safeParse(recipient).success)
      ) {
        return {
          ok: false,
          error: { code: "missing_recipients", message: "At least one recipient is required." },
        };
      }
      if (!subject) {
        return {
          ok: false,
          error: { code: "missing_subject", message: "Email subject is required." },
        };
      }
      if (!message) {
        return {
          ok: false,
          error: { code: "missing_message", message: "Email message is required." },
        };
      }

      const result = await runWorkspaceAutomationEmailNotificationTool({
        organizationId: input.organizationId,
        provider: node.config.provider,
        workosUserId,
        from,
        recipients,
        subject,
        message,
      });

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: result.error.code,
            message: result.error.message,
          },
        };
      }

      return {
        ok: true,
        output: {
          sent: true,
          provider: node.config.provider,
          recipientCount: recipients.length,
        },
      };
    }
    case "ai.agent": {
      const prompt = text(node.config.prompt).trim();
      if (!prompt) {
        return { ok: false, error: { code: "missing_prompt", message: "AI prompt is required." } };
      }

      try {
        const languageModel = await resolveHyperlocaliseAgentLanguageModel({
          organizationId: input.organizationId,
        });
        const structured =
          node.outputFields?.some((field) => field.path.startsWith("json.")) ?? false;
        const result = await generateText({
          model: languageModel.model,
          prompt,
          maxRetries: 0,
          ...(structured
            ? {
                output: Output.object({
                  schema: workflowStructuredOutputSchema(node.outputFields ?? []),
                }),
              }
            : {}),
          abortSignal: input.signal
            ? AbortSignal.any([input.signal, AbortSignal.timeout(WORKFLOW_LIMITS.aiTimeoutMs)])
            : AbortSignal.timeout(WORKFLOW_LIMITS.aiTimeoutMs),
        });
        await trackAiCallTokenUsage({
          organizationId: input.organizationId,
          source: "visual_workflow_ai_step",
          tokenUsage: extractAiSdkTokenUsage(result.usage),
          modelId: languageModel.modelId,
          credentialSource: languageModel.source === "gateway" ? "gateway" : "byok",
        });
        const json = structured ? result.output : undefined;
        return {
          ok: true,
          output: {
            text: result.text,
            ...(json !== undefined ? { json } : {}),
          },
        };
      } catch {
        return {
          ok: false,
          error: {
            code: "ai_agent_failed",
            message: "AI generation failed or returned an invalid structured result.",
          },
        };
      }
    }
    default:
      return {
        ok: false,
        error: {
          code: "unsupported_node",
          message: "Unsupported node type.",
        },
      };
  }
}
