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
import { generateText } from "ai";
import { extractImageText } from "./image-text-extraction";

vi.mock("ai", () => ({ generateText: vi.fn(), Output: { object: vi.fn((input) => input) } }));
vi.mock("@/lib/providers/language-model", () => ({
  getManagedLanguageModel: () => "managed-vision-model",
}));
vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  withAgentRuntimeUsageMetering: async ({ run }: { run: () => Promise<unknown> }) => run(),
}));
const input = {
  content: new Uint8Array([1, 2, 3]),
  contentType: "image/png",
  organizationId: "org",
  fileId: "file",
};
afterEach(() => vi.clearAllMocks());
describe("image text extraction", () => {
  it("assigns stable stored region IDs and passes image bytes and cancellation", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { regions: [{ text: "Hello", bounds: { x: 0.1, y: 0.2, width: 0.4, height: 0.1 } }] },
    } as never);
    const signal = new AbortController().signal;
    const result = await extractImageText({ ...input, signal });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected extraction");
    expect(result.value[0]).toMatchObject({ text: "Hello", translations: {} });
    expect(result.value[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: signal,
        messages: [
          {
            role: "user",
            content: [{ type: "image", image: input.content, mediaType: "image/png" }],
          },
        ],
      }),
    );
  });
  it("accepts a successful image with no text", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { regions: [] } } as never);
    expect(await extractImageText(input)).toEqual({ ok: true, value: [] });
  });
  it("returns a stable error for provider failures and invalid bounds", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error("provider details"));
    expect(await extractImageText(input)).toEqual({
      ok: false,
      error: { code: "image_text_extraction_failed" },
    });
    vi.mocked(generateText).mockResolvedValue({
      output: { regions: [{ text: "bad", bounds: { x: 0.9, y: 0, width: 0.5, height: 1 } }] },
    } as never);
    expect((await extractImageText(input)).ok).toBe(false);
  });
});
