import { describe, expect, it } from "vite-plus/test";

import {
  buildIssueListHref,
  buildIssueListSearchParams,
  clearIssueListFilters,
  getActiveIssueFilterChips,
  issueListStateToApiQuery,
  parseIssueListSearchParams,
} from "./issue-list-url-state";

describe("issue list URL state", () => {
  it("parses supported filters, sort, and defaults", () => {
    const state = parseIssueListSearchParams(
      new URLSearchParams(
        "view=qa_triage&status=open&issueType=qa_failure&priority=P0&locale=de-DE&assignee=unassigned&projectId=proj_1&search=hero&sort=priority&sortDir=asc",
      ),
      { includeProject: true },
    );

    expect(state).toEqual({
      view: "qa_triage",
      status: "open",
      issueType: "qa_failure",
      priority: "P0",
      locale: "de-DE",
      assignee: "unassigned",
      projectId: "proj_1",
      search: "hero",
      sort: "priority",
      sortDir: "asc",
    });
  });

  it("omits default view and sort from the URL", () => {
    const params = buildIssueListSearchParams({
      view: "all_open",
      search: "",
      sort: "updated_at",
      sortDir: "desc",
      status: "in_progress",
    });

    expect(params.toString()).toBe("status=in_progress");
    expect(
      buildIssueListHref("/org/acme/issues", {
        view: "all_open",
        search: "",
        sort: "updated_at",
        sortDir: "desc",
      }),
    ).toBe("/org/acme/issues");
  });

  it("clears filters while preserving the selected preset and sort", () => {
    const cleared = clearIssueListFilters({
      view: "my_work",
      status: "open",
      issueType: "qa_failure",
      priority: "P1",
      locale: "fr-FR",
      assignee: "me",
      projectId: "proj_1",
      search: "cta",
      sort: "created_at",
      sortDir: "asc",
    });

    expect(cleared).toEqual({
      view: "my_work",
      search: "",
      sort: "created_at",
      sortDir: "asc",
    });
  });

  it("exposes active filter chips without opening a menu", () => {
    const chips = getActiveIssueFilterChips(
      {
        view: "all_open",
        status: "open",
        assignee: "unassigned",
        projectId: "proj_1",
        search: "hero",
        sort: "updated_at",
        sortDir: "desc",
      },
      {
        includeProject: true,
        projectNameById: { proj_1: "Website" },
      },
    );

    expect(chips.map((chip) => chip.label)).toEqual([
      "Status: Open",
      "Assignee: Unassigned",
      "Project: Website",
      "Search: hero",
    ]);
  });

  it("maps URL state into API query params used by built-in views", () => {
    expect(
      issueListStateToApiQuery(
        {
          view: "source_context",
          issueType: "context_request",
          search: "",
          sort: "status",
          sortDir: "asc",
        },
        { limit: 25, offset: 50 },
      ),
    ).toEqual({
      view: "source_context",
      issueType: "context_request",
      sort: "status",
      sortDir: "asc",
      limit: "25",
      offset: "50",
    });
  });
});
