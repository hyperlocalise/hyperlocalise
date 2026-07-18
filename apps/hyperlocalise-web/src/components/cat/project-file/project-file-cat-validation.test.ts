import { describe, expect, it, vi } from "vite-plus/test";

import { getIntlShape } from "@/lib/app-i18n/intl";

import { fetchCatSegmentValidation } from "./project-file-cat-validation";

const testIntl = getIntlShape("en");

describe("fetchCatSegmentValidation", () => {
  it("returns no checks while go-svc validation is disabled", async () => {
    const fetcher = vi.fn();

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello {name}",
        targetText: "Bonjour {name}",
        sourcePath: "/messages/en.json",
        maxLength: 40,
        intl: testIntl,
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
