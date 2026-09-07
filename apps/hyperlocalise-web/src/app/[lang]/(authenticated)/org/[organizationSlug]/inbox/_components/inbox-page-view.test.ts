/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { inboxChatSplitPaneClassName } from "./inbox-chat-split-pane";

describe("inboxChatSplitPaneClassName", () => {
  it("gives the chat pane a shrinkable remaining-height track", () => {
    const className = inboxChatSplitPaneClassName(false);

    expect(className).toContain("grid");
    expect(className).toContain("h-full");
    expect(className).toContain("min-h-0");
    expect(className).toContain("overflow-hidden");
    expect(className).toContain("grid-rows-[auto_minmax(0,1fr)]");
    expect(className).toContain("lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]");
  });

  it("narrows the list column when the inbox is sparse", () => {
    expect(inboxChatSplitPaneClassName(true)).toContain(
      "lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)]",
    );
  });
});
