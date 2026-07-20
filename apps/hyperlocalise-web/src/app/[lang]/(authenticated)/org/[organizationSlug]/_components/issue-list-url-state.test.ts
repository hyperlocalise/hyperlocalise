import { describe, expect, it } from "vite-plus/test";

import {
  buildIssueListHref,
  buildIssueListSearchParams,
  clearIssueListFilters,
  parseIssueListSearchParams,
  stripIssueDetailFromState,
} from "./issue-list-url-state";

describe("issue-list-url-state", () => {
  it("parses and builds issue detail search params", () => {
    const params = new URLSearchParams({
      view: "my_work",
      issue: "11111111-1111-4111-8111-111111111111",
      issueProject: "project_website",
      status: "open",
    });

    const state = parseIssueListSearchParams(params, { includeProject: true });
    expect(state.issue).toBe("11111111-1111-4111-8111-111111111111");
    expect(state.issueProject).toBe("project_website");
    expect(state.status).toBe("open");

    const rebuilt = buildIssueListSearchParams(state, { includeProject: true });
    expect(rebuilt.get("issue")).toBe("11111111-1111-4111-8111-111111111111");
    expect(rebuilt.get("issueProject")).toBe("project_website");
    expect(rebuilt.get("status")).toBe("open");
  });

  it("preserves open issue when clearing filters", () => {
    const state = clearIssueListFilters({
      view: "qa_triage",
      status: "open",
      search: "checkout",
      sort: "updated_at",
      sortDir: "desc",
      issue: "11111111-1111-4111-8111-111111111111",
      issueProject: "project_website",
    });

    expect(state.search).toBe("");
    expect(state.status).toBeUndefined();
    expect(state.issue).toBe("11111111-1111-4111-8111-111111111111");
    expect(state.issueProject).toBe("project_website");
  });

  it("strips issue detail params for close navigation", () => {
    const state = stripIssueDetailFromState({
      view: "all_open",
      search: "",
      sort: "updated_at",
      sortDir: "desc",
      issue: "11111111-1111-4111-8111-111111111111",
      issueProject: "project_website",
    });

    expect(state.issue).toBeUndefined();
    expect(state.issueProject).toBeUndefined();
    expect(buildIssueListHref("/org/acme/issues", state, { includeProject: true })).toBe(
      "/org/acme/issues",
    );
  });
});
