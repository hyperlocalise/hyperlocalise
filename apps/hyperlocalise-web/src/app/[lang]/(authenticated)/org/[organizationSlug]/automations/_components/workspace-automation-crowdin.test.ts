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
import { describe, expect, it } from "vite-plus/test";

import {
  collectCrowdinProjects,
  isCrowdinAutomationConnected,
  isCrowdinLinkedProject,
} from "./workspace-automation-crowdin";

describe("workspace automation Crowdin connection", () => {
  it("treats Crowdin as connected from the active TMS provider, not native projects", () => {
    expect(isCrowdinAutomationConnected("crowdin")).toBe(true);
    expect(isCrowdinAutomationConnected("phrase")).toBe(false);
    expect(isCrowdinAutomationConnected(null)).toBe(false);
    expect(isCrowdinAutomationConnected(undefined)).toBe(false);
  });

  it("recognizes Crowdin-linked projects by provider kind or encoded id", () => {
    expect(
      isCrowdinLinkedProject({
        id: "project_website",
        externalProviderKind: "crowdin",
      }),
    ).toBe(true);
    expect(
      isCrowdinLinkedProject({
        id: "ext:crowdin:42",
        externalProviderKind: null,
      }),
    ).toBe(true);
    expect(
      isCrowdinLinkedProject({
        id: "project_website",
        externalProviderKind: null,
      }),
    ).toBe(false);
  });

  it("collects Crowdin projects from live TMS results when native lists omit them", () => {
    expect(
      collectCrowdinProjects(
        [{ id: "project_website", externalProviderKind: null }],
        [
          {
            id: "ext:crowdin:42",
            externalProviderKind: "crowdin",
          },
        ],
      ),
    ).toEqual([
      {
        id: "ext:crowdin:42",
        externalProviderKind: "crowdin",
      },
    ]);
  });

  it("dedupes native and live Crowdin projects by id", () => {
    expect(
      collectCrowdinProjects(
        [{ id: "ext:crowdin:42", externalProviderKind: "crowdin" }],
        [{ id: "ext:crowdin:42", externalProviderKind: "crowdin" }],
      ),
    ).toEqual([{ id: "ext:crowdin:42", externalProviderKind: "crowdin" }]);
  });
});
