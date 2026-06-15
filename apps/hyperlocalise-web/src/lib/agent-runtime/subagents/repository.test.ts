import { describe, expect, it } from "vite-plus/test";

import { REPOSITORY_SYSTEM_PROMPT } from "./repository";

describe("repository subagent prompt", () => {
  it("asks for answer-first translator context without verbose search sections", () => {
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("**Answer** (required, first)");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain("**Source** (required)");
    expect(REPOSITORY_SYSTEM_PROMPT).not.toContain("**Searches Run**");
    expect(REPOSITORY_SYSTEM_PROMPT).not.toContain("**Localisation Context**");
    expect(REPOSITORY_SYSTEM_PROMPT).toContain(
      'Do not use separate "Summary", "Searches Run", or "Localisation Context" sections',
    );
  });
});
