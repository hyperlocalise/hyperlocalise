import { describe, expect, it } from "vite-plus/test";
import type { MessageDescriptor } from "react-intl";

import { buildChatDockSuggestions } from "./chat-dock-empty-state";
import type { ChatDockPageContext } from "./chat-dock-store";

function formatMessage(descriptor: MessageDescriptor, values?: Record<string, string>) {
  let message = typeof descriptor.defaultMessage === "string" ? descriptor.defaultMessage : "";
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      message = message.replace(`{${key}}`, value);
    }
  }
  return message;
}

describe("buildChatDockSuggestions", () => {
  it("uses the generic find-context chip without page context", () => {
    const suggestions = buildChatDockSuggestions(null, formatMessage);

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "find-context",
      "recent-changes",
      "progress",
      "translate",
    ]);
    expect(suggestions[0]?.prompt).toBe("What does this string mean, and where is it used?");
  });

  it("replaces find-context with the selected segment chip", () => {
    const pageContext: ChatDockPageContext = {
      kind: "cat-segment",
      segmentId: "seg-02",
      key: "checkout.submit",
      sourceText: "Submit order",
    };

    const suggestions = buildChatDockSuggestions(pageContext, formatMessage);

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "segment-context",
      "recent-changes",
      "progress",
      "translate",
    ]);
    expect(suggestions[0]?.label).toBe("Context of checkout.submit");
    expect(suggestions[0]?.prompt).toBe('What\'s the context of "checkout.submit"?');
  });

  it("truncates long keys in the pill label only", () => {
    const longKey = "a".repeat(50);
    const pageContext: ChatDockPageContext = {
      kind: "cat-segment",
      segmentId: "seg-02",
      key: longKey,
      sourceText: "Submit",
    };

    const suggestions = buildChatDockSuggestions(pageContext, formatMessage);

    expect(suggestions[0]?.label).toBe(`Context of ${"a".repeat(35)}…`);
    expect(suggestions[0]?.prompt).toBe(`What's the context of "${longKey}"?`);
  });
});
