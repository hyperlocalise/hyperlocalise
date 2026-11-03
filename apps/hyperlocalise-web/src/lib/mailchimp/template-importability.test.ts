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

import {
  isMailchimpTemplateImportable,
  summarizeMailchimpUnsupportedTemplates,
} from "./template-importability";

describe("isMailchimpTemplateImportable", () => {
  it("allows html user templates", () => {
    expect(
      isMailchimpTemplateImportable({
        id: 42,
        name: "Welcome",
        type: "user",
        content_type: "html",
      }),
    ).toBe(true);
  });

  it("summarizes unsupported templates in one line", () => {
    expect(summarizeMailchimpUnsupportedTemplates([])).toBeNull();
    expect(summarizeMailchimpUnsupportedTemplates([{ name: "The Care Guide" }])).toContain(
      "The Care Guide",
    );
    expect(summarizeMailchimpUnsupportedTemplates([{ name: "A" }, { name: "B" }])).toContain(
      "2 drag-and-drop",
    );
  });

  it("rejects drag-and-drop user templates", () => {
    expect(
      isMailchimpTemplateImportable({
        id: 10000141,
        name: "The Care Guide",
        type: "user",
        content_type: "template",
        drag_and_drop: true,
      }),
    ).toBe(false);
  });
});
