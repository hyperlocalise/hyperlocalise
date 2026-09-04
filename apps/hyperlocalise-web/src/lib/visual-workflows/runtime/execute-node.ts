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
import { generateText } from "ai";

import { runWorkspaceAutomationSlackNotificationTool } from "@/lib/agents/workspace-automation/notification-tools";
import { resolveHyperlocaliseAgentLanguageModel } from "@/lib/providers/organization-language-model";
import { readBoundedResponseBody, withPublicHttpFetch } from "@/lib/security/public-http-fetch";

import type { CanonicalVisualWorkflowNode } from "../schema/types";
import type { VisualWorkflowExecutionContext } from "./context";
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

export type { VisualWorkflowNodeExecutionResult } from "./execution-result";

const MAX_HTTP_BODY_CHARS = 8_000;

export async function executeVisualWorkflowNode(input: {
  node: CanonicalVisualWorkflowNode;
  context: VisualWorkflowExecutionContext;
  organizationId: string;
}): Promise<VisualWorkflowNodeExecutionResult> {
  const { node, context } = input;
  const logicResult = executeLogicVisualWorkflowNode({ node, context });
  if (logicResult.ok || logicResult.error.code !== "not_logic_node") {
    return logicResult;
  }

  switch (node.config.kind) {
    case "action.http": {
      const httpConfig = node.config;
      const url = resolveVisualWorkflowTemplate(httpConfig.url, context).trim();
      if (!url) {
        return { ok: false, error: { code: "missing_url", message: "HTTP URL is required." } };
      }

      const queryParams = resolveKeyValuePairs(httpConfig.queryParams, context);
      const resolvedUrl = appendQueryParams(url, queryParams);
      const bodyType = httpConfig.bodyType ?? "none";
      const requestBody = resolveHttpRequestBody({
        body: httpConfig.body,
        bodyType,
        context,
        method: httpConfig.method,
      });
      const headers = buildHttpRequestHeaders({
        headers: resolveKeyValuePairs(httpConfig.headers, context),
        auth: httpConfig.auth
          ? {
              type: httpConfig.auth.type,
              token: httpConfig.auth.token
                ? resolveVisualWorkflowTemplate(httpConfig.auth.token, context)
                : undefined,
              headerName: httpConfig.auth.headerName,
            }
          : undefined,
        bodyType,
        hasBody: Boolean(requestBody),
      });
      const parseJsonBody = httpConfig.parseJsonBody ?? true;

      try {
        const result = await withPublicHttpFetch(
          resolvedUrl,
          {
            method: httpConfig.method,
            redirect: "manual",
            headers,
            body: requestBody,
          },
          async (response) => {
            const bodyBytes = await readBoundedResponseBody(response);
            const bodyText = new TextDecoder().decode(bodyBytes).slice(0, MAX_HTTP_BODY_CHARS);
            const json = parseHttpResponseBody(bodyText, parseJsonBody);
            return {
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
              body: bodyText,
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
        return {
          ok: false,
          error: {
            code: "http_request_failed",
            message: error instanceof Error ? error.message : "HTTP request failed.",
          },
        };
      }
    }
    case "action.notify_slack": {
      const channelId = resolveVisualWorkflowTemplate(node.config.channelId, context).trim();
      const message = resolveVisualWorkflowTemplate(node.config.message, context).trim();
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
    case "ai.agent": {
      const prompt = resolveVisualWorkflowTemplate(node.config.prompt, context).trim();
      if (!prompt) {
        return { ok: false, error: { code: "missing_prompt", message: "AI prompt is required." } };
      }

      try {
        const { model } = await resolveHyperlocaliseAgentLanguageModel({
          organizationId: input.organizationId,
        });
        const result = await generateText({
          model,
          prompt,
        });
        return {
          ok: true,
          output: {
            text: result.text,
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "ai_agent_failed",
            message: error instanceof Error ? error.message : "AI agent step failed.",
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
