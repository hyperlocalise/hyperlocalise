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

import { translationOriginOnConflict } from "./translation-origin";

function renderSql(fragment: SQL): string {
  return fragment.queryChunks
    .map((chunk) => {
      if (typeof chunk === "string") return chunk;
      if (is(chunk, StringChunk)) return chunk.value.join("");
      if (is(chunk, SQL)) return renderSql(chunk);
      if (chunk && typeof chunk === "object" && "value" in chunk) {
        const value = (chunk as { value: unknown }).value;
        return typeof value === "string" ? `'${value}'` : String(value);
      }
      return "";
    })
    .join("");
}

describe("translationOriginOnConflict", () => {
  it("always writes machine origin for a machine upsert", () => {
    const sqlText = renderSql(translationOriginOnConflict("machine"));
    expect(sqlText).toBe("'machine'::project_translation_origin");
    expect(sqlText).not.toContain("excluded");
  });

  it("keeps origin when the text is unchanged, otherwise post-edits machine text", () => {
    const sqlText = renderSql(translationOriginOnConflict("person"));
    expect(sqlText).toContain(
      `when "project_translations"."text" = excluded."text" then "project_translations"."origin"::text`,
    );
    expect(sqlText).toContain(
      `when "project_translations"."origin" in ('machine', 'machine_post_edited') then 'machine_post_edited'`,
    );
    expect(sqlText).toContain("else 'human'");
    expect(sqlText).toContain("::project_translation_origin");
    expect(sqlText).not.toContain("'unknown'");
  });

  it("labels changed import text as unknown and still keeps identical text", () => {
    const sqlText = renderSql(translationOriginOnConflict("import"));
    expect(sqlText).toContain(
      `when "project_translations"."text" = excluded."text" then "project_translations"."origin"::text`,
    );
    expect(sqlText).toContain(
      `when "project_translations"."origin" in ('machine', 'machine_post_edited') then 'unknown'`,
    );
    expect(sqlText).toContain("else 'unknown'");
    expect(sqlText).not.toContain("else 'human'");
    expect(sqlText).not.toContain("then 'machine_post_edited'");
    expect(sqlText).not.toContain("then 'human'");
  });
});
