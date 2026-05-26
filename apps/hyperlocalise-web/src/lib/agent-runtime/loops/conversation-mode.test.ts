import { describe, expect, it } from "vite-plus/test";

import {
  buildConversationModeInstructions,
  classifyConversationMode,
  conversationModeRequiresPullRequestContext,
} from "./conversation-mode";

describe("conversation mode", () => {
  it("classifies find-context requests as repository mode", () => {
    expect(
      classifyConversationMode("Can you find the context of the text 'Email agent' in our github"),
    ).toBe("repository");
    expect(buildConversationModeInstructions("repository")).toContain("find repository context");
  });

  it("classifies translation requests as translation mode", () => {
    expect(classifyConversationMode("Translate this JSON file to French")).toBe("translation");
    expect(buildConversationModeInstructions("translation")).toContain("createTranslationJob");
  });

  it("classifies pull request URLs as repository mode", () => {
    expect(classifyConversationMode("Can you check https://github.com/acme/web/pull/42")).toBe(
      "repository",
    );
    expect(
      conversationModeRequiresPullRequestContext(
        "Can you check https://github.com/acme/web/pull/42",
        "repository",
      ),
    ).toBe(true);
  });

  it("does not treat standalone run plus hl as repository mode", () => {
    expect(classifyConversationMode("Run a translation job in HL")).toBe("translation");
  });
});
