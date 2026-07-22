/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
  it("shows only the find-context chip without page context", () => {
    const suggestions = buildChatDockSuggestions(null, formatMessage);

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual(["find-context"]);
    expect(suggestions[0]?.label).toBe("What's the context of a string");
    expect(suggestions[0]?.prompt).toBe("What's the context of ");
  });

  it("shows only the selected segment chip using the source string", () => {
    const pageContext: ChatDockPageContext = {
      kind: "cat-segment",
      segmentId: "seg-02",
      key: "checkout.submit",
      sourceText: "Submit order",
    };

    const suggestions = buildChatDockSuggestions(pageContext, formatMessage);

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual(["segment-context"]);
    expect(suggestions[0]?.label).toBe("Context of Submit order");
    expect(suggestions[0]?.prompt).toBe('What\'s the context of "Submit order"?');
  });

  it("truncates long source strings in the pill label only", () => {
    const longSource = "a".repeat(50);
    const pageContext: ChatDockPageContext = {
      kind: "cat-segment",
      segmentId: "seg-02",
      key: "checkout.submit",
      sourceText: longSource,
    };

    const suggestions = buildChatDockSuggestions(pageContext, formatMessage);

    expect(suggestions[0]?.label).toBe(`Context of ${"a".repeat(35)}…`);
    expect(suggestions[0]?.prompt).toBe(`What's the context of "${longSource}"?`);
  });
});
