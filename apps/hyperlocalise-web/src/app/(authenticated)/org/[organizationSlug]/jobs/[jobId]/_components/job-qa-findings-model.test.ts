import { describe, expect, it } from "vite-plus/test";

import {
  isProviderReviewFindingsAgentRun,
  isQaChecksAgentRun,
  isReviewWithAgentRun,
} from "./job-qa-findings-model";

describe("provider review findings agent run helpers", () => {
  it("identifies QA check runs", () => {
    expect(isQaChecksAgentRun({ action: "run_qa_checks" })).toBe(true);
    expect(isQaChecksAgentRun({ action: "review_with_agent" })).toBe(false);
  });

  it("identifies review_with_agent runs", () => {
    expect(isReviewWithAgentRun({ action: "review_with_agent" })).toBe(true);
    expect(isReviewWithAgentRun({ action: "run_qa_checks" })).toBe(false);
  });

  it("treats both review and QA actions as findings-producing runs", () => {
    expect(isProviderReviewFindingsAgentRun({ action: "review_with_agent" })).toBe(true);
    expect(isProviderReviewFindingsAgentRun({ action: "run_qa_checks" })).toBe(true);
    expect(isProviderReviewFindingsAgentRun({ action: "translate_with_agent" })).toBe(false);
  });
});
