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

import { IssueDuplicateBanner } from "./issue-duplicate-banner";
import type { IssueRelationship } from "./use-issue-relationships-query";

const organizationSlug = "acme";

function relationship(overrides: Partial<IssueRelationship>): IssueRelationship {
  return {
    id: "rel_1",
    presentedKind: "related",
    otherIssue: {
      issueId: "issue_002",
      projectId: "project_other",
      title: "Other",
      status: "open",
    },
    createdAt: "2026-06-07T12:00:00.000Z",
    ...overrides,
  };
}

function renderBanner(relationships: IssueRelationship[]) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <IssueDuplicateBanner organizationSlug={organizationSlug} relationships={relationships} />
    </IntlProvider>,
  );
}

describe("IssueDuplicateBanner", () => {
  it("renders nothing when there is no outgoing duplicate_of relationship", () => {
    const { container } = renderBanner([relationship({ presentedKind: "related" })]);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an incoming duplicate (another issue is a duplicate of this one)", () => {
    const { container } = renderBanner([relationship({ presentedKind: "duplicate" })]);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the canonical link when this issue is a duplicate", () => {
    renderBanner([
      relationship({
        presentedKind: "duplicate_of",
        otherIssue: {
          issueId: "issue_canonical",
          projectId: "project_canonical",
          title: "Canonical issue",
          status: "open",
        },
      }),
    ]);

    expect(screen.getByText("This issue is a duplicate")).toBeInTheDocument();
    expect(screen.getByText(/Canonical issue/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "View original issue" });
    expect(link).toHaveAttribute(
      "href",
      "/org/acme/projects/project_canonical/issue-sheet/issue_canonical",
    );
  });
});
