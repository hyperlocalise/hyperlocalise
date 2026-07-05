import { describe, expect, it, vi } from "vite-plus/test";

import { fetchCatSegmentValidation } from "./project-file-cat-validation";

describe("fetchCatSegmentValidation", () => {
  it("posts the segment and all QA modes to go-svc", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          checks: [
            {
              id: "format-parity",
              label: "Placeholders & ICU",
              status: "pass",
              message: "Target keeps the required placeholders and ICU structure.",
              category: "placeholder",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello {name}",
        targetText: "Bonjour {name}",
        sourcePath: "/messages/en.json",
        maxLength: 40,
      },
      fetcher,
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: [expect.objectContaining({ id: "format-parity", status: "pass" })],
      }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/api/go-svc/v1/validate/segment",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          sourceText: "Hello {name}",
          targetText: "Bonjour {name}",
          sourcePath: "/messages/en.json",
          maxLength: 40,
          modes: ["not_localized", "whitespace_only", "same_as_source"],
        }),
      }),
    );
  });

  it("rejects malformed service responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ checks: [{ status: "unknown" }] }), { status: 200 }),
      );

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "/messages/en.json",
      },
      fetcher,
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid_response" }),
      }),
    );
  });

  it("returns an aborted result when the request is cancelled", async () => {
    const abortController = new AbortController();
    const fetcher = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      abortController.abort();
      init.signal?.throwIfAborted();
      return new Response();
    });

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "/messages/en.json",
        signal: abortController.signal,
      },
      fetcher,
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: { code: "aborted" },
      }),
    );
  });
});
