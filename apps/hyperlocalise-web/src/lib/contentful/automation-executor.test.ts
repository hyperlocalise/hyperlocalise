import { describe, expect, it } from "vite-plus/test";

import { resolveContentfulExecutionTargetLocales } from "./automation-executor";

describe("contentful automation executor", () => {
  it("uses the translation run target locales before falling back to the connection locales", () => {
    expect(
      resolveContentfulExecutionTargetLocales({
        runTargetLocales: ["fr-FR"],
        connectionTargetLocales: ["fr-FR", "de-DE"],
      }),
    ).toEqual(["fr-FR"]);

    expect(
      resolveContentfulExecutionTargetLocales({
        runTargetLocales: [],
        connectionTargetLocales: ["fr-FR", "de-DE"],
      }),
    ).toEqual(["fr-FR", "de-DE"]);
  });
});
