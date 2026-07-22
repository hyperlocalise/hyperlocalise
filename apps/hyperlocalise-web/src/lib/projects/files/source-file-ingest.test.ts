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

import { entriesFromHlOutput } from "@/lib/projects/files/source-file-ingest";

describe("entriesFromHlOutput", () => {
  it("maps hl entries output into project source string entries", () => {
    expect(
      entriesFromHlOutput({
        "greeting.title": "Hello",
        "greeting.subtitle": "Welcome",
      }),
    ).toEqual([
      {
        key: "greeting.title",
        text: "Hello",
        context: null,
        type: "string",
      },
      {
        key: "greeting.subtitle",
        text: "Welcome",
        context: null,
        type: "string",
      },
    ]);
  });

  it("drops blank keys and empty values", () => {
    expect(
      entriesFromHlOutput({
        "": "ignored",
        "valid.key": "   ",
        "kept.key": "Value",
      }),
    ).toEqual([
      {
        key: "kept.key",
        text: "Value",
        context: null,
        type: "string",
      },
    ]);
  });
});
