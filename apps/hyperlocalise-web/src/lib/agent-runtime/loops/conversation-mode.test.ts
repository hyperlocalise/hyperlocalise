import { describe, expect, it } from "vite-plus/test";

import { buildConversationModeInstructions } from "./conversation-mode";

describe("conversation mode instructions", () => {
  it("describes repository lookup behavior", () => {
    expect(buildConversationModeInstructions("repository")).toContain("find localization context");
    expect(buildConversationModeInstructions("repository")).toContain("placeholder");
  });

  it("describes file translation behavior", () => {
    expect(buildConversationModeInstructions("translation")).toContain("createTranslationJob");
  });
});
