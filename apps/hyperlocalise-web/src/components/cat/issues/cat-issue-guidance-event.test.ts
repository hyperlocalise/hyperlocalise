// @vitest-environment happy-dom
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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  CAT_ISSUE_GUIDANCE_OPEN_EVENT,
  EMPTY_CAT_ISSUE_GUIDANCE_STATUS,
  getCatIssueGuidanceServerSnapshot,
  getCatIssueGuidanceStatus,
  requestCatIssueGuidance,
  setCatIssueGuidanceStatus,
  subscribeCatIssueGuidance,
} from "./cat-issue-guidance-event";

describe("cat-issue-guidance-event", () => {
  afterEach(() => {
    setCatIssueGuidanceStatus(EMPTY_CAT_ISSUE_GUIDANCE_STATUS);
  });

  it("updates status and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCatIssueGuidance(listener);

    setCatIssueGuidanceStatus({ available: true, openIssueCount: 3 });

    expect(getCatIssueGuidanceStatus()).toEqual({
      available: true,
      openIssueCount: 3,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("skips notification when status is unchanged", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCatIssueGuidance(listener);

    setCatIssueGuidanceStatus({ available: true, openIssueCount: 1 });
    setCatIssueGuidanceStatus({ available: true, openIssueCount: 1 });

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCatIssueGuidance(listener);

    unsubscribe();
    setCatIssueGuidanceStatus({ available: true, openIssueCount: 2 });

    expect(listener).not.toHaveBeenCalled();
  });

  it("dispatches the open event on request", () => {
    const handler = vi.fn();
    window.addEventListener(CAT_ISSUE_GUIDANCE_OPEN_EVENT, handler);

    requestCatIssueGuidance();

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(CAT_ISSUE_GUIDANCE_OPEN_EVENT, handler);
  });

  it("returns an empty server snapshot", () => {
    setCatIssueGuidanceStatus({ available: true, openIssueCount: 4 });
    expect(getCatIssueGuidanceServerSnapshot()).toEqual(EMPTY_CAT_ISSUE_GUIDANCE_STATUS);
  });
});
