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
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

describe("content editor document story assets", () => {
  it("keeps fixtures off Vercel-ignored MSW handlers", () => {
    const fixtureSource = readFileSync(
      new URL("./content-editor-file-view.fixture.ts", import.meta.url),
      "utf8",
    );
    expect(fixtureSource).not.toMatch(/content-editor-document-msw-handlers/);
  });
});
