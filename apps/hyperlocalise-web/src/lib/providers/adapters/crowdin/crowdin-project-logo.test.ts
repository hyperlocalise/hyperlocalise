import { describe, expect, it } from "vite-plus/test";

import { sanitizeCrowdinProjectLogo } from "./crowdin-project-logo";

describe("sanitizeCrowdinProjectLogo", () => {
  it("accepts safe data image URLs", () => {
    expect(sanitizeCrowdinProjectLogo("data:image/png;base64,abc123+/=")).toBe(
      "data:image/png;base64,abc123+/=",
    );
  });

  it("rejects data image URLs with whitespace in the base64 payload", () => {
    expect(sanitizeCrowdinProjectLogo("data:image/png;base64,abc 123")).toBeNull();
  });

  it("accepts https logo URLs", () => {
    expect(sanitizeCrowdinProjectLogo("https://crowdin.com/logo.png")).toBe(
      "https://crowdin.com/logo.png",
    );
  });

  it("rejects unsafe protocols", () => {
    expect(sanitizeCrowdinProjectLogo("javascript:alert(1)")).toBeNull();
  });
});
