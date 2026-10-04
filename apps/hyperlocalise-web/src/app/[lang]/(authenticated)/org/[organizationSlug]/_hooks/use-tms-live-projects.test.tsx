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

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useTmsLiveProjects } from "./use-tms-live-projects";

const fetchProjects = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          "tms-provider": {
            projects: {
              $get: fetchProjects,
            },
          },
        },
      },
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useTmsLiveProjects", () => {
  beforeEach(() => {
    fetchProjects.mockReset();
  });

  it("loads live projects with projects:read without checking the connection", async () => {
    fetchProjects.mockResolvedValue(
      new Response(JSON.stringify({ projects: [{ id: "ext:crowdin:100", name: "Docs" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useTmsLiveProjects("acme"), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: "ext:crowdin:100", name: "Docs" }]);
    });
    expect(fetchProjects).toHaveBeenCalledWith({ param: { organizationSlug: "acme" } });
  });

  it("treats a missing TMS connection as an empty list", async () => {
    fetchProjects.mockResolvedValue(
      new Response(JSON.stringify({ error: "no_active_tms_provider" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useTmsLiveProjects("acme"), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual([]);
    });
  });
});
