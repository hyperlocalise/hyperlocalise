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
// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";

import { useKeyTranslationJobRefresh } from "./use-key-translation-job-refresh";

function setup(statuses: string[]) {
  const get = vi.fn(async () => ({ job: { status: statuses.shift() ?? "succeeded" } }));
  const goSvcClient = { job: { get } } as unknown as GoSvcClient;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queueKey = ["project-file-content-editor-queue", "acme", "project-1", "*", "tag-filter"];
  const targetKey = ["project-file-content-editor-segment-target", "acme", "project-1", "*", "x"];
  queryClient.setQueryData(queueKey, { segments: [] });
  queryClient.setQueryData(targetKey, { text: "" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      useKeyTranslationJobRefresh({
        organizationSlug: "acme",
        projectId: "project-1",
        goSvcClient,
      }),
    { wrapper },
  );
  return { follow: result.current, get, queryClient, queueKey, targetKey };
}

describe("useKeyTranslationJobRefresh", () => {
  it("reloads the project's strings while the job runs and stops polling once it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { follow, get, queryClient, queueKey, targetKey } = setup(["running", "succeeded"]);

      act(() => follow("job-1"));
      await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(queryClient.getQueryState(queueKey)?.isInvalidated).toBe(true));
      expect(queryClient.getQueryState(targetKey)?.isInvalidated).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(9000);
      });
      expect(get).toHaveBeenCalledTimes(2);
      expect(get).toHaveBeenCalledWith("acme", "job-1");
    } finally {
      vi.useRealTimers();
    }
  });
});
