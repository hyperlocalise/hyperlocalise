import { describe, expect, it } from "vitest";
import { updateProviderCredentialBodySchema } from "./provider-credential.schema";
import { addTeamMemberBodySchema } from "../team/team.schema";

describe("Schema length limits", () => {
  it("should enforce max length on provider credential apiKey", () => {
    const longKey = "a".repeat(4097);
    const result = updateProviderCredentialBodySchema.safeParse({
      provider: "openai",
      apiKey: longKey,
      defaultModel: "gpt-4o",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      const issue = issues.find((i) => i.code === "too_big" && i.path.includes("apiKey"));
      expect(issue).toBeDefined();
    }
  });

  it("should enforce max length on provider credential defaultModel", () => {
    const longModel = "a".repeat(257);
    const result = updateProviderCredentialBodySchema.safeParse({
      provider: "openai",
      apiKey: "valid-key",
      defaultModel: longModel,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      // console.log('defaultModel issues:', JSON.stringify(issues, null, 2));
      const issue = issues.find((i) => i.code === "too_big" && i.path.includes("defaultModel"));
      expect(issue).toBeDefined();
    }
  });

  it("should enforce max length on team member workosUserId", () => {
    const longId = "a".repeat(257);
    const result = addTeamMemberBodySchema.safeParse({
      workosUserId: longId,
      role: "member",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      // console.log('workosUserId issues:', JSON.stringify(issues, null, 2));
      const issue = issues.find((i) => i.code === "too_big" && i.path.includes("workosUserId"));
      expect(issue).toBeDefined();
    }
  });
});
