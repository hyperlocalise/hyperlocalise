import { describe, expect, it } from "vite-plus/test";

import { buildFindContextSkillInstructions } from "./find-context-instructions";

describe("buildFindContextSkillInstructions", () => {
  it("omits the find context request header when no request fields are present", () => {
    const instructions = buildFindContextSkillInstructions({
      contextNote: "  ",
      sourcePath: null,
      sourceText: undefined,
      stringKey: "",
    });

    expect(instructions).not.toContain("Find context request:");
  });

  it("includes the find context request header when request fields are present", () => {
    const instructions = buildFindContextSkillInstructions({
      sourcePath: "locales/en.json",
      sourceText: "Save",
    });

    expect(instructions).toContain("Find context request:\n");
    expect(instructions).toContain("Source file path in the TMS project: locales/en.json");
    expect(instructions).toContain("Source text: Save");
  });

  it("supports recent-change discovery then per-key find-context", () => {
    const instructions = buildFindContextSkillInstructions({});

    expect(instructions).toContain("Recent changes with full context");
    expect(instructions).toContain("discover with `gitHistory`");
    expect(instructions).toContain("For **each** extracted key or source string");
    expect(instructions).toContain("one find-context section block per discovered entry");
    expect(instructions).toContain('mode: "changedFiles"');
  });
});
