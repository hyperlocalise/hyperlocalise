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

import { buildWorkspaceOrchestratorUserMessage } from "./run-workspace-orchestrator";

describe("buildWorkspaceOrchestratorUserMessage", () => {
  it("includes Contentful webhook context in the orchestrator prompt", () => {
    const message = buildWorkspaceOrchestratorUserMessage({
      automationName: "Translate Contentful article",
      triggerSource: "contentful",
      inputSnapshot: {
        entryId: "entry-from-webhook",
        contentTypeId: "helpCenterArticle",
      },
    });

    expect(message).toContain('Execute automation "Translate Contentful article"');
    expect(message).toContain("Trigger source: contentful.");
    expect(message).toContain("Contentful entry ID: entry-from-webhook.");
    expect(message).toContain("Contentful content type: helpCenterArticle.");
  });

  it("does not add Contentful context for non-Contentful triggers", () => {
    const message = buildWorkspaceOrchestratorUserMessage({
      automationName: "Validate localisation on push",
      triggerSource: "github",
      inputSnapshot: {
        entryId: "entry-from-webhook",
      },
    });

    expect(message).not.toContain("Contentful entry ID");
  });

  it("includes GitHub push context in the orchestrator prompt", () => {
    const message = buildWorkspaceOrchestratorUserMessage({
      automationName: "Notify on push blockers",
      triggerSource: "github",
      inputSnapshot: {
        pushBranch: "main",
        commitBefore: "aaa111",
        commitAfter: "bbb222",
      },
    });

    expect(message).toContain('Execute automation "Notify on push blockers"');
    expect(message).toContain("Trigger source: github.");
    expect(message).toContain("GitHub push branch: main.");
    expect(message).toContain("GitHub push commits: aaa111..bbb222.");
  });

  it("includes GitHub pull request context in the orchestrator prompt", () => {
    const message = buildWorkspaceOrchestratorUserMessage({
      automationName: "Notify on push blockers",
      triggerSource: "github",
      inputSnapshot: {
        pullRequestNumber: 42,
        baseBranch: "main",
        headBranch: "feature/review",
        pushBranch: "main",
        commitBefore: "aaa111",
        commitAfter: "bbb222",
      },
    });

    expect(message).toContain("GitHub pull request: #42.");
    expect(message).toContain("GitHub pull request branches: feature/review into main.");
    expect(message).toContain("GitHub pull request commits: aaa111..bbb222.");
    expect(message).not.toContain("GitHub push branch");
  });

  it("omits Contentful entry context when the snapshot has no entry ID", () => {
    const message = buildWorkspaceOrchestratorUserMessage({
      automationName: "Translate Contentful article",
      triggerSource: "contentful",
      inputSnapshot: {},
    });

    expect(message).toContain("Trigger source: contentful.");
    expect(message).not.toContain("Contentful entry ID");
    expect(message).not.toContain("Contentful content type");
  });

  it("omits Contentful entry context when the snapshot entry ID is blank", () => {
    const message = buildWorkspaceOrchestratorUserMessage({
      automationName: "Translate Contentful article",
      triggerSource: "contentful",
      inputSnapshot: {
        entryId: "   ",
        contentTypeId: "helpCenterArticle",
      },
    });

    expect(message).not.toContain("Contentful entry ID");
    expect(message).toContain("Contentful content type: helpCenterArticle.");
  });
});
