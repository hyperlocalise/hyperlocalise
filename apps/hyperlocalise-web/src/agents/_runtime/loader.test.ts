import { describe, expect, it } from "vite-plus/test";

import { composeInstructions } from "./compose-instructions";
import { clearAgentManifestCache, getAgentManifest, loadSharedSkill } from "./loader";
import { AGENT_MARKDOWN_TRACE_GLOB, getAgentsRoot } from "./paths";
import { parseFrontmatter } from "./parse-frontmatter";
import { toolNameFromFilename } from "./define-agent-tool";

describe("agent loader", () => {
  it("keeps build trace glob aligned with runtime agents root", () => {
    expect(AGENT_MARKDOWN_TRACE_GLOB).toBe("src/agents/**/*.md");
    expect(getAgentsRoot()).toMatch(/src\/agents$/);
  });

  it("loads hyperlocalise instructions from markdown", () => {
    clearAgentManifestCache();
    const manifest = getAgentManifest({ agentId: "hyperlocalise" });
    expect(manifest.instructions).toContain("Hyperlocalise");
    expect(manifest.skills.orchestration?.body).toContain("Orchestration");
  });

  it("parses skill frontmatter", () => {
    const parsed = parseFrontmatter(`---
id: test-skill
name: Test
---
Body content`);
    expect(parsed.frontmatter.id).toBe("test-skill");
    expect(parsed.body).toBe("Body content");
  });

  it("composes instructions with skills and user override", () => {
    clearAgentManifestCache();
    const text = composeInstructions({
      agentId: "hyperlocalise",
      skills: ["orchestration"],
      userOverride: "Always greet the user.",
    });
    expect(text).toContain("Hyperlocalise");
    expect(text).toContain("Orchestration");
    expect(text).toContain("Customer instructions");
    expect(text).toContain("Always greet the user.");
  });

  it("loads shared string-translation skill", () => {
    expect(loadSharedSkill("string-translation")).toContain("localization engine");
  });

  it("maps tool filenames to runtime names", () => {
    expect(toolNameFromFilename("translate_string.ts")).toBe("translate_string");
  });
});
