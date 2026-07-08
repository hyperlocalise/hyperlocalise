import { beforeEach, describe, expect, it } from "vite-plus/test";

import { clearAgentManifestCache } from "@/agents/_runtime/loader";
import {
  buildConversationSkillPlan,
  filterAvailableConversationToolNames,
  isConversationSkillActivated,
  listConversationSkills,
  parseConversationSkillMetadata,
  toConversationSkillActivationContext,
} from "./conversation-skill-registry";

describe("conversation skill registry", () => {
  beforeEach(() => {
    clearAgentManifestCache();
  });

  it("loads the capability skills from frontmatter", () => {
    const skills = listConversationSkills();
    expect(skills.map((skill) => skill.id).sort()).toEqual(
      expect.arrayContaining([
        "conversation",
        "find-context",
        "repo-tools",
        "tms-tools",
        "translation-tools",
      ]),
    );

    const conversationSkill = skills.find((skill) => skill.id === "conversation");
    expect(conversationSkill).toMatchObject({
      always: true,
      tools: ["list_projects", "get_project_context", "update_interaction_project"],
    });

    const tmsSkill = skills.find((skill) => skill.id === "tms-tools");
    expect(tmsSkill).toMatchObject({
      requiresTmsIntegration: true,
      tools: ["check_crowdin_progress"],
      sharedSkills: ["crowdin"],
    });

    const translationSkill = skills.find((skill) => skill.id === "translation-tools");
    expect(translationSkill).toMatchObject({
      always: true,
      tools: ["createTranslationJob", "translate_string"],
    });

    const findContextSkill = skills.find((skill) => skill.id === "find-context");
    expect(findContextSkill).toMatchObject({
      requiresSandbox: true,
      tools: [],
    });

    const repoToolsSkill = skills.find((skill) => skill.id === "repo-tools");
    expect(repoToolsSkill).toMatchObject({
      requiresSandbox: true,
      tools: ["grep", "fuzzySearch", "read", "glob", "detectRepoConfig", "gitHistory", "todoWrite"],
    });
  });

  it("activates tms-tools only when a TMS is integrated", () => {
    const tmsSkill = listConversationSkills().find((skill) => skill.id === "tms-tools");
    expect(tmsSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        tmsSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
          },
        }),
      ),
    ).toBe(false);

    expect(
      isConversationSkillActivated(
        tmsSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: true,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
          },
        }),
      ),
    ).toBe(true);
  });

  it("activates find-context when a sandbox is available", () => {
    const findContextSkill = listConversationSkills().find((skill) => skill.id === "find-context");
    expect(findContextSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        findContextSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
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

  it("activates repo-tools when a sandbox is available", () => {
    const repoToolsSkill = listConversationSkills().find((skill) => skill.id === "repo-tools");
    expect(repoToolsSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        repoToolsSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
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

  it("always activates translation-tools", () => {
    const translationSkill = listConversationSkills().find(
      (skill) => skill.id === "translation-tools",
    );
    expect(translationSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        translationSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
          },
        }),
      ),
    ).toBe(true);
  });

  it("builds a skill plan without TMS tools when integration is missing", () => {
    const plan = buildConversationSkillPlan({
      hasFileAttachments: false,
      hasTmsIntegration: false,
      toolContext: {
        conversationId: "conv_1",
        organizationId: "org_1",
        localUserId: "user_1",
        membershipRole: "member",
        projectId: null,
        db: {} as never,
      },
    });

    expect(plan.instructionSkillIds).toEqual(
      expect.arrayContaining(["conversation", "translation-tools"]),
    );
    expect(plan.instructionSkillIds).not.toContain("tms-tools");
    expect(plan.toolNames).toEqual(expect.arrayContaining(["list_projects", "translate_string"]));
    expect(plan.toolNames).not.toContain("check_crowdin_progress");
  });

  it("exposes translate_string without a project but gates file jobs", () => {
    const toolNames = filterAvailableConversationToolNames(
      ["createTranslationJob", "translate_string", "list_projects"],
      {
        hasFileAttachments: false,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "member",
          projectId: null,
          db: {} as never,
        },
      },
    );

    expect(toolNames).toEqual(["translate_string", "list_projects"]);
  });

  it("parses comma-separated frontmatter values", () => {
    expect(
      parseConversationSkillMetadata({
        id: "test",
        frontmatter: {
          tools: "list_projects, check_crowdin_progress",
          sharedSkills: "crowdin",
          requiresTmsIntegration: "true",
        },
        body: "",
      }),
    ).toMatchObject({
      tools: ["list_projects", "check_crowdin_progress"],
      sharedSkills: ["crowdin"],
      requiresTmsIntegration: true,
    });
  });
});
