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
  normalizeProjectFileContent,
  parseSourceStringsFromFileContent,
} from "./project-file-content";

describe("project-file-source-strings", () => {
  it("parses structured sourceStrings from stored JSON text", () => {
    const content = {
      text: JSON.stringify({
        sourceStrings: {
          truncated: false,
          entries: [{ key: "app.title", text: "Hello", context: null }],
        },
      }),
    };

    expect(parseSourceStringsFromFileContent(content)?.entries[0]?.key).toBe("app.title");
    expect(normalizeProjectFileContent(content)).toEqual({
      sourceStrings: {
        truncated: false,
        entries: [{ key: "app.title", text: "Hello", context: null }],
      },
    });
  });

  it("parses legacy Crowdin preview JSON with strings array", () => {
    const content = {
      text: JSON.stringify({
        provider: "crowdin",
        resource: "source_strings",
        strings: [{ key: "legacy.key", text: "Legacy", context: "Note" }],
      }),
    };

    expect(parseSourceStringsFromFileContent(content)?.entries[0]?.key).toBe("legacy.key");
    expect(normalizeProjectFileContent(content)?.sourceStrings?.entries[0]?.key).toBe("legacy.key");
  });
});
