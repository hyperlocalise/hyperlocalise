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

const getSearchConsole = vi.fn();

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      domains: {
        getSearchConsole,
      },
    },
    loading: false,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useDomainSearchConsole", () => {
  afterEach(() => {
    getSearchConsole.mockReset();
  });

  it("returns sample data for prototype domains without fetching", async () => {
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
    expect(getSearchConsole).not.toHaveBeenCalled();
  });

  it("loads Search Console performance for live domains", async () => {
    const snapshot = {
      ...getPrototypeSearchConsoleSnapshot("example.com"),
      status: "ready" as const,
    };
    getSearchConsole.mockResolvedValue(snapshot);

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
    expect(getSearchConsole).toHaveBeenCalledWith("acme", "11111111-1111-4111-8111-111111111111", {
      dateRange: "last_7_days",
      locale: "france-fr",
    });
  });
});
