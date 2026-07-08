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
});
