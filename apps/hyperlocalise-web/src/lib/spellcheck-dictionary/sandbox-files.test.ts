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

import { buildSandboxSpellcheckDictionaryFiles } from "./sandbox-files";

describe("buildSandboxSpellcheckDictionaryFiles", () => {
  it("writes one locale file under the sandbox dictionary directory", () => {
    expect(
      buildSandboxSpellcheckDictionaryFiles({
        "en-US": ["Hyperlocalise", "AuthKit"],
        "de-DE": [],
        "../en-US": ["nope"],
      }),
    ).toEqual({
      directory: ".hl-sandbox-dictionaries",
      files: [
        {
          path: ".hl-sandbox-dictionaries/en-US.txt",
          content: "Hyperlocalise\nAuthKit\n",
        },
      ],
    });
  });
});
