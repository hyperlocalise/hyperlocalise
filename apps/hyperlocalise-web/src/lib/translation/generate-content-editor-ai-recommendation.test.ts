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

const generateTextMock = vi.fn();
const loadOrganizationTranslationModelMock = vi.fn();
const assembleStringTranslationContextSnapshotMock = vi.fn();
const trackAiCallTokenUsageMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("./context", () => ({
  assembleStringTranslationContextSnapshot: (...args: unknown[]) =>
    assembleStringTranslationContextSnapshotMock(...args),
}));

vi.mock("./generation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./generation")>();
  return {
    ...actual,
    loadOrganizationTranslationModel: (...args: unknown[]) =>
      loadOrganizationTranslationModelMock(...args),
  };
});

vi.mock("@/lib/billing/agent-runtime-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/agent-runtime-usage")>();
  return {
    ...actual,
    trackAiCallTokenUsage: (...args: unknown[]) => trackAiCallTokenUsageMock(...args),
  };
});

import { generateContentEditorAiRecommendation } from "./content-editor-core";

const meteringInput = {
  projectId: "proj_1",
  organizationId: "org_1",
  sourcePath: "en-US.json",
  filename: "en-US.json",
  sourceLocale: "en-US",
  targetLocale: "de",
  key: "settings.save",
  sourceText: "Save",
  targetText: "",
};

function mockMeteringModelAndContext() {
  loadOrganizationTranslationModelMock.mockResolvedValue({
    ok: true,
    project: { name: "Hyperlocalise", translationContext: "" },
    model: {},
    modelId: "anthropic/claude-sonnet-5.5",
    credentialSource: "byok",
  });
  assembleStringTranslationContextSnapshotMock.mockResolvedValue({
    ok: true,
    snapshot: {
      project: { id: "proj_1", name: "Hyperlocalise", translationContext: "" },
      glossaryTerms: [],
      translationMemoryMatches: [],
    },
  });
}

describe("generateContentEditorAiRecommendation metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMeteringModelAndContext();
  });

  it("records the suggestion's tokens against the workspace's model", async () => {
    generateTextMock.mockResolvedValue({
      output: { suggestion: "Speichern", reasoning: "Standard UI verb." },
      usage: { inputTokens: 1200, outputTokens: 30, totalTokens: 1230 },
    });

    const result = await generateContentEditorAiRecommendation(meteringInput);

    expect(result.ok).toBe(true);
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith(
      {
        organizationId: "org_1",
        source: "content_editor_ai_suggestion",
        tokenUsage: { inputTokens: 1200, outputTokens: 30, totalTokens: 1230 },
        modelId: "anthropic/claude-sonnet-5.5",
        credentialSource: "byok",
      },
      { defer: undefined },
    );
  });

  it("still records tokens when the suggestion is rejected after the call", async () => {
    generateTextMock.mockResolvedValue({
      output: { suggestion: "Einstellungen speichern", reasoning: "Too long." },
      usage: { inputTokens: 800, outputTokens: 20, totalTokens: 820 },
    });

    const result = await generateContentEditorAiRecommendation({ ...meteringInput, maxLength: 5 });

    expect(result.ok).toBe(false);
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledTimes(1);
  });

  it("names the caller's source when one is given", async () => {
    generateTextMock.mockResolvedValue({
      output: { suggestion: "Speichern", reasoning: "Standard UI verb." },
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    });

    await generateContentEditorAiRecommendation(meteringInput, {
      usageSource: "workspace_crowdin_review_suggestion",
    });

    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "workspace_crowdin_review_suggestion" }),
      { defer: undefined },
    );
  });

  it("hands the charge to the route to run after the response", async () => {
    generateTextMock.mockResolvedValue({
      output: { suggestion: "Speichern", reasoning: "Standard UI verb." },
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    });
    const deferBilling = vi.fn();

    await generateContentEditorAiRecommendation(meteringInput, { deferBilling });

    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith(expect.anything(), {
      defer: deferBilling,
    });
  });

  it("records nothing when the model call fails", async () => {
    generateTextMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await generateContentEditorAiRecommendation(meteringInput);

    expect(result.ok).toBe(false);
    expect(trackAiCallTokenUsageMock).not.toHaveBeenCalled();
  });
});

describe("generateContentEditorAiRecommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a recommendation using file and agent context", async () => {
    loadOrganizationTranslationModelMock.mockResolvedValue({
      ok: true,
      project: {
        name: "Hyperlocalise",
        translationContext: "Use concise product UI language.",
      },
      model: {},
    });
    assembleStringTranslationContextSnapshotMock.mockResolvedValue({
      ok: true,
      snapshot: {
        project: {
          id: "proj_1",
          name: "Hyperlocalise",
          translationContext: "Use concise product UI language.",
        },
        glossaryTerms: [],
        translationMemoryMatches: [],
      },
    });
    generateTextMock.mockResolvedValue({
      output: {
        suggestion: "Dang nhap vao khong gian lam viec",
        reasoning: "Matches the sign-in screen tone and keeps the workspace metaphor.",
      },
    });

    const result = await generateContentEditorAiRecommendation({
      projectId: "proj_1",
      organizationId: "org_1",
      sourcePath: "en-US.json",
      filename: "en-US.json",
      sourceLocale: "en-US",
      targetLocale: "vi",
      displayLocale: "en",
      key: "auth.signIn.title",
      sourceText: "Sign in to your workspace",
      targetText: "",
      context: "Heading on the sign-in screen",
      agentContext: "Hero title on the sign-in page.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        aiSuggestion: "Dang nhap vao khong gian lam viec",
        aiReasoning: "Matches the sign-in screen tone and keeps the workspace metaphor.",
      });
    }

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("Heading on the sign-in screen"),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("Hero title on the sign-in page."),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "Write the reasoning in the reviewer's display locale (en), not in the target translation locale.",
        ),
        prompt: expect.stringContaining("Reviewer display locale: en"),
      }),
    );
  });

  it("defaults reasoning display locale to en when omitted", async () => {
    loadOrganizationTranslationModelMock.mockResolvedValue({
      ok: true,
      project: {
        name: "Hyperlocalise",
        translationContext: "Use concise product UI language.",
      },
      model: {},
    });
    assembleStringTranslationContextSnapshotMock.mockResolvedValue({
      ok: true,
      snapshot: {
        project: {
          id: "proj_1",
          name: "Hyperlocalise",
          translationContext: "Use concise product UI language.",
        },
        glossaryTerms: [],
        translationMemoryMatches: [],
      },
    });
    generateTextMock.mockResolvedValue({
      output: {
        suggestion: "Bonjour",
        reasoning: "Natural French greeting.",
      },
    });

    const result = await generateContentEditorAiRecommendation({
      projectId: "proj_1",
      organizationId: "org_1",
      sourcePath: "en-US.json",
      filename: "en-US.json",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      key: "greeting",
      sourceText: "Hello",
    });

    expect(result.ok).toBe(true);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "Write the reasoning in the reviewer's display locale (en), not in the target translation locale.",
        ),
        prompt: expect.stringContaining("Reviewer display locale: en"),
      }),
    );
  });

  it("maps model setup failures to a result error", async () => {
    loadOrganizationTranslationModelMock.mockResolvedValue({
      ok: false,
      code: "translation_project_not_found",
      message: "translation project proj_1 was not found",
    });

    const result = await generateContentEditorAiRecommendation({
      projectId: "proj_1",
      organizationId: "org_1",
      sourcePath: "en-US.json",
      filename: "en-US.json",
      sourceLocale: "en-US",
      targetLocale: "vi",
      key: "auth.signIn.title",
      sourceText: "Sign in to your workspace",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "translation_project_not_found",
        message: "translation project proj_1 was not found",
      },
    });
  });

  it("passes an abort signal to generateText", async () => {
    const abortSignal = new AbortController().signal;
    loadOrganizationTranslationModelMock.mockResolvedValue({
      ok: true,
      project: {
        name: "Hyperlocalise",
        translationContext: "Use concise product UI language.",
      },
      model: {},
    });
    assembleStringTranslationContextSnapshotMock.mockResolvedValue({
      ok: true,
      snapshot: {
        project: {
          id: "proj_1",
          name: "Hyperlocalise",
          translationContext: "Use concise product UI language.",
        },
        glossaryTerms: [],
        translationMemoryMatches: [],
      },
    });
    generateTextMock.mockResolvedValue({
      output: {
        suggestion: "Bonjour",
        reasoning: "Natural French greeting.",
      },
    });

    await generateContentEditorAiRecommendation(
      {
        projectId: "proj_1",
        organizationId: "org_1",
        sourcePath: "en-US.json",
        filename: "en-US.json",
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        key: "greeting",
        sourceText: "Hello",
      },
      { signal: abortSignal },
    );

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal,
      }),
    );
  });

  it("rethrows abort errors from generateText", async () => {
    loadOrganizationTranslationModelMock.mockResolvedValue({
      ok: true,
      project: {
        name: "Hyperlocalise",
        translationContext: "Use concise product UI language.",
      },
      model: {},
    });
    assembleStringTranslationContextSnapshotMock.mockResolvedValue({
      ok: true,
      snapshot: {
        project: {
          id: "proj_1",
          name: "Hyperlocalise",
          translationContext: "Use concise product UI language.",
        },
        glossaryTerms: [],
        translationMemoryMatches: [],
      },
    });
    generateTextMock.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    await expect(
      generateContentEditorAiRecommendation(
        {
          projectId: "proj_1",
          organizationId: "org_1",
          sourcePath: "en-US.json",
          filename: "en-US.json",
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          key: "greeting",
          sourceText: "Hello",
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
