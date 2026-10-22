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

const { generateTextMock, trackAiCallTokenUsageMock, replaceImageVariantBytesMock } = vi.hoisted(
  () => ({
    generateTextMock: vi.fn(),
    trackAiCallTokenUsageMock: vi.fn(),
    replaceImageVariantBytesMock: vi.fn(),
  }),
);

const { resolveModelMock } = vi.hoisted(() => ({ resolveModelMock: vi.fn() }));
vi.mock("@/lib/providers/organization-language-model", () => ({
  resolveHyperlocaliseAgentLanguageModel: resolveModelMock,
}));

vi.mock("ai", () => ({ generateText: generateTextMock }));
vi.mock("@/lib/database/client", () => {
  const query = {
    select: () => query,
    from: () => query,
    where: () => query,
    limit: async () => [{ id: "file_1", contentType: "text/markdown", filename: "intro.md" }],
  };
  return { db: query, schema: { storedFiles: {} } };
});
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/file-storage/records", () => ({
  getStoredFileContent: async () => ({ content: Buffer.from("# Hello\n\nWelcome.") }),
}));
vi.mock("./image-variant-service", () => ({
  getImageVariant: async () => null,
  replaceImageVariantBytes: replaceImageVariantBytesMock,
}));
vi.mock("@/lib/billing/agent-runtime-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/agent-runtime-usage")>();
  return { ...actual, trackAiCallTokenUsage: trackAiCallTokenUsageMock };
});

import { localizeAndStoreDocumentVariant } from "./document-variant-service";

const input = {
  organizationId: "org_1",
  projectId: "proj_1",
  sourcePath: "docs/intro.md",
  targetLocale: "fr",
  sourceLocale: "en",
  sourceStoredFileId: "file_1",
  repositorySourceFileId: "source_file_1",
  provenance: "agent" as const,
};
const usage = { inputTokens: 5_000, outputTokens: 5_200, totalTokens: 10_200 };

describe("localizeAndStoreDocumentVariant metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceImageVariantBytesMock.mockResolvedValue({ ok: true, value: { id: "variant_1" } });
    resolveModelMock.mockResolvedValue({
      model: "openai/gpt-6-luna",
      modelId: "openai/gpt-6-luna",
      source: "gateway",
    });
  });

  it("records the regenerated document's tokens", async () => {
    generateTextMock.mockResolvedValue({ text: "# Bonjour", finishReason: "stop", usage });

    const result = await localizeAndStoreDocumentVariant(input);

    expect(result.ok).toBe(true);
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith(
      {
        organizationId: "org_1",
        source: "content_editor_document_regenerate",
        tokenUsage: usage,
        modelId: "openai/gpt-6-luna",
        credentialSource: "gateway",
      },
      { defer: undefined },
    );
  });

  it("records tokens for a truncated document that is not stored", async () => {
    generateTextMock.mockResolvedValue({ text: "# Bon", finishReason: "length", usage });

    const result = await localizeAndStoreDocumentVariant(input);

    expect(result.ok).toBe(false);
    expect(replaceImageVariantBytesMock).not.toHaveBeenCalled();
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledTimes(1);
  });

  it("records a document regenerated on the workspace's own key at no charge", async () => {
    resolveModelMock.mockResolvedValue({
      model: {},
      modelId: "anthropic/claude-sonnet-4.5",
      source: "anthropic",
    });
    generateTextMock.mockResolvedValue({ text: "# Bonjour", finishReason: "stop", usage });

    await localizeAndStoreDocumentVariant(input);

    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({ model: {} }));
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "anthropic/claude-sonnet-4.5",
        credentialSource: "byok",
      }),
      { defer: undefined },
    );
  });

  it("hands the charge to the route to run after the response", async () => {
    generateTextMock.mockResolvedValue({ text: "# Bonjour", finishReason: "stop", usage });
    const deferBilling = vi.fn();

    await localizeAndStoreDocumentVariant({ ...input, deferBilling });

    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith(expect.anything(), {
      defer: deferBilling,
    });
  });
});
