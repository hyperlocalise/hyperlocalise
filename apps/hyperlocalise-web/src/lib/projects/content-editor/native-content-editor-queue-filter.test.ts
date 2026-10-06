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
import { is, SQL, StringChunk } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { nativeQueueFilterCondition } from "./native-content-editor-queue-filter";

function renderSql(fragment: SQL): string {
  return fragment.queryChunks
    .map((chunk) => {
      if (typeof chunk === "string") return chunk;
      if (is(chunk, StringChunk)) return chunk.value.join("");
      if (is(chunk, SQL)) return renderSql(chunk);
      return "";
    })
    .join("");
}

describe("nativeQueueFilterCondition", () => {
  it("includes native string entries in the plain string-type filter", () => {
    const condition = nativeQueueFilterCondition({
      organizationId: "org",
      projectId: "project",
      targetLocale: "fr",
      advancedFilter: { stringType: "plain" },
    });

    expect(condition).toBeDefined();
    const sqlText = renderSql(condition!);
    expect(sqlText).toContain("'text'");
    expect(sqlText).toContain("'plain'");
    expect(sqlText).toContain("'string'");
  });
});
