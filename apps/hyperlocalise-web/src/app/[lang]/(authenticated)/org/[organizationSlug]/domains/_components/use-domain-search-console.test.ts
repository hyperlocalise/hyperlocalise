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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { getPrototypeSearchConsoleSnapshot } from "@/lib/gsc/prototype";

import { useDomainSearchConsole } from "./use-domain-search-console";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useDomainSearchConsole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns sample data for prototype domains without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        useDomainSearchConsole({
          organizationSlug: "acme",
          linkedDomainId: "hyperlocalise-com",
          domainKey: "hyperlocalise.com",
          localeId: "france-fr",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.live).toBe(false);
    expect(result.current.data).toEqual(getPrototypeSearchConsoleSnapshot("hyperlocalise.com"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads Search Console performance for live domains", async () => {
    const snapshot = {
      ...getPrototypeSearchConsoleSnapshot("example.com"),
      status: "ready" as const,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ searchConsole: snapshot }),
      }),
    );

    const { result } = renderHook(
      () =>
        useDomainSearchConsole({
          organizationSlug: "acme",
          linkedDomainId: "11111111-1111-4111-8111-111111111111",
          domainKey: "example.com",
          localeId: "france-fr",
          dateRange: "last_7_days",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.live).toBe(true);
    expect(result.current.data?.status).toBe("ready");
    expect(fetch).toHaveBeenCalledWith(
      "/api/orgs/acme/linked-domains/11111111-1111-4111-8111-111111111111/search-console?dateRange=last_7_days&locale=france-fr",
    );
  });
});
