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

import { REPOSITORY_SYSTEM_PROMPT } from "./repository";

describe("repository subagent prompt", () => {
  it("asks for structured translator context without verbose search sections", () => {
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("**What it is:**");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("**Where/how it shows:**");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("**Translation guidance:**");
    expect(REPOSITORY_SYSTEM_PROMPT).not.toContain("**Searches Run**");
    expect(REPOSITORY_SYSTEM_PROMPT).not.toContain("**Localisation Context**");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain(
      'Do not use separate "Summary", "Answer", "Source", "Details", or "Searches Run" sections',
    );
  });

  it("instructs recent source-change lookups to keep exploring git history", () => {
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("gitHistory");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("Recent source-content changes");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("changelog");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("Do not ask for Crowdin");
  });

  it("chains gitHistory discoveries into per-key context when context is requested", () => {
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("Recent changes with full context");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain(
      "find translator context for each discovered key/source string",
    );
    expect(REPOSITORY_SYSTEM_PROMPT).toContain(
      "Do not stop after a changelog when context was requested",
    );
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("still exist now");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("Ignore deleted keys");
  });
});
