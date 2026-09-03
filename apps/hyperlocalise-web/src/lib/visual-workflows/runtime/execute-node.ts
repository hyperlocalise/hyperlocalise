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

import { resolveHyperlocaliseAgentLanguageModel } from "@/lib/providers/organization-language-model";
import { readBoundedResponseBody, withPublicHttpFetch } from "@/lib/security/public-http-fetch";

import type { CanonicalVisualWorkflowNode } from "../schema/types";
import type { VisualWorkflowExecutionContext } from "./context";
import { evaluateVisualWorkflowCondition, resolveVisualWorkflowTemplate } from "./expressions";

export type VisualWorkflowNodeExecutionResult =
  | {
      ok: true;
      output: Record<string, unknown>;
      branchResult?: boolean;
    }
  | {
      ok: false;
      error: { message: string; code?: string };
    };

const MAX_HTTP_BODY_CHARS = 8_000;

export async function executeVisualWorkflowNode(input: {
  node: CanonicalVisualWorkflowNode;
  context: VisualWorkflowExecutionContext;
  organizationId: string;
}): Promise<VisualWorkflowNodeExecutionResult> {
  const { node, context } = input;

  switch (node.config.kind) {
    case "trigger.manual":
      return {
        ok: true,
        output: {
          ...context.trigger,
        },
      };
    case "action.http": {
      const url = resolveVisualWorkflowTemplate(node.config.url, context).trim();
      if (!url) {
        return { ok: false, error: { code: "missing_url", message: "HTTP URL is required." } };
      }

      try {
        const result = await withPublicHttpFetch(
          url,
          { method: node.config.method, redirect: "manual" },
          async (response) => {
            const bodyBytes = await readBoundedResponseBody(response);
            const bodyText = new TextDecoder().decode(bodyBytes).slice(0, MAX_HTTP_BODY_CHARS);
            return {
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
              body: bodyText,
            };
          },
        );

        if (!result.ok) {
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
    case "logic.if": {
      const resolvedCondition = resolveVisualWorkflowTemplate(node.config.condition, context);
      const branchResult = evaluateVisualWorkflowCondition(node.config.condition, context);
      return {
        ok: true,
        output: {
          condition: resolvedCondition,
          result: branchResult,
        },
        branchResult,
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
    case "logic.for_each":
      return {
        ok: false,
        error: {
          code: "unsupported_node",
          message: "Loop nodes are not supported in Phase 1.",
        },
      };
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
