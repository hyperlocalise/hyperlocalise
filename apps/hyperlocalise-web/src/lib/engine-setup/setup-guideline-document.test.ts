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

const { dbSelectMock, guidelinesMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  guidelinesMock: {
    listDocuments: vi.fn(),
    getDocument: vi.fn(),
    uploadDocument: vi.fn(),
    replaceDocument: vi.fn(),
  },
}));

vi.mock("@/lib/database/client", () => ({
  db: { select: dbSelectMock },
  schema: {
    organizations: { id: "organizations.id", slug: "organizations.slug" },
  },
}));

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({ guidelines: guidelinesMock }),
}));

import { isErr, isOk } from "@/lib/primitives/result/results";

import type { EngineRulePayload, EngineVoicePayload } from "./types";

import {
  ENGINE_SETUP_DOCUMENT_TITLE,
  upsertSetupGuidelineDocument,
} from "./setup-guideline-document";

const VOICE: EngineVoicePayload = {
  summary: "Warm and direct.",
  attributes: { formality: 40, playfulness: 50, technicality: 20 },
  doSay: ["Ship it"],
  dontSay: ["Synergy"],
};
const RULES: EngineRulePayload[] = [
  { text: "Use sentence case for headings.", category: "formatting" },
];

function mockSlug(slug: string | null) {
  dbSelectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => (slug === null ? [] : [{ slug }]),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSlug("acme");
});

describe("upsertSetupGuidelineDocument", () => {
  it("creates the setup document when absent", async () => {
    guidelinesMock.listDocuments.mockResolvedValue([]);
    guidelinesMock.uploadDocument.mockImplementation(async (_slug: string, upload: any) => ({
      id: "doc_1",
      revisionId: "rev_1",
      title: upload.title,
    }));

    const result = await upsertSetupGuidelineDocument({
      organizationSlug: "acme",
      voice: VOICE,
      rules: RULES,
      sourceUrl: "https://example.com",
    });

    expect(isOk(result) && result.value).toEqual({ documentId: "doc_1", revisionId: "rev_1" });
    expect(guidelinesMock.uploadDocument).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ title: ENGINE_SETUP_DOCUMENT_TITLE }),
    );
    const upload = guidelinesMock.uploadDocument.mock.calls[0]![1];
    expect(upload.filename).toBe("setup-wizard-guidance.md");
    expect(await upload.file.text()).toContain("## Brand voice");
    expect(await upload.file.text()).toContain("Use sentence case for headings.");
  });

  it("replaces the setup document when content changed", async () => {
    guidelinesMock.listDocuments.mockResolvedValue([
      { id: "doc_1", projectId: null, title: ENGINE_SETUP_DOCUMENT_TITLE, revisionId: "rev_1" },
    ]);
    guidelinesMock.getDocument.mockResolvedValue({ content: "Existing guidance.\n" });
    guidelinesMock.replaceDocument.mockImplementation(async () => ({
      id: "doc_1",
      revisionId: "rev_2",
    }));

    const result = await upsertSetupGuidelineDocument({
      organizationSlug: "acme",
      voice: VOICE,
      rules: RULES,
      sourceUrl: "https://example.com",
    });

    expect(isOk(result) && result.value).toEqual({ documentId: "doc_1", revisionId: "rev_2" });
    expect(guidelinesMock.replaceDocument).toHaveBeenCalledWith(
      "acme",
      "doc_1",
      expect.objectContaining({ filename: "setup-wizard-guidance.md" }),
    );
  });

  it("skips the write when the merged content is unchanged", async () => {
    guidelinesMock.listDocuments.mockResolvedValue([
      { id: "doc_1", projectId: null, title: ENGINE_SETUP_DOCUMENT_TITLE, revisionId: "rev_1" },
    ]);
    guidelinesMock.getDocument.mockResolvedValue({ content: "Existing guidance.\n" });

    const result = await upsertSetupGuidelineDocument({
      organizationSlug: "acme",
      voice: null,
      rules: [],
      sourceUrl: "https://example.com",
    });

    expect(isOk(result) && result.value).toEqual({ documentId: "doc_1", revisionId: null });
    expect(guidelinesMock.replaceDocument).not.toHaveBeenCalled();
    expect(guidelinesMock.uploadDocument).not.toHaveBeenCalled();
  });

  it("maps content that exceeds the size limit", async () => {
    guidelinesMock.listDocuments.mockResolvedValue([]);
    const tooLong = "Warm and direct. ".repeat(10_000);

    const result = await upsertSetupGuidelineDocument({
      organizationSlug: "acme",
      voice: { ...VOICE, summary: tooLong },
      rules: RULES,
      sourceUrl: "https://example.com",
    });

    expect(isErr(result) && result.error).toEqual({ code: "setup_document_too_long" });
    expect(guidelinesMock.uploadDocument).not.toHaveBeenCalled();
  });
});
