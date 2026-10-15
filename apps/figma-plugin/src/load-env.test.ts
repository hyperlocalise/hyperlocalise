import { describe, expect, it } from "vite-plus/test";

import {
  PRODUCTION_HYPERLOCALISE_APP_URL,
  resolveHyperlocaliseAppUrlForBuild,
} from "../vite/load-env";

describe("resolveHyperlocaliseAppUrlForBuild", () => {
  it("uses localhost while Vitest is running", () => {
    expect(resolveHyperlocaliseAppUrlForBuild({ isVitest: true })).toBe("http://localhost:3000");
  });

  it("defaults release builds to the hosted app", () => {
    expect(resolveHyperlocaliseAppUrlForBuild({ isVitest: false, envUrl: undefined })).toBe(
      PRODUCTION_HYPERLOCALISE_APP_URL,
    );
    expect(resolveHyperlocaliseAppUrlForBuild({ isVitest: false, envUrl: "  " })).toBe(
      PRODUCTION_HYPERLOCALISE_APP_URL,
    );
  });

  it("honors an explicit app URL", () => {
    expect(
      resolveHyperlocaliseAppUrlForBuild({
        isVitest: false,
        envUrl: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3000");
  });
});
