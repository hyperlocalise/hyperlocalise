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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { buildWorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { createDefaultWorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import {
  AssistantSessionOutOfDateError,
  AssistantTurnInProgressError,
  streamAssistantTurn,
} from "./automation-assistant-api";

function pageContext() {
  return buildWorkspaceAutomationEditorContext({
    editorSessionId: "editor-1",
    mode: "create",
    form: createDefaultWorkspaceAutomationFormState(),
    connections: {},
    timeZone: "Australia/Sydney",
    repositories: [],
    crowdinProjectIds: [],
    contentfulConnectionIds: [],
  });
}

function consumeTurn() {
  return streamAssistantTurn({
    organizationSlug: "acme",
    sessionId: "session-1",
    text: "Make it weekly",
    pageContext: pageContext(),
    lastTurnId: null,
  }).next();
}

function stubRefusal(body: { error: string; message: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamAssistantTurn", () => {
  it("refuses a busy session from the error code, even when the message text does not name it", async () => {
    stubRefusal({ error: "turn_in_progress", message: "Please wait." });

    await expect(consumeTurn()).rejects.toBeInstanceOf(AssistantTurnInProgressError);
  });

  it("refuses a stale tab from the error code, even when the message text does not name it", async () => {
    stubRefusal({ error: "session_out_of_date", message: "Reload this page." });

    await expect(consumeTurn()).rejects.toBeInstanceOf(AssistantSessionOutOfDateError);
  });

  it("keeps other refusals as the parsed envelope", async () => {
    stubRefusal({ error: "empty_message", message: "Write something first." });

    await expect(consumeTurn()).rejects.toMatchObject({
      name: "ApiResponseError",
      code: "empty_message",
    });
  });
});
