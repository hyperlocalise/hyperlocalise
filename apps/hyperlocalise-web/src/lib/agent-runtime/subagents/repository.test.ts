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
});
