import { describe, expect, it, vi } from "vite-plus/test";

const generateTextMock = vi.fn();
const loadOrganizationTranslationModelMock = vi.fn();
const assembleStringTranslationContextSnapshotMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("./load-organization-translation-generator", () => ({
  loadOrganizationTranslationModel: (...args: unknown[]) =>
    loadOrganizationTranslationModelMock(...args),
}));

vi.mock("./assemble-translation-context", () => ({
  assembleStringTranslationContextSnapshot: (...args: unknown[]) =>
    assembleStringTranslationContextSnapshotMock(...args),
}));

import { generateCatAiRecommendation } from "./generate-cat-ai-recommendation";

describe("generateCatAiRecommendation", () => {
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

    const result = await generateCatAiRecommendation({
      projectId: "proj_1",
      organizationId: "org_1",
      sourcePath: "en-US.json",
      filename: "en-US.json",
      sourceLocale: "en-US",
      targetLocale: "vi",
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
        prompt: expect.stringContaining("Heading on the sign-in screen"),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Hero title on the sign-in page."),
      }),
    );
  });

  it("maps model setup failures to a result error", async () => {
    loadOrganizationTranslationModelMock.mockResolvedValue({
      ok: false,
      code: "provider_credential_missing",
      message: "no organization provider credential or managed translation model is configured",
    });

    const result = await generateCatAiRecommendation({
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
        code: "provider_credential_missing",
        message: "no organization provider credential or managed translation model is configured",
      },
    });
  });
});
