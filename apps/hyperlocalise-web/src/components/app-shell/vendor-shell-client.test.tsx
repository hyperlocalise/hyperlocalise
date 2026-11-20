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
import type { ComponentProps } from "react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { TooltipProvider } from "@/components/ui/tooltip";

const mocks = vi.hoisted(() => ({ pathname: "/org/acme/my-jobs", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch: _prefetch,
    ...props
  }: ComponentProps<"a"> & {
    href: string;
    prefetch?: boolean;
  }) => <a href={href} {...props} />,
}));
// A server action: the app's build replaces it with a reference, a test would load its server code.
vi.mock("@/app/auth/leave-workspace/actions", () => ({
  finishLeavingWorkspaceAction: vi.fn(async () => ({ redirectTo: "/dashboard" })),
}));
vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({ client: {}, loading: false }),
}));

import { VendorShellClient } from "./vendor-shell-client";

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <TooltipProvider>
          <VendorShellClient
            activeOrganization={{ name: "Acme Localization", slug: "acme" }}
            isOnlyWorkspace
            user={{ id: "user_vera", name: "Vera Vendor", email: "vera@example.com" }}
          >
            <p>Page content</p>
          </VendorShellClient>
        </TooltipProvider>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("the vendor's page frame", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
  });

  it("shows the page and one place to go on a page a vendor may open", () => {
    mocks.pathname = "/en/org/acme/projects/project_1/jobs/job_1";
    renderShell();

    expect(screen.getByText("Page content")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/org/acme/my-jobs");
    }
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("hides the page and sends the vendor to My jobs from any other page", async () => {
    mocks.pathname = "/org/acme/glossaries";
    renderShell();

    expect(screen.queryByText("Page content")).toBeNull();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/org/acme/my-jobs"));
  });
});
