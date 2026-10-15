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
import type { MessageDescriptor } from "react-intl";

import type { VisualCatalogType } from "@/lib/visual-workflows/schema/types";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

const ON_ERROR = { onError: messages.onErrorLabel };

/** Each step type's settings, by key, under the labels the settings panel shows them with. */
const SETTING_LABELS: Partial<Record<VisualCatalogType, Record<string, MessageDescriptor>>> = {
  "trigger.scheduled": { schedule: messages.scheduleCadence },
  "trigger.github": {
    githubInstallationRepositoryId: messages.githubRepository,
    branches: messages.githubBranches,
    events: messages.githubEvents,
  },
  "trigger.source_upload": { projectId: messages.sourceUploadProject },
  "action.http": {
    method: messages.httpMethod,
    url: messages.httpUrl,
    headers: messages.httpHeaders,
    queryParams: messages.httpQueryParams,
    body: messages.httpBody,
    bodyType: messages.httpBodyType,
    auth: messages.httpAuthType,
    parseJsonBody: messages.httpParseJson,
    failOnHttpError: messages.httpFailOnError,
    ...ON_ERROR,
  },
  "action.content_sync": {
    projectId: messages.contentSyncProject,
    provider: messages.contentSyncProvider,
    resourceKey: messages.contentSyncResource,
    providerFolder: messages.contentSyncProviderFolder,
    projectFolder: messages.contentSyncProjectFolder,
    ...ON_ERROR,
  },
  "action.notify_slack": {
    channelId: messages.slackChannelId,
    message: messages.slackMessage,
    ...ON_ERROR,
  },
  "action.notify_email": {
    provider: messages.emailProvider,
    from: messages.emailFrom,
    recipients: messages.emailRecipients,
    subject: messages.emailSubject,
    message: messages.emailMessage,
    ...ON_ERROR,
  },
  "logic.if": { condition: messages.ifCondition },
  "logic.switch": { expression: messages.switchExpression, cases: messages.switchCases },
  "logic.set": { assignments: messages.setAssignments },
  "ai.agent": { prompt: messages.aiPrompt, ...ON_ERROR },
  "logic.for_each": { collection: messages.forEachCollection },
  "logic.retry": {
    maxAttempts: messages.retryMaxAttempts,
    initialDelayMs: messages.retryInitialDelay,
    backoffMultiplier: messages.retryBackoffMultiplier,
    acknowledgeDuplicateRisk: messages.retryAcknowledgeDuplicateRisk,
  },
  "flow.wait": {
    mode: messages.waitMode,
    durationMs: messages.waitDurationMs,
    timestamp: messages.waitTimestamp,
    condition: messages.waitCondition,
    pollingIntervalMs: messages.waitPollingIntervalMs,
    timeoutMs: messages.waitTimeoutMs,
  },
  "flow.stop": { outcome: messages.stopOutcome, reason: messages.stopReason },
  "flow.return": { outputs: messages.returnOutputs },
  "flow.fail": { errorCode: messages.failErrorCode, message: messages.failMessage },
  "logic.merge": {
    mode: messages.mergeMode,
    inputs: messages.mergeInputs,
    timeoutMs: messages.mergeTimeoutMs,
  },
  "logic.sequence": { outputs: messages.sequenceOutputs },
  "flow.call_workflow": ON_ERROR,
};

/** The label a step type's setting is shown under in its settings panel, or null if it has none. */
export function visualWorkflowSettingLabelMessage(
  type: VisualCatalogType,
  key: string,
): MessageDescriptor | null {
  return SETTING_LABELS[type]?.[key] ?? null;
}
