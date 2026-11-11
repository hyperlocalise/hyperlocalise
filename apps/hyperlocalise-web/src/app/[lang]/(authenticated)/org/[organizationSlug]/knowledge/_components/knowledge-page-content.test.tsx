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
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  listAllDocumentAssignments: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    loading: false,
    client: {
      guidelines: {
        listDocuments: mocks.listDocuments,
        listAllDocumentAssignments: mocks.listAllDocumentAssignments,
      },
      project: {
        list: mocks.listProjects,
      },
    },
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { KnowledgePageContent } = await import("./knowledge-page-content");

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </IntlProvider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("KnowledgePageContent", () => {
  it("hides the upload link for readers", async () => {
    mocks.listDocuments.mockResolvedValue([]);
    mocks.listAllDocumentAssignments.mockResolvedValue({ assignments: [] });

    render(
      <KnowledgePageContent
        organizationSlug="acme"
        projectId="project_1"
        canUpdateKnowledgeMemory={false}
      />,
      { wrapper },
    );

    expect(await screen.findByRole("heading", { name: "Guideline" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create Guideline" })).toBeNull();
  });

  it("links writers to the org upload page with the project preselected", async () => {
    mocks.listDocuments.mockResolvedValue([]);
    mocks.listAllDocumentAssignments.mockResolvedValue({ assignments: [] });

    render(
      <KnowledgePageContent
        organizationSlug="acme"
        projectId="project_1"
        canUpdateKnowledgeMemory
      />,
      { wrapper },
    );

    expect(await screen.findByRole("button", { name: "Create Guideline" })).toHaveAttribute(
      "href",
      "/org/acme/knowledge/upload?project=project_1",
    );
  });

  it("links writers to the workspace upload page", async () => {
    mocks.listDocuments.mockResolvedValue([]);
    mocks.listProjects.mockResolvedValue({ projects: [] });

    render(<KnowledgePageContent organizationSlug="acme" canUpdateKnowledgeMemory />, {
      wrapper,
    });

    expect(await screen.findByRole("button", { name: "Create Guideline" })).toHaveAttribute(
      "href",
      "/org/acme/knowledge/upload",
    );
  });
});
