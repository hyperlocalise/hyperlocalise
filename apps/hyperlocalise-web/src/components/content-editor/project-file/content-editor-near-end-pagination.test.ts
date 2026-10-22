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
  isNearEndOfVirtualList,
  planNearEndPageRequest,
} from "./content-editor-near-end-pagination";

describe("isNearEndOfVirtualList", () => {
  it("treats the last prefetch window as the end", () => {
    expect(
      isNearEndOfVirtualList({ lastVisibleIndex: 40, itemCount: 50, prefetchDistance: 10 }),
    ).toBe(true);
    expect(
      isNearEndOfVirtualList({ lastVisibleIndex: 39, itemCount: 50, prefetchDistance: 10 }),
    ).toBe(false);
  });
});

describe("planNearEndPageRequest", () => {
  it("requests the next page once while the viewport stays at the end", () => {
    const first = planNearEndPageRequest({
      isNearEnd: true,
      hasMore: true,
      isLoadingMore: false,
      alreadyRequestedAtEnd: false,
    });
    expect(first).toEqual({ request: true, requestedAtEnd: true });

    const afterAppend = planNearEndPageRequest({
      isNearEnd: true,
      hasMore: true,
      isLoadingMore: false,
      alreadyRequestedAtEnd: true,
    });
    expect(afterAppend).toEqual({ request: false, requestedAtEnd: true });
  });

  it("allows another request after the user leaves the end", () => {
    const leftEnd = planNearEndPageRequest({
      isNearEnd: false,
      hasMore: true,
      isLoadingMore: false,
      alreadyRequestedAtEnd: true,
    });
    expect(leftEnd).toEqual({ request: false, requestedAtEnd: false });

    const returned = planNearEndPageRequest({
      isNearEnd: true,
      hasMore: true,
      isLoadingMore: false,
      alreadyRequestedAtEnd: false,
    });
    expect(returned).toEqual({ request: true, requestedAtEnd: true });
  });

  it("keeps the in-flight request latched so completion does not refetch", () => {
    expect(
      planNearEndPageRequest({
        isNearEnd: true,
        hasMore: true,
        isLoadingMore: true,
        alreadyRequestedAtEnd: false,
      }),
    ).toEqual({ request: false, requestedAtEnd: true });
  });
});
