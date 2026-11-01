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

import { applyJsonIngestEntries, jsonKeyMatches } from "./json-ingest-entries";
import { defaultRepositorySourceFileImportSettings } from "./source-file-import-settings-schema";

describe("jsonKeyMatches", () => {
  it("matches exact, single-segment, and rest-of-path patterns", () => {
    expect(jsonKeyMatches("messages.title", "messages.title")).toBe(true);
    expect(jsonKeyMatches("messages.title", "messages.*")).toBe(true);
    expect(jsonKeyMatches("messages.title.sub", "messages.*")).toBe(false);
    expect(jsonKeyMatches("messages.title.sub", "messages.**")).toBe(true);
    expect(jsonKeyMatches("home[0].title", "home.*.title")).toBe(true);
  });
});

describe("applyJsonIngestEntries", () => {
  it("filters key paths and copies sibling context and character limits", () => {
    const settings = defaultRepositorySourceFileImportSettings().json;
    const payload = applyJsonIngestEntries(
      "locales/en.json",
      JSON.stringify({
        welcome: {
          text: "Hello {name}",
          description: "Home greeting",
          maxLength: 40,
        },
        debug: { text: "secret" },
        about: { html: "<p>About us</p>", note: "footer" },
      }),
      { leftover: "from cli" },
      {
        ...settings,
        keyPaths: ["*.text", "*.html"],
        excludeKeyPaths: ["debug.**"],
        contextFields: ["description", "note"],
        characterLimitFields: ["maxLength"],
        htmlSubfilter: true,
        icuSubfilter: true,
      },
    );

    expect(payload).toEqual({
      "welcome.text": {
        text: "Hello {name}",
        context: "Home greeting",
        maxLength: 40,
        format: "icu",
      },
      "about.html": { text: "<p>About us</p>", context: "footer", format: "html" },
    });
  });

  it("keeps the CLI snapshot when key-path filters match no strings", () => {
    const settings = defaultRepositorySourceFileImportSettings().json;
    const cliPayload = { "welcome.text": "Hello", leftover: "from cli" };

    expect(
      applyJsonIngestEntries(
        "locales/en.json",
        JSON.stringify({ welcome: { text: "Hello" }, leftover: "from cli" }),
        cliPayload,
        { ...settings, keyPaths: ["messages.**"] },
      ),
    ).toEqual(cliPayload);
  });

  it("keeps the CLI snapshot when the JSON root is an array", () => {
    const settings = defaultRepositorySourceFileImportSettings().json;
    const cliPayload = { "0": "Hello", "1": "World" };

    expect(
      applyJsonIngestEntries("locales/en.json", JSON.stringify(["Hello", "World"]), cliPayload, {
        ...settings,
        icuSubfilter: true,
      }),
    ).toEqual(cliPayload);
  });
});
