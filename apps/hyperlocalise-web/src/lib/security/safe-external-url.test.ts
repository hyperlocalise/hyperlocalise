import { describe, expect, it } from "vite-plus/test";

import { sanitizeExternalUrl } from "./safe-external-url";

describe("sanitizeExternalUrl", () => {
  it("allows https URLs without credentials", () => {
    expect(sanitizeExternalUrl("https://crowdin.com/project/example")).toBe(
      "https://crowdin.com/project/example",
    );
  });

  it("rejects javascript URLs", () => {
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects credentialed URLs", () => {
    expect(sanitizeExternalUrl("https://user:pass@example.test/project")).toBeNull();
  });
});
