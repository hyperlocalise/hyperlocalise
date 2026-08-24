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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ProjectCatBehaviorSettings } from "./project-cat-behavior-settings";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSettings(canManage = true) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requests.push({ url, init });
      if (url.endsWith("/preview")) {
        return new Response(JSON.stringify({ preview: { affectedOccurrences: 7, groups: 3 } }), {
          status: 200,
        });
      }
      if (init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            catBehavior: {
              automaticallyGroupIdenticalStrings: true,
              groupingRevision: 1,
              canManage: true,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          catBehavior: {
            automaticallyGroupIdenticalStrings: false,
            groupingRevision: 0,
            canManage,
          },
        }),
        { status: 200 },
      );
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <IntlProvider locale="en" messages={{}}>
        <ProjectCatBehaviorSettings
          organizationSlug="acme"
          projectId="project_1"
          canManage={canManage}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
  return requests;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProjectCatBehaviorSettings", () => {
  it("previews impact and promises translations remain unchanged before enabling", async () => {
    const user = userEvent.setup();
    const requests = renderSettings();
    const setting = await screen.findByRole("switch", {
      name: "Automatically group identical strings",
    });

    await user.click(setting);

    expect(await screen.findByText(/7 occurrences into 3 groups/)).toBeInTheDocument();
    expect(screen.getByText(/Existing translations will not be changed/)).toBeInTheDocument();
    expect(requests.some(({ url }) => url.endsWith("/preview"))).toBe(true);
  });

  it("keeps the setting read-only for non-managers", async () => {
    renderSettings(false);
    const setting = await screen.findByRole("switch", {
      name: "Automatically group identical strings",
    });
    await waitFor(() => expect(setting).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByText("Only project managers can change this setting.")).toBeInTheDocument();
  });
});
