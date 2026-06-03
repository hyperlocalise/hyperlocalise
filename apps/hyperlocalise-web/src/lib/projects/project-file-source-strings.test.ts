import { describe, expect, it } from "vite-plus/test";

import {
  normalizeProjectFileContent,
  parseSourceStringsFromFileContent,
} from "./project-file-source-strings";

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
