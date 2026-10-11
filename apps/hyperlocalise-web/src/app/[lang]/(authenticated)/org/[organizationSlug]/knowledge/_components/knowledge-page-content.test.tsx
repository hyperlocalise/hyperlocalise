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
  getKnowledgeMemory: vi.fn(),
  listDocuments: vi.fn(),
}));

vi.mock("./knowledge-memory-api", async () => {
  const actual =
    await vi.importActual<typeof import("./knowledge-memory-api")>("./knowledge-memory-api");
  return {
    ...actual,
    getKnowledgeMemory: mocks.getKnowledgeMemory,
  };
});

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    loading: false,
    client: {
      guidelines: {
        listDocuments: mocks.listDocuments,
      },
    },
  }),
}));

vi.mock("./knowledge-memory-editor", () => ({
  KnowledgeMemoryEditor: () => <div>knowledge-editor</div>,
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

function emptyKnowledgeResponse() {
  return {
    ok: true,
    headers: new Headers(),
    json: async () => ({ knowledgeMemory: { content: "" } }),
  };
}

describe("KnowledgePageContent", () => {
  it("hides file upload controls for readers", async () => {
    mocks.getKnowledgeMemory.mockResolvedValue(emptyKnowledgeResponse());
    mocks.listDocuments.mockResolvedValue([]);

    render(
      <KnowledgePageContent
        organizationSlug="acme"
        projectId="project_1"
        canUpdateKnowledgeMemory={false}
      />,
      { wrapper },
    );

    expect(await screen.findByText("knowledge-editor")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add sources" })).toBeNull();
    expect(screen.queryByText("Upload guideline")).toBeNull();
    expect(screen.queryByRole("button", { name: /choose a file/i })).toBeNull();
  });

  it("shows file upload controls for writers on an empty page", async () => {
    mocks.getKnowledgeMemory.mockResolvedValue(emptyKnowledgeResponse());
    mocks.listDocuments.mockResolvedValue([]);

    render(
      <KnowledgePageContent
        organizationSlug="acme"
        projectId="project_1"
        canUpdateKnowledgeMemory
      />,
      { wrapper },
    );

    expect(await screen.findByText("Upload guideline")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add sources" })).toBeNull();
  });
});
