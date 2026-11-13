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
import { describe, expect, it } from "vite-plus/test";

import {
  composeSkillToolInstructions,
  loadWorkspaceSkillProcedures,
} from "./workspace-skill-instructions";

describe("workspace skill instructions", () => {
  it("ignores skill ids that are unknown or repeated", () => {
    expect(loadWorkspaceSkillProcedures(["research-web", "gone", "research-web"])).toEqual([
      expect.stringContaining("## Research the web"),
    ]);
  });

  it("limits procedures to the skills that declare the tool", () => {
    const skillIds = ["research-web", "post-to-slack"];

    expect(loadWorkspaceSkillProcedures(skillIds)).toHaveLength(2);
    expect(loadWorkspaceSkillProcedures(skillIds, "use_web_search")).toEqual([
      expect.stringContaining("## Research the web"),
    ]);
  });

  it("puts skill procedures before customer instructions for a tool", () => {
    const instructions = composeSkillToolInstructions({
      skillIds: ["research-web"],
      tool: "use_web_search",
      customerInstructions: "  Focus on Japan.  ",
    });

    expect(instructions).toMatch(/^## Research the web[\s\S]*\n\nFocus on Japan\.$/);
  });

  it("gives a tool's agent the shared procedure its skill refers to", () => {
    const instructions = composeSkillToolInstructions({
      skillIds: ["check-crowdin-concordance"],
      tool: "use_crowdin",
      customerInstructions: "",
    });

    // The skill tells the agent to follow this procedure by name, so its text has to be there.
    expect(instructions).toContain("Follow the **Crowdin concordance review** procedure");
    expect(instructions).toMatch(
      /^## Crowdin concordance review[\s\S]*search_concordance[\s\S]*## Check against Crowdin/,
    );
  });

  it("returns null without skills or customer instructions", () => {
    expect(
      composeSkillToolInstructions({
        skillIds: [],
        tool: "use_crowdin",
        customerInstructions: " ",
      }),
    ).toBeNull();
  });
});
