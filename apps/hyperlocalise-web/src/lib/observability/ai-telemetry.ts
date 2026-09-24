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
import type { TelemetryOptions } from "ai";

export type AiWorkflowName =
  | "content-editor-recommendation"
  | "contentful-agent"
  | "conversation-classification"
  | "conversation-skill"
  | "document-variant-generation"
  | "email-intent"
  | "evaluation-judge"
  | "image-extraction"
  | "hyperlocalise-agent"
  | "localisation-audit"
  | "repository-agent"
  | "slack-agent"
  | "translation-generation"
  | "visual-workflow-execution"
  | "web-chat-agent"
  | "workspace-automation";

/**
 * Enables operational AI telemetry while prohibiting customer content at the
 * AI SDK boundary. Runtime and tool context remain excluded by omission.
 */
export function createAiTelemetry(functionId: AiWorkflowName): TelemetryOptions {
  return {
    isEnabled: true,
    recordInputs: false,
    recordOutputs: false,
    functionId,
  };
}
