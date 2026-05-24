import { describe, expect, it } from "vite-plus/test";

import {
  getJobProviderActionAvailability,
  isJobProviderActionAvailable,
} from "@/lib/providers/job-provider-actions";

describe("job provider actions", () => {
  it("enables crowdin translate and review actions", () => {
    const actions = getJobProviderActionAvailability("crowdin");
    const translate = actions.find((action) => action.id === "translate_with_agent");
    const review = actions.find((action) => action.id === "review_with_agent");
    const qaChecks = actions.find((action) => action.id === "run_qa_checks");

    expect(translate).toMatchObject({ visible: true, enabled: true });
    expect(review).toMatchObject({ visible: true, enabled: true });
    expect(qaChecks).toMatchObject({ visible: true, enabled: true });
    expect(isJobProviderActionAvailable("crowdin", "translate_with_agent")).toBe(true);
    expect(isJobProviderActionAvailable("crowdin", "run_qa_checks")).toBe(true);
  });

  it("shows phrase QA fix as disabled when QA is unsupported", () => {
    const actions = getJobProviderActionAvailability("phrase");
    const qaFix = actions.find((action) => action.id === "fix_qa_issues");

    expect(qaFix).toMatchObject({
      visible: true,
      enabled: false,
    });
    expect(qaFix?.disabledReason).toContain("Phrase QA");
  });

  it("shows phrase comment write-back as disabled when no pusher exists", () => {
    const actions = getJobProviderActionAvailability("phrase");
    const commentAction = actions.find((action) => action.id === "leave_provider_comment");

    expect(commentAction).toMatchObject({
      visible: true,
      enabled: false,
    });
    expect(commentAction?.disabledReason).toContain("does not support writing comments");
    expect(isJobProviderActionAvailable("phrase", "leave_provider_comment")).toBe(false);
  });

  it("enables comment write-back for crowdin", () => {
    const commentAction = getJobProviderActionAvailability("crowdin").find(
      (action) => action.id === "leave_provider_comment",
    );

    expect(commentAction).toMatchObject({ visible: true, enabled: true });
    expect(isJobProviderActionAvailable("crowdin", "leave_provider_comment")).toBe(true);
  });

  it("returns no visible actions for unknown providers", () => {
    const actions = getJobProviderActionAvailability("unknown-provider");
    expect(actions.every((action) => !action.visible)).toBe(true);
  });
});
