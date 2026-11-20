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
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AppShellSessionProvider } from "@/components/app-shell/store/app-shell-session-context";

import { JobsPageView, type JobRow } from "./jobs-page-view";

function renderMyJobs(showCreatedByMe?: boolean) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <JobsPageView
        organizationSlug="acme"
        scope="personal"
        isNativeLoading={false}
        nativeJobs={[]}
        assignedNativeJobs={[]}
        createdNativeJobs={[]}
        {...(showCreatedByMe === undefined ? {} : { showCreatedByMe })}
      />
    </IntlProvider>,
  );
}

describe("My jobs lists", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("shows both lists by default", () => {
    renderMyJobs();
    expect(screen.getByText("Assigned to me")).toBeInTheDocument();
    expect(screen.getByText("Created by me")).toBeInTheDocument();
  });

  it("shows a vendor the Assigned list only", () => {
    renderMyJobs(false);
    expect(screen.getByText("Assigned to me")).toBeInTheDocument();
    expect(screen.queryByText("Created by me")).toBeNull();
  });
});

describe("My jobs for a vendor team's manager", () => {
  const task = (id: string, ownerUserId: string | null) =>
    ({
      id,
      projectId: "project_1",
      projectName: "RE Bands",
      createdByUserId: null,
      ownerUserId,
      assigneeType: ownerUserId ? "user" : null,
      kind: "proofread",
      type: "file",
      status: "waiting_for_review",
      createdAt: "2026-11-20T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
      inputPayload: {
        sourceFileId: "file_1",
        targetLocales: ["de-DE"],
        metadata: { title: `Proofread ${id}` },
      },
    }) as unknown as JobRow;

  it("offers the editor only on the tasks the manager owns", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <AppShellSessionProvider
          canDeleteQueries={false}
          currentUser={{ avatarUrl: null, email: "m@agency.test", name: "Manager" }}
          isVendor
          vendorUserId="user_manager"
        >
          <JobsPageView
            organizationSlug="acme"
            scope="personal"
            isNativeLoading={false}
            nativeJobs={[]}
            assignedNativeJobs={[task("job_own", "user_manager"), task("job_team", null)]}
            createdNativeJobs={[]}
            showCreatedByMe={false}
          />
        </AppShellSessionProvider>
      </IntlProvider>,
    );
    expect(screen.getAllByText("Details")).toHaveLength(2);
    expect(screen.getAllByText("Open Editor")).toHaveLength(1);
  });
});
