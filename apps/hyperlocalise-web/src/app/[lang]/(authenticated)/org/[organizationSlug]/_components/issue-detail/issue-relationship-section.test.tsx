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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { IssueRelationshipSection } from "./issue-relationship-section";
import type { IssueRelationship } from "./use-issue-relationships-query";

const organizationSlug = "acme";
const projectId = "project_website";
const issueId = "issue_001";
const relationshipsPath = `/api/orgs/${organizationSlug}/projects/${projectId}/issue-sheet/${issueId}/relationships`;
const searchPathPrefix = `/api/orgs/${organizationSlug}/issue-sheet/search`;

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

const relationships: IssueRelationship[] = [
  {
    id: "rel_blocks",
    presentedKind: "blocks",
    otherIssue: { issueId: "issue_blocked", projectId, title: "Blocked issue", status: "open" },
    createdAt: "2026-06-07T12:00:00.000Z",
  },
  {
    id: "rel_related",
    presentedKind: "related",
    otherIssue: { issueId: "issue_related", projectId, title: "Related issue", status: "open" },
    createdAt: "2026-06-07T12:00:00.000Z",
  },
];

function renderSection(
  items: IssueRelationship[],
  options: { isLoading?: boolean; isError?: boolean } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <IssueRelationshipSection
          organizationSlug={organizationSlug}
          projectId={projectId}
          issueId={issueId}
          relationships={items}
          isLoading={options.isLoading}
          isError={options.isError}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("IssueRelationshipSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("groups relationships under the right headings", () => {
    renderSection(relationships);

    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("Blocked issue")).toBeInTheDocument();
    expect(screen.getByText("Related")).toBeInTheDocument();
    expect(screen.getByText("Related issue")).toBeInTheDocument();
  });

  it("shows an empty state with no relationships", () => {
    renderSection([]);
    expect(screen.getByText("No relationships yet")).toBeInTheDocument();
  });

  it("does not claim there are no relationships while still loading", () => {
    renderSection([], { isLoading: true });
    expect(screen.queryByText("No relationships yet")).not.toBeInTheDocument();
  });

  it("shows an error message when relationships fail to load", () => {
    renderSection([], { isError: true });
    expect(screen.getByText("Could not load relationships")).toBeInTheDocument();
    expect(screen.queryByText("No relationships yet")).not.toBeInTheDocument();
  });

  it("shows a kind icon next to each group heading", () => {
    renderSection(relationships);
    const blocksHeading = screen.getByText("Blocks").closest("span");
    expect(blocksHeading?.querySelector("svg")).toBeInTheDocument();
  });

  it("removes a relationship on click", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = resolveFetchUrl(input);
      if (url === `${relationshipsPath}/rel_blocks` && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    renderSection(relationships);
    await user.click(screen.getAllByRole("button", { name: "Remove relationship" })[0]!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`${relationshipsPath}/rel_blocks`, {
        method: "DELETE",
      });
    });
  });

  it("creates a relationship via the picker", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = resolveFetchUrl(input);
      if (url.startsWith(searchPathPrefix)) {
        return new Response(
          JSON.stringify({
            issues: [{ issueId: "issue_target", projectId, title: "Target issue", status: "open" }],
          }),
          { status: 200 },
        );
      }
      if (url === relationshipsPath && init?.method === "POST") {
        return new Response(JSON.stringify({ relationship: { id: "rel_new" } }), { status: 201 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    renderSection([]);
    await user.click(screen.getByRole("button", { name: /Add relationship/ }));
    await user.type(await screen.findByPlaceholderText("Search issues…"), "Target");
    const result = await screen.findByText("Target issue", undefined, { timeout: 2000 });
    await user.click(result);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        relationshipsPath,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ relatedIssueId: "issue_target", kind: "related" }),
        }),
      );
    });
  });
});
