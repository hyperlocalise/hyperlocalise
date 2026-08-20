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

import { extractWorkspaceAutomationKnowledgeText } from "./workspace-automation-knowledge-text";

describe("workspace automation knowledge text", () => {
  it("extracts and truncates plain text files", async () => {
    const extracted = await extractWorkspaceAutomationKnowledgeText({
      filename: "faq.md",
      contentType: "text/markdown",
      content: Buffer.from("# Shipping\n\nOrders leave within two days."),
    });

    expect(extracted).toMatchObject({
      format: "text",
      truncated: false,
      text: "# Shipping\n\nOrders leave within two days.",
    });
  });
});
