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

import { ok } from "@/lib/primitives/result/results";

import { createCrowdinReviewTools } from "./crowdin-review-tools";

const mocks = vi.hoisted(() => ({
  searchConcordanceForAgent: vi.fn(),
  loadStyleGuideForAgent: vi.fn(),
  generateCatAiRecommendation: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-provider", () => ({
  crowdinTmsProvider: {
    searchConcordanceForAgent: (...args: unknown[]) => mocks.searchConcordanceForAgent(...args),
    loadStyleGuideForAgent: (...args: unknown[]) => mocks.loadStyleGuideForAgent(...args),
  },
}));

vi.mock("@/lib/translation/cat", () => ({
  generateCatAiRecommendation: (...args: unknown[]) => mocks.generateCatAiRecommendation(...args),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: (...args: unknown[]) => mocks.select(...args),
  },
  schema: {
    projects: {
      name: "name",
      translationContext: "translation_context",
      organizationId: "organization_id",
      id: "id",
    },
  },
}));

describe("createCrowdinReviewTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([
      { name: "Marketing", translationContext: "Use sentence case." },
    ]);
  });

  it("searches concordance through the Crowdin provider", async () => {
    mocks.searchConcordanceForAgent.mockResolvedValue(
      ok({
        crowdinProjectId: 42,
        glossaryMatches: [],
        translationMemoryMatches: [],
      }),
    );
    const tools = createCrowdinReviewTools({
      organizationId: "org-1",
      projectId: "ext:crowdin:42",
      actorUserId: "user-1",
    });

    const result = await tools.search_concordance.execute!(
      {
        expressions: ["Save"],
        sourceLocale: "en",
        targetLocale: "de",
      },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(mocks.searchConcordanceForAgent).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "ext:crowdin:42",
      sourceLocale: "en",
      targetLocale: "de",
      expressions: ["Save"],
    });
    expect(result).toMatchObject({ success: true, crowdinProjectId: 42 });
  });

  it("loads project translation context with Crowdin style prompts", async () => {
    mocks.loadStyleGuideForAgent.mockResolvedValue(
      ok({
        crowdinProjectId: 42,
        prompts: [{ id: 1, name: "Brand voice", action: "assist", prompt: "Keep it short." }],
      }),
    );
    const tools = createCrowdinReviewTools({
      organizationId: "org-1",
      projectId: "ext:crowdin:42",
      actorUserId: "user-1",
    });

    const result = await tools.get_style_guide.execute!(
      {},
      { toolCallId: "call-2", messages: [], context: {} },
    );

    expect(result).toMatchObject({
      success: true,
      projectName: "Marketing",
      translationContext: "Use sentence case.",
      prompts: [{ id: 1, name: "Brand voice" }],
    });
  });

  it("recommends a translation through the CAT engine", async () => {
    mocks.generateCatAiRecommendation.mockResolvedValue(
      ok({ aiSuggestion: "Speichern", aiReasoning: "Glossary prefers Speichern." }),
    );
    const tools = createCrowdinReviewTools({
      organizationId: "org-1",
      projectId: "ext:crowdin:42",
      actorUserId: "user-1",
    });

    const result = await tools.recommend_translation.execute!(
      {
        sourceText: "Save",
        sourceLocale: "en",
        targetLocale: "de",
      },
      { toolCallId: "call-3", messages: [], context: {} },
    );

    expect(mocks.generateCatAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "ext:crowdin:42",
        organizationId: "org-1",
        sourceText: "Save",
        sourceLocale: "en",
        targetLocale: "de",
      }),
    );
    expect(result).toEqual({
      success: true,
      suggestion: "Speichern",
      reasoning: "Glossary prefers Speichern.",
    });
  });
});
