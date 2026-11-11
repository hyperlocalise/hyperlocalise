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
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { JobsKanbanBoard } from "./jobs-kanban-board";
import type { JobRow } from "./jobs-page-view";

const succeededJob: JobRow = {
  id: "job_partial",
  projectId: "project_website",
  projectName: "Website",
  createdByUserId: "user_001",
  assigneeType: "agent",
  kind: "translation",
  type: "file",
  status: "succeeded",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T01:00:00.000Z",
  completedAt: "2026-06-01T01:00:00.000Z",
  workflowRunId: null,
  lastError: null,
  inputPayload: { targetLocales: ["de-DE", "ja-JP"] },
  outcomeKind: "file_result",
  outcomePayload: {
    outputFiles: [{ locale: "de-DE" }],
    failedLocales: ["ja-JP"],
    followUpJobId: "job_retry",
    message: "translation interrupted for one locale",
  },
  reviewCriteria: null,
  reviewTargetLocale: null,
  syncConnectorKind: null,
  syncDirection: null,
  assetType: null,
  assetOperation: null,
  externalProviderKind: null,
  externalTaskId: null,
  externalStatus: null,
  externalTitle: null,
  externalDueDate: null,
  externalTargetLocales: null,
  externalAssignedUsers: null,
  externalSyncState: null,
};

describe("JobsKanbanBoard", () => {
  it("shows unfinished locales on a succeeded card", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <JobsKanbanBoard
          emptyLabel="No jobs"
          isLoading={false}
          jobs={[succeededJob]}
          organizationSlug="acme"
          projectId="project_website"
          renderJobLink={({ href, children, ariaLabel }) => (
            <a href={href} aria-label={ariaLabel}>
              {children}
            </a>
          )}
        />
      </IntlProvider>,
    );

    expect(
      screen.getByText("Translation interrupted for one locale · Unfinished: ja-JP"),
    ).toBeInTheDocument();
  });
});
