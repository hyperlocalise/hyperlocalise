import { describe, expect, it, vi } from "vite-plus/test";

import { fetchCatSegmentValidation } from "./project-file-cat-validation";

describe("fetchCatSegmentValidation", () => {
  it("returns no checks while go-svc validation is disabled", async () => {
    const fetcher = vi.fn();

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello {name}",
        targetText: "Bonjour {name}",
        sourcePath: "/messages/en.json",
        maxLength: 40,
      },
      fetcher,
    );

    expect(result).toEqual({
      ok: true,
      value: [],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
