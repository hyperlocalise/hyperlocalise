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
const steps = [{ model: { provider: "gateway", modelId: "openai/gpt-6-luna" } }];

describe("localizeAndStoreDocumentVariant metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceImageVariantBytesMock.mockResolvedValue({ ok: true, value: { id: "variant_1" } });
  });

  it("records the regenerated document's tokens", async () => {
    generateTextMock.mockResolvedValue({ text: "# Bonjour", finishReason: "stop", usage, steps });

    const result = await localizeAndStoreDocumentVariant(input);

    expect(result.ok).toBe(true);
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith({
      organizationId: "org_1",
      source: "content_editor_document_regenerate",
      tokenUsage: usage,
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway",
    });
  });

  it("records tokens for a truncated document that is not stored", async () => {
    generateTextMock.mockResolvedValue({ text: "# Bon", finishReason: "length", usage, steps });

    const result = await localizeAndStoreDocumentVariant(input);

    expect(result.ok).toBe(false);
    expect(replaceImageVariantBytesMock).not.toHaveBeenCalled();
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledTimes(1);
  });
});
