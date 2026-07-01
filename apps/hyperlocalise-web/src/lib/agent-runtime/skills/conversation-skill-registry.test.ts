import { beforeEach, describe, expect, it } from "vite-plus/test";

import { clearAgentManifestCache } from "@/agents/_runtime/loader";
import {
  buildConversationSkillPlan,
  isConversationSkillActivated,
  listConversationSkills,
  parseConversationSkillMetadata,
  toConversationSkillActivationContext,
} from "./conversation-skill-registry";

describe("conversation skill registry", () => {
  beforeEach(() => {
    clearAgentManifestCache();
  });

  it("loads the three capability skills from frontmatter", () => {
    const skills = listConversationSkills();
    expect(skills.map((skill) => skill.id).sort()).toEqual(
      expect.arrayContaining(["conversation", "repo-tools", "tms-tools", "translation-tools"]),
    );

    const tmsSkill = skills.find((skill) => skill.id === "tms-tools");
    expect(tmsSkill).toMatchObject({
      always: true,
      tools: [
        "list_projects",
        "get_project_context",
        "update_interaction_project",
        "check_crowdin_progress",
      ],
      sharedSkills: ["crowdin"],
    });
  });

  it("activates repo-tools when a sandbox is available", () => {
    const repoSkill = listConversationSkills().find((skill) => skill.id === "repo-tools");
    expect(repoSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        repoSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
            sandboxId: "sbx_1",
          },
        }),
      ),
    ).toBe(true);
  });

  it("activates translation-tools when a project is attached", () => {
    const translationSkill = listConversationSkills().find(
      (skill) => skill.id === "translation-tools",
    );
    expect(translationSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        translationSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: "proj_1",
            db: {} as never,
          },
        }),
      ),
    ).toBe(true);
  });

  it("builds a skill plan from runtime context without intents", () => {
    const plan = buildConversationSkillPlan({
      hasFileAttachments: false,
      toolContext: {
        conversationId: "conv_1",
        organizationId: "org_1",
        localUserId: "user_1",
        membershipRole: "member",
        projectId: null,
        db: {} as never,
      },
    });

    expect(plan.instructionSkillIds).toEqual(expect.arrayContaining(["conversation", "tms-tools"]));
    expect(plan.toolNames).toEqual(
      expect.arrayContaining(["list_projects", "check_crowdin_progress"]),
    );
    expect(plan.sharedSkillIds).toContain("crowdin");
  });

  it("parses comma-separated frontmatter values", () => {
    expect(
      parseConversationSkillMetadata({
        id: "test",
        frontmatter: {
          tools: "list_projects, check_crowdin_progress",
          sharedSkills: "crowdin",
          requiresSandbox: "true",
        },
        body: "",
      }),
    ).toMatchObject({
      tools: ["list_projects", "check_crowdin_progress"],
      sharedSkills: ["crowdin"],
      requiresSandbox: true,
    });
  });
});
