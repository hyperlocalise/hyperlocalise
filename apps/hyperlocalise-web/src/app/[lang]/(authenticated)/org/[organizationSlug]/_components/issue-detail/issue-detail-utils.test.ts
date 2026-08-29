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

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildIssueCatHref,
  buildIssueDetailHref,
  isExternalHttpUrl,
  isHttpOrHttpsUrl,
  issueSheetApiPath,
  truncateIssueTitleForBreadcrumb,
} from "./issue-detail-utils";

describe("issue-detail-utils", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only http and https link URLs", () => {
    expect(isHttpOrHttpsUrl("https://example.com/path")).toBe(true);
    expect(isHttpOrHttpsUrl("http://example.com")).toBe(true);
    expect(isHttpOrHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpOrHttpsUrl("data:text/html,hi")).toBe(false);
    expect(isHttpOrHttpsUrl("/relative/path")).toBe(false);
    expect(isHttpOrHttpsUrl("not a url")).toBe(false);
    expect(isHttpOrHttpsUrl("")).toBe(false);
  });

  it("treats same-origin http(s) links as internal and others as external", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.hyperlocalise.test" },
    });

    expect(isExternalHttpUrl("https://app.hyperlocalise.test/org/acme/issues")).toBe(false);
    expect(isExternalHttpUrl("https://tracker.example.com/ABC-1")).toBe(true);
    expect(isExternalHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("returns false for external checks when window is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(isExternalHttpUrl("https://tracker.example.com/ABC-1")).toBe(false);
  });

  it("builds CAT hrefs only when source path and locale are present", () => {
    expect(
      buildIssueCatHref("acme", "project_website", {
        sourcePath: null,
        targetLocale: "fr-FR",
        segmentId: "seg_1",
      }),
    ).toBeNull();

    expect(
      buildIssueCatHref("acme", "project_website", {
        sourcePath: "src/messages.json",
        targetLocale: null,
        segmentId: "seg_1",
      }),
    ).toBeNull();

    expect(
      buildIssueCatHref("acme", "project_website", {
        sourcePath: "src/messages.json",
        targetLocale: "fr-FR",
        segmentId: null,
      }),
    ).toBe(
      "/org/acme/projects/project_website/files/content-editor?sourcePath=src%2Fmessages.json&locale=fr-FR",
    );

    expect(
      buildIssueCatHref("acme", "project/with spaces", {
        sourcePath: "src/messages.json",
        targetLocale: "fr-FR",
        segmentId: "seg_1",
      }),
    ).toBe(
      "/org/acme/projects/project%2Fwith%20spaces/files/content-editor?sourcePath=src%2Fmessages.json&locale=fr-FR&segment=seg_1",
    );
  });

  it("encodes permanent issue detail and API paths", () => {
    expect(
      buildIssueDetailHref({
        organizationSlug: "acme/team",
        projectId: "project/with spaces",
        issueId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(
      "/org/acme%2Fteam/projects/project%2Fwith%20spaces/issue-sheet/11111111-1111-4111-8111-111111111111",
    );

    expect(issueSheetApiPath("acme/team", "project/with spaces")).toBe(
      "/api/orgs/acme%2Fteam/projects/project%2Fwith%20spaces/issue-sheet",
    );
  });

  it("truncates breadcrumb titles without cutting mid-ellipsis padding", () => {
    expect(truncateIssueTitleForBreadcrumb("  Short title  ")).toBe("Short title");
    expect(truncateIssueTitleForBreadcrumb("a".repeat(72))).toBe("a".repeat(72));

    const longTitle = `${"word ".repeat(20)}end`;
    const truncated = truncateIssueTitleForBreadcrumb(longTitle, 20);
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(20);
    expect(truncated.includes("  ")).toBe(false);
  });
});
