import { describe, expect, it } from "vite-plus/test";

import { PRODUCTION_HYPERLOCALISE_APP_URL, hyperlocaliseAppUrlForMode } from "../vite/app-url";

describe("hyperlocaliseAppUrlForMode", () => {
  it("embeds the hosted app in production builds", () => {
    expect(hyperlocaliseAppUrlForMode("production")).toBe(PRODUCTION_HYPERLOCALISE_APP_URL);
  });

  it("uses localhost for development and tests", () => {
    expect(hyperlocaliseAppUrlForMode("development")).toBe("http://localhost:3000");
    expect(hyperlocaliseAppUrlForMode("test")).toBe("http://localhost:3000");
  });
});
