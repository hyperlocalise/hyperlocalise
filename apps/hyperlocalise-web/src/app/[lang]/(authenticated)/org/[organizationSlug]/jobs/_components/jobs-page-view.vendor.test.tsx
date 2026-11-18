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

import { JobsPageView } from "./jobs-page-view";

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
