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
import type { ComponentProps, ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { ProjectBreadcrumbSelector } from "./project-breadcrumb-selector";

const { listProjectsMock, pushMock } = vi.hoisted(() => ({
  listProjectsMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/projects/proj_1/settings",
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      project: {
        list: (...args: unknown[]) => listProjectsMock(...args),
      },
    },
    loading: false,
  }),
}));

function renderSelector(props: Partial<ComponentProps<typeof ProjectBreadcrumbSelector>> = {}) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
          },
        })
      }
    >
      <IntlProvider locale="en" messages={{}}>
        <ProjectBreadcrumbSelector
          organizationSlug="acme"
          projectId="proj_1"
          projectName="Checkout"
          section="settings"
          {...props}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("ProjectBreadcrumbSelector", () => {
  it("links the project crumb to the project when only one project exists", async () => {
    listProjectsMock.mockResolvedValue({
      projects: [{ id: "proj_1", name: "Checkout" }],
    });

    renderSelector();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Checkout" })).toHaveAttribute(
        "href",
        "/org/acme/projects/proj_1",
      );
      expect(screen.queryByRole("button", { name: "Switch project" })).not.toBeInTheDocument();
    });
  });

  it("links the current project and switches another project to the same section", async () => {
    listProjectsMock.mockResolvedValue({
      projects: [
        { id: "proj_1", name: "Checkout" },
        { id: "proj_2", name: "Marketing" },
      ],
    });

    const user = userEvent.setup();
    renderSelector();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Checkout" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("menuitem", { name: "Marketing" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/org/acme/projects/proj_2/settings",
      expect.objectContaining({}),
    );
  });
});
