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

import { generateCatAiRecommendation } from "./cat";

describe("generateCatAiRecommendation", () => {
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

    const result = await generateCatAiRecommendation({
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
        system: expect.stringContaining("Heading on the sign-in screen"),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("Hero title on the sign-in page."),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
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

    const result = await generateCatAiRecommendation({
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
        system: expect.stringContaining(
          "Write the reasoning in the reviewer's display locale (en), not in the target translation locale.",
        ),
        prompt: expect.stringContaining("Reviewer display locale: en"),
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
