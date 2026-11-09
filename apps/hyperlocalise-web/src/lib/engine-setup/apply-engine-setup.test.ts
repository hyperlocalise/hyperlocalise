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

const {
  listEngineSetupSuggestionsMock,
  markEngineSetupAppliedMock,
  getKnowledgeMemoryMock,
  commitKnowledgeMemoryMock,
} = vi.hoisted(() => ({
  listEngineSetupSuggestionsMock: vi.fn(),
  markEngineSetupAppliedMock: vi.fn(),
  getKnowledgeMemoryMock: vi.fn(),
  commitKnowledgeMemoryMock: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {},
  schema: {},
}));

vi.mock("@/lib/glossary/native-glossary", () => ({
  NativeGlossary: class NativeGlossary {},
}));

vi.mock("@/lib/engine-setup/store", () => ({
  listEngineSetupSuggestions: listEngineSetupSuggestionsMock,
  markEngineSetupApplied: markEngineSetupAppliedMock,
  recordEngineSetupGlossaryApplied: vi.fn(),
}));

vi.mock("@/lib/knowledge-memory/knowledge-memory", () => ({
  getKnowledgeMemoryForOrganization: getKnowledgeMemoryMock,
  commitKnowledgeMemoryForOrganization: commitKnowledgeMemoryMock,
}));

import type { ApiAuthContext } from "@/api/auth/workos";
import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";
import { err, isErr, isOk, ok } from "@/lib/primitives/result/results";

import { applyEngineSetup } from "./apply-engine-setup";
import type { EngineSetupRun, EngineSetupSuggestion } from "./store";
import type { EngineSuggestionPayload } from "./types";

const NOW = new Date("2026-11-07T12:00:00.000Z");

function auth(): ApiAuthContext {
  const organization = {
    workosOrganizationId: "workos_org_1",
    localOrganizationId: "org_1",
    name: "Acme",
    slug: "acme",
    membership: {
      workosMembershipId: null,
      role: "admin" as const,
      accessSource: "direct" as const,
    },
  };
  return {
    user: {
      workosUserId: "workos_user_1",
      localUserId: "user_1",
      email: "user@example.com",
    },
    organizations: [organization],
    organization,
    activeOrganization: organization,
    membership: organization.membership,
    activeTeam: null,
    capabilities: [],
  } as unknown as ApiAuthContext;
}

function readyRun(overrides: Partial<EngineSetupRun> = {}): EngineSetupRun {
  return {
    id: "run_1",
    organizationId: "org_1",
    createdByUserId: "user_1",
    sourceKind: "website",
    sourceUrl: "https://example.com",
    sourceLocale: "en",
    status: "ready",
    progressStage: null,
    pagesRead: 2,
    workflowRunId: "wrun_1",
    errorCode: null,
    errorMessage: null,
    appliedGlossaryId: null,
    appliedKnowledgeRevisionId: null,
    appliedByUserId: null,
    startedAt: NOW,
    completedAt: NOW,
    appliedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function suggestion(input: {
  id: string;
  kind: EngineSetupSuggestion["kind"];
  payload: EngineSuggestionPayload;
  status?: EngineSetupSuggestion["status"];
  appliedAt?: Date | null;
}): EngineSetupSuggestion {
  return {
    id: input.id,
    runId: "run_1",
    organizationId: "org_1",
    kind: input.kind,
    dedupeKey: input.kind,
    payload: input.payload,
    evidence: [{ url: "https://example.com", snippet: "Ship it" }],
    confidence: 90,
    status: input.status ?? "accepted",
    conflict: null,
    appliedAt: input.appliedAt ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const voiceSuggestion = suggestion({
  id: "sug_voice",
  kind: "voice",
  payload: {
    kind: "voice",
    voice: {
      summary: "Warm and direct.",
      attributes: { formality: 40, playfulness: 50, technicality: 20 },
      doSay: ["Ship it"],
      dontSay: ["Synergy"],
    },
  },
});

const ruleSuggestion = suggestion({
  id: "sug_rule",
  kind: "rule",
  payload: {
    kind: "rule",
    rule: { text: "Use sentence case for headings.", category: "formatting" },
  },
});

const knowledge = {
  revisionId: "rev_1",
  version: 1,
  content: "Existing memory.",
  summary: "Existing",
  updatedAt: NOW.toISOString(),
  updatedByUserId: "user_1",
};

const conflict = err({
  code: "precondition_failed" as const,
  current: knowledge,
});

beforeEach(() => {
  listEngineSetupSuggestionsMock.mockReset();
  markEngineSetupAppliedMock.mockReset();
  getKnowledgeMemoryMock.mockReset();
  commitKnowledgeMemoryMock.mockReset();
});

describe("applyEngineSetup", () => {
  it("refuses a run that is not ready", async () => {
    const result = await applyEngineSetup({
      auth: auth(),
      run: readyRun({ status: "running" }),
      glossaryId: null,
    });
    expect(isErr(result) && result.error).toEqual({ code: "engine_setup_run_not_ready" });
    expect(listEngineSetupSuggestionsMock).not.toHaveBeenCalled();
  });

  it("refuses when no accepted suggestion is still unapplied", async () => {
    listEngineSetupSuggestionsMock.mockResolvedValue([
      suggestion({
        id: "sug_pending",
        kind: "rule",
        payload: ruleSuggestion.payload,
        status: "pending",
      }),
      { ...voiceSuggestion, appliedAt: NOW },
    ]);
    const result = await applyEngineSetup({
      auth: auth(),
      run: readyRun(),
      glossaryId: null,
    });
    expect(isErr(result) && result.error).toEqual({ code: "engine_setup_nothing_to_apply" });
    expect(commitKnowledgeMemoryMock).not.toHaveBeenCalled();
  });

  it("retries a knowledge conflict once, then fails closed", async () => {
    listEngineSetupSuggestionsMock.mockResolvedValue([voiceSuggestion, ruleSuggestion]);
    getKnowledgeMemoryMock.mockResolvedValue(knowledge);
    commitKnowledgeMemoryMock.mockResolvedValue(conflict);

    const result = await applyEngineSetup({
      auth: auth(),
      run: readyRun(),
      glossaryId: null,
    });

    expect(isErr(result) && result.error).toEqual({ code: "knowledge_memory_conflict" });
    expect(getKnowledgeMemoryMock).toHaveBeenCalledTimes(2);
    expect(commitKnowledgeMemoryMock).toHaveBeenCalledTimes(2);
    expect(commitKnowledgeMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        expectedRevisionId: "rev_1",
        updatedByUserId: "user_1",
      }),
    );
    expect(markEngineSetupAppliedMock).not.toHaveBeenCalled();
  });

  it("applies on the second knowledge commit after a single conflict", async () => {
    listEngineSetupSuggestionsMock.mockResolvedValue([ruleSuggestion]);
    getKnowledgeMemoryMock
      .mockResolvedValueOnce(knowledge)
      .mockResolvedValueOnce({ ...knowledge, revisionId: "rev_2" });
    commitKnowledgeMemoryMock.mockResolvedValueOnce(conflict).mockResolvedValueOnce(
      ok({
        changed: true,
        knowledgeMemory: { ...knowledge, revisionId: "rev_3" },
      }),
    );
    markEngineSetupAppliedMock.mockResolvedValue(readyRun({ status: "applied" }));

    const result = await applyEngineSetup({
      auth: auth(),
      run: readyRun(),
      glossaryId: null,
    });

    expect(isOk(result) && result.value).toMatchObject({
      rulesApplied: 1,
      voiceApplied: false,
      knowledgeRevisionId: "rev_3",
    });
    expect(commitKnowledgeMemoryMock).toHaveBeenCalledTimes(2);
    expect(commitKnowledgeMemoryMock.mock.calls[1]![0]).toMatchObject({
      expectedRevisionId: "rev_2",
    });
    expect(markEngineSetupAppliedMock).toHaveBeenCalledWith({
      runId: "run_1",
      suggestionIds: ["sug_rule"],
      appliedByUserId: "user_1",
      appliedKnowledgeRevisionId: "rev_3",
    });
  });

  it("maps a merged knowledge document that is too long", async () => {
    listEngineSetupSuggestionsMock.mockResolvedValue([voiceSuggestion]);
    getKnowledgeMemoryMock.mockResolvedValue({
      ...knowledge,
      content: "x".repeat(KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH),
    });

    const result = await applyEngineSetup({
      auth: auth(),
      run: readyRun(),
      glossaryId: null,
    });

    expect(isErr(result) && result.error).toEqual({ code: "knowledge_memory_too_long" });
    expect(commitKnowledgeMemoryMock).not.toHaveBeenCalled();
  });
});
