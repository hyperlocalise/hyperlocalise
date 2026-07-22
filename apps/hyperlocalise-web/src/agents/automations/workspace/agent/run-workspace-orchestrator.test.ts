/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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
