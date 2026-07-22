import { describe, expect, it } from "vite-plus/test";

import {
  buildIssueListHref,
  buildIssueListSearchParams,
  clearIssueListFilters,
  parseIssueListSearchParams,
} from "./issue-list-url-state";
import { buildIssueDetailHref } from "./issue-detail/issue-detail-utils";

describe("issue-list-url-state", () => {
  it("parses and builds list filter search params", () => {
    const params = new URLSearchParams({
      view: "my_work",
      status: "open",
    });

    const state = parseIssueListSearchParams(params, { includeProject: true });
    expect(state.status).toBe("open");
    expect(state.view).toBe("my_work");

    const rebuilt = buildIssueListSearchParams(state, { includeProject: true });
    expect(rebuilt.get("status")).toBe("open");
    expect(rebuilt.get("view")).toBe("my_work");
  });

  it("clears filters without preserving issue detail state", () => {
    const state = clearIssueListFilters({
      view: "qa_triage",
      status: "open",
      search: "checkout",
      sort: "updated_at",
      sortDir: "desc",
    });

    expect(state.search).toBe("");
    expect(state.status).toBeUndefined();
    expect(buildIssueListHref("/org/acme/issues", state, { includeProject: true })).toBe(
      "/org/acme/issues?view=qa_triage",
    );
  });

  it("builds permanent issue detail hrefs", () => {
    expect(
      buildIssueDetailHref({
        organizationSlug: "acme",
        projectId: "project_website",
        issueId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe("/org/acme/projects/project_website/issue-sheet/11111111-1111-4111-8111-111111111111");
  });
});
