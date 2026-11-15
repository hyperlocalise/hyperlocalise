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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const getMock = vi.hoisted(() => vi.fn());
const postMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const revokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              "ota-distributions": Object.assign(
                {
                  $get: (...args: unknown[]) => getMock(...args),
                  $post: (...args: unknown[]) => postMock(...args),
                },
                {
                  ":distributionId": {
                    release: { $post: (...args: unknown[]) => releaseMock(...args) },
                    rotate: { $post: vi.fn() },
                    revoke: { $post: (...args: unknown[]) => revokeMock(...args) },
                  },
                },
              ),
            },
          },
        },
      },
    },
  },
}));

import { ProjectCdnDistributionsPanel } from "./project-cdn-distributions-panel";

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en" messages={{}}>
          {children}
        </IntlProvider>
      </QueryClientProvider>
    );
  }
  return render(<ProjectCdnDistributionsPanel organizationSlug="acme" projectId="project_1" />, {
    wrapper: Wrapper,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProjectCdnDistributionsPanel", () => {
  it("lists a distribution and releases it", async () => {
    getMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        distributions: [
          {
            id: "dist_1",
            name: "Mobile JSON",
            publicHash: "a".repeat(32),
            format: "json",
            branchName: "main",
            fileIds: ["file_1"],
            locales: ["fr-FR"],
            destinationId: null,
            destinationName: "Hyperlocalise CDN",
            manifestUrl: "https://ota.test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest.json",
            revokedAt: null,
            latestRelease: null,
          },
        ],
        files: [{ id: "file_1", sourcePath: "messages.json", branchName: "main" }],
        branches: [{ name: "main", title: null }],
        locales: ["en-US", "fr-FR"],
        destinations: [],
      }),
    });
    releaseMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText("Mobile JSON")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Release" }));
    expect(releaseMock).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(revokeMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Revoke this distribution?")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    expect(revokeMock).toHaveBeenCalled();
  });
});
