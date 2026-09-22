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
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type {
  ContentEditorQueueFilter,
  ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { useContentEditorSegmentQuery } from "./use-content-editor-segment-query";

const baseInput: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  enabled: boolean;
  initialQueueFilter: ContentEditorQueueFilter;
  initialQueueSort: ContentEditorQueueSort;
  initialSearch: string;
} = {
  organizationSlug: "acme",
  projectId: "proj_1",
  sourcePath: "en.json",
  targetLocale: "fr",
  enabled: false,
  initialQueueFilter: "all",
  initialQueueSort: "file_order",
  initialSearch: "",
};

function renderQuery(initial = baseInput) {
  return renderHook((props: typeof baseInput) => useContentEditorSegmentQuery(props), {
    wrapper: ContentEditorTestProviders,
    initialProps: initial,
  });
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useContentEditorSegmentQuery queue restore", () => {
  it("keeps local filter edits until the file identity or history changes", () => {
    const { result, rerender } = renderQuery();
    act(() => {
      result.current.setQueueFilter("untranslated");
      result.current.setSearch("checkout");
    });
    rerender(baseInput);
    expect(result.current.queueFilter).toBe("untranslated");
    expect(result.current.search).toBe("checkout");
  });

  it("reapplies URL queue params when the selected file changes", () => {
    const { result, rerender } = renderQuery();
    act(() => {
      result.current.setQueueFilter("untranslated");
      result.current.setSearch("checkout");
    });
    rerender({
      ...baseInput,
      sourcePath: "de.json",
      initialQueueFilter: "needs_review",
      initialSearch: "welcome",
    });
    expect(result.current.queueFilter).toBe("needs_review");
    expect(result.current.search).toBe("welcome");
  });

  it("reapplies restored queue params on Back/Forward", () => {
    const { result } = renderQuery();
    act(() => {
      result.current.setQueueFilter("untranslated");
      result.current.setSearch("checkout");
      result.current.setQueueSort("untranslated_first");
    });
    window.history.replaceState(
      null,
      "",
      "?sourcePath=en.json&queueFilter=needs_review&queueSort=file_order&search=welcome",
    );
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.queueFilter).toBe("needs_review");
    expect(result.current.queueSort).toBe("file_order");
    expect(result.current.search).toBe("welcome");
  });
});
