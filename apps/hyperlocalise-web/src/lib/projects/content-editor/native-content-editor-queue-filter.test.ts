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
      if (chunk && typeof chunk === "object" && "value" in chunk) {
        const value = (chunk as { value: unknown }).value;
        return typeof value === "string" ? `'${value}'` : String(value);
      }
      return "";
    })
    .join("");
}

function filterSql(input: Parameters<typeof nativeQueueFilterCondition>[0]) {
  const condition = nativeQueueFilterCondition(input);
  expect(condition).toBeDefined();
  return renderSql(condition!);
}

describe("nativeQueueFilterCondition", () => {
  const scope = {
    organizationId: "org",
    projectId: "project",
    targetLocale: "fr",
  };

  it("includes native string entries in the plain string-type filter", () => {
    const sqlText = filterSql({
      ...scope,
      advancedFilter: { stringType: "plain" },
    });

    expect(sqlText).toContain("'text'");
    expect(sqlText).toContain("'plain'");
    expect(sqlText).toContain("'string'");
  });

  it("returns no condition for all or unknown preset filters", () => {
    expect(nativeQueueFilterCondition({ ...scope, queueFilter: "all" })).toBeUndefined();
    expect(nativeQueueFilterCondition(scope)).toBeUndefined();
  });

  it("scopes qa_issues to the latest succeeded run and optional check type", () => {
    const sqlText = filterSql({ ...scope, queueFilter: "qa_issues" });
    expect(sqlText).toContain("exists (");
    expect(sqlText).toContain("'open'");
    expect(sqlText).toContain("'succeeded'");
    expect(sqlText).toContain("desc nulls last");
    expect(sqlText).toContain("limit 1");
    expect(sqlText).not.toContain("spelling");

    const spelling = filterSql({
      ...scope,
      queueFilter: "qa_issues",
      queueFilterQualifier: "spelling",
    });
    expect(spelling).toContain("spelling");

    const invalidQualifier = filterSql({
      ...scope,
      queueFilter: "qa_issues",
      queueFilterQualifier: "not-a-check",
    });
    expect(invalidQualifier).not.toContain("not-a-check");
    expect(invalidQualifier).toContain("'succeeded'");
  });

  it("limits machine_translated to known provenances and ignores unknown qualifiers", () => {
    const sqlText = filterSql({ ...scope, queueFilter: "machine_translated" });
    expect(sqlText).toContain("translation_job");
    expect(sqlText).toContain("agent");
    expect(sqlText).toContain("import");

    const agentOnly = filterSql({
      ...scope,
      queueFilter: "machine_translated",
      queueFilterQualifier: "agent",
    });
    expect(agentOnly).toContain("agent");
    expect(agentOnly).not.toContain("translation_job");
    expect(agentOnly).not.toContain("import");

    const unknown = filterSql({
      ...scope,
      queueFilter: "machine_translated",
      queueFilterQualifier: "human",
    });
    expect(unknown).toContain("translation_job");
    expect(unknown).toContain("agent");
    expect(unknown).toContain("import");
    expect(unknown).not.toContain("human");
  });

  it("builds comment presence SQL for the preset and advanced without invert", () => {
    const withComments = filterSql({ ...scope, queueFilter: "with_comments" });
    expect(withComments).toContain("exists (");
    expect(withComments.trimStart()).not.toMatch(/^not\b/);

    const withoutComments = filterSql({
      ...scope,
      advancedFilter: { comments: "without" },
    });
    expect(withoutComments.trimStart()).toMatch(/^not\s+exists\b/);
  });

  it("inverts qa_issues for advanced without and keeps the latest-run subquery", () => {
    const withoutQa = filterSql({
      ...scope,
      advancedFilter: { qaIssues: "without" },
    });
    expect(withoutQa.trimStart()).toMatch(/^not\s+exists\b/);
    expect(withoutQa).toContain("'succeeded'");
    expect(withoutQa).toContain("desc nulls last");
    expect(withoutQa).toContain("limit 1");
  });

  it("filters hidden vs visible keys without binding a locale", () => {
    expect(filterSql({ ...scope, queueFilter: "not_hidden" })).toContain("false");
    expect(filterSql({ ...scope, queueFilter: "hidden" })).toContain("true");
  });
});
