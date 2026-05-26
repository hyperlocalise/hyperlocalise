import { describe, expect, it } from "vite-plus/test";

import { classifyAgentRequestText, planAgentRequest } from "./planner";
import type { AgentRequest } from "./agent-request";

function createRequest(text: string): AgentRequest {
  return {
    id: "request_1",
    source: "slack",
    organizationId: "org_1",
    projectId: null,
    actor: { sourceUserId: "U1", userId: "user_1", role: "member" },
    sourceThreadId: "thread_1",
    input: { text },
    idempotencyKey: "idem",
    responsePolicy: { type: "thread_reply" },
  };
}

describe("agent request planner", () => {
  it("plans repo inspection work with repo read workspace access", () => {
    expect(planAgentRequest(createRequest("Find 'Email agent' in our GitHub repo"))).toMatchObject({
      domain: "repository",
      operation: "inspect",
      workspace: "repo_read",
      mutationPolicy: "none",
    });
  });

  it("keeps repo fixes out of repository-agent planning", () => {
    expect(planAgentRequest(createRequest("Fix the PR translation issues"))).toMatchObject({
      domain: "general",
      operation: "answer",
      workspace: "none",
      mutationPolicy: "none",
    });
  });

  it("does not classify generic PR mentions as repository lookup", () => {
    expect(classifyAgentRequestText("search the string in our PR team docs")).toBe("general");
  });

  it("keeps translation requests out of repo planning", () => {
    expect(classifyAgentRequestText("Translate this JSON file to French")).toBe("translation");
    expect(planAgentRequest(createRequest("Translate this JSON file to French"))).toMatchObject({
      domain: "translation",
      operation: "translate",
      workspace: "none",
    });
  });
});
