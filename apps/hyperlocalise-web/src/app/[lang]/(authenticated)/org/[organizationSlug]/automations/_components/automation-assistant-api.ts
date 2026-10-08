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
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";

import type {
  AutomationAssistantMessageResponse,
  AutomationAssistantSessionResponse,
} from "@/api/routes/workspace-automation/automation-assistant.schema";
import { apiClient } from "@/lib/api-client-instance";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { readApiResponseError } from "@/lib/api-error";

export type AssistantSession = AutomationAssistantSessionResponse;
export type AssistantMessage = AutomationAssistantMessageResponse;

// Read when called, not when imported, so a page test can stub the client with less.
const sessions = () => apiClient.api.orgs[":organizationSlug"].automations.assistant.sessions;

export async function createAssistantSession(
  organizationSlug: string,
  automationId: string | null,
): Promise<AssistantSession> {
  const response = await sessions().$post({
    param: { organizationSlug },
    json: { automationId },
  });
  if (response.status !== 201) {
    throw await readApiResponseError(response, "Could not start the assistant.");
  }
  return ((await response.json()) as { session: AssistantSession }).session;
}

export async function findAssistantSession(
  organizationSlug: string,
  automationId: string,
): Promise<{ session: AssistantSession | null; messages: AssistantMessage[] }> {
  const response = await sessions().$get({
    param: { organizationSlug },
    query: { automationId },
  });
  if (response.status !== 200) {
    throw await readApiResponseError(response, "Could not load the assistant.");
  }
  return (await response.json()) as {
    session: AssistantSession | null;
    messages: AssistantMessage[];
  };
}

export async function loadAssistantSession(
  organizationSlug: string,
  sessionId: string,
): Promise<{ session: AssistantSession; messages: AssistantMessage[] } | null> {
  const response = await sessions()[":sessionId"].$get({
    param: { organizationSlug, sessionId },
  });
  if (response.status === 404) {
    return null;
  }
  if (response.status !== 200) {
    throw await readApiResponseError(response, "Could not load the assistant.");
  }
  return (await response.json()) as { session: AssistantSession; messages: AssistantMessage[] };
}

export async function bindAssistantSession(
  organizationSlug: string,
  sessionId: string,
  automationId: string,
): Promise<void> {
  const response = await sessions()[":sessionId"].$patch({
    param: { organizationSlug, sessionId },
    json: { automationId },
  });
  if (response.status !== 200) {
    throw await readApiResponseError(response, "Could not keep the assistant's conversation.");
  }
}

export async function deleteAssistantSession(
  organizationSlug: string,
  sessionId: string,
): Promise<void> {
  const response = await sessions()[":sessionId"].$delete({
    param: { organizationSlug, sessionId },
  });
  if (response.status !== 204 && response.status !== 404) {
    throw await readApiResponseError(response, "Could not start over.");
  }
}

/** Thrown when the session already has a turn running. */
export class AssistantTurnInProgressError extends Error {
  constructor() {
    super("turn_in_progress");
    this.name = "AssistantTurnInProgressError";
  }
}

/**
 * Sends one message and yields the assistant's reply as it grows, in the UI message shape the
 * page applies tool outputs from. Uses the chat transport, so the stream is read the way the
 * dock reads its own.
 */
export async function* streamAssistantTurn(input: {
  organizationSlug: string;
  sessionId: string;
  text: string;
  pageContext: WorkspaceAutomationEditorContext;
  signal?: AbortSignal;
}): AsyncGenerator<UIMessage> {
  const transport = new DefaultChatTransport({
    api: `/api/orgs/${input.organizationSlug}/automations/assistant/sessions/${input.sessionId}/turns`,
  });
  let chunks: Awaited<ReturnType<typeof transport.sendMessages>>;
  try {
    chunks = await transport.sendMessages({
      abortSignal: input.signal,
      chatId: input.sessionId,
      messageId: undefined,
      messages: [
        { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: input.text }] },
      ],
      trigger: "submit-message",
      body: { pageContext: input.pageContext },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("turn_in_progress")) {
      throw new AssistantTurnInProgressError();
    }
    throw error;
  }
  yield* readUIMessageStream({
    message: { id: `stream-${input.sessionId}`, role: "assistant", parts: [] },
    stream: chunks,
    terminateOnError: true,
  });
}
