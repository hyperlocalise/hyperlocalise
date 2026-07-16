import { describe, expect, it } from "vite-plus/test";

import { buildCrowdinAppManifest } from "./manifest";

describe("buildCrowdinAppManifest", () => {
  it("exposes the inbox in the project menu and editor right panel", () => {
    const manifest = buildCrowdinAppManifest();

    expect(manifest.modules["project-menu"]).toEqual([
      {
        key: "inbox",
        name: "Hyperlocalise",
        url: "/crowdin-app/inbox",
      },
    ]);
    expect(manifest.modules["editor-right-panel"]).toEqual([
      {
        key: "inbox-editor",
        name: "Hyperlocalise",
        modes: ["translate"],
        supportsMultipleStrings: false,
        url: "/crowdin-app/inbox",
      },
    ]);
  });
});
