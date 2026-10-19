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
import { describe, expect, it } from "vitest";

import { extractSanityDocumentSourceMap } from "./extract-source";

describe("extractSanityDocumentSourceMap", () => {
  it("extracts string fields and portable text spans", () => {
    const map = extractSanityDocumentSourceMap({
      i18nMode: "document",
      sourceSanityLocale: "en",
      document: {
        _id: "doc-1",
        _type: "page",
        title: "Welcome",
        body: [
          {
            _type: "block",
            children: [{ _type: "span", text: "Hello" }],
          },
        ],
      },
    });
    expect(map.title).toBe("Welcome");
    expect(map["body.0.children.0.text"]).toBe("Hello");
  });

  it("field-level reads locale slot without locale in keys", () => {
    const map = extractSanityDocumentSourceMap({
      i18nMode: "field",
      sourceSanityLocale: "en",
      document: {
        headline: [
          { language: "en", value: "Hello" },
          { language: "de", value: "Hallo" },
        ],
      },
    });
    expect(map.headline).toBe("Hello");
    expect(map.de).toBeUndefined();
  });
});
