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

const { listEngineSetupSuggestionsMock, markEngineSetupAppliedMock, upsertSetupDocumentMock } =
  vi.hoisted(() => ({
    listEngineSetupSuggestionsMock: vi.fn(),
    markEngineSetupAppliedMock: vi.fn(),
    upsertSetupDocumentMock: vi.fn(),
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

vi.mock("@/lib/engine-setup/setup-guideline-document", () => ({
  upsertSetupGuidelineDocument: upsertSetupDocumentMock,
}));

import type { ApiAuthContext } from "@/api/auth/workos";
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

beforeEach(() => {
  listEngineSetupSuggestionsMock.mockReset();
  markEngineSetupAppliedMock.mockReset();
  upsertSetupDocumentMock.mockReset();
});

describe("applyEngineSetup", () => {
  it("refuses a run that is not ready", async () => {
    const result = await applyEngineSetup({
      auth: auth(),
      organizationSlug: "acme",
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
      organizationSlug: "acme",
      run: readyRun(),
      glossaryId: null,
    });
    expect(isErr(result) && result.error).toEqual({ code: "engine_setup_nothing_to_apply" });
    expect(upsertSetupDocumentMock).not.toHaveBeenCalled();
  });

  it("upserts the setup guideline document and records the new revision", async () => {
    listEngineSetupSuggestionsMock.mockResolvedValue([voiceSuggestion, ruleSuggestion]);
    upsertSetupDocumentMock.mockResolvedValue(ok({ documentId: "doc_1", revisionId: "rev_9" }));
    markEngineSetupAppliedMock.mockResolvedValue(readyRun({ status: "applied" }));

    const result = await applyEngineSetup({
      auth: auth(),
      organizationSlug: "acme",
      run: readyRun(),
      glossaryId: null,
    });

    expect(isOk(result) && result.value).toMatchObject({
      rulesApplied: 1,
      voiceApplied: true,
      knowledgeRevisionId: "rev_9",
    });
    expect(upsertSetupDocumentMock).toHaveBeenCalledWith({
      organizationSlug: "acme",
      voice: voiceSuggestion.payload.kind === "voice" ? voiceSuggestion.payload.voice : null,
      rules: [ruleSuggestion.payload.kind === "rule" ? ruleSuggestion.payload.rule : null].filter(
        Boolean,
      ),
      sourceUrl: "https://example.com",
    });
    expect(markEngineSetupAppliedMock).toHaveBeenCalledWith({
      runId: "run_1",
      suggestionIds: ["sug_voice", "sug_rule"],
      appliedByUserId: "user_1",
      appliedKnowledgeRevisionId: "rev_9",
    });
  });

  it("records a null revision when the setup document is unchanged", async () => {
    listEngineSetupSuggestionsMock.mockResolvedValue([ruleSuggestion]);
    upsertSetupDocumentMock.mockResolvedValue(ok({ documentId: "doc_1", revisionId: null }));
    markEngineSetupAppliedMock.mockResolvedValue(readyRun({ status: "applied" }));

    const result = await applyEngineSetup({
      auth: auth(),
      organizationSlug: "acme",
      run: readyRun(),
      glossaryId: null,
    });

    expect(isOk(result) && result.value).toMatchObject({ knowledgeRevisionId: null });
    expect(markEngineSetupAppliedMock).toHaveBeenCalledWith(
      expect.objectContaining({ appliedKnowledgeRevisionId: null }),
    );
  });

  it("maps a setup document that is too long", async () => {
    listEngineSetupSuggestionsMock.mockResolvedValue([voiceSuggestion]);
    upsertSetupDocumentMock.mockResolvedValue(err({ code: "setup_document_too_long" }));

    const result = await applyEngineSetup({
      auth: auth(),
      organizationSlug: "acme",
      run: readyRun(),
      glossaryId: null,
    });

    expect(isErr(result) && result.error).toEqual({ code: "setup_document_too_long" });
    expect(markEngineSetupAppliedMock).not.toHaveBeenCalled();
  });
});
