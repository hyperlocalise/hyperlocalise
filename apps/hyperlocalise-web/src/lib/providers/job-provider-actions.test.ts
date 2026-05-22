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

    expect(translate).toMatchObject({ visible: true, enabled: true });
    expect(review).toMatchObject({ visible: true, enabled: true });
    expect(isJobProviderActionAvailable("crowdin", "translate_with_agent")).toBe(true);
  });

  it("hides phrase QA fix when QA is unsupported", () => {
    const actions = getJobProviderActionAvailability("phrase");
    const qaFix = actions.find((action) => action.id === "fix_qa_issues");

    expect(qaFix).toMatchObject({
      visible: true,
      enabled: false,
    });
    expect(qaFix?.disabledReason).toContain("Phrase QA");
  });

  it("returns no visible actions for unknown providers", () => {
    const actions = getJobProviderActionAvailability("unknown-provider");
    expect(actions.every((action) => !action.visible)).toBe(true);
  });
});
