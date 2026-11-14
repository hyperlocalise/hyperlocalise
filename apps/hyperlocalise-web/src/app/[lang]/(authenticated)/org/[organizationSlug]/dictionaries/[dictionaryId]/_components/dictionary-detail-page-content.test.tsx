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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DictionaryDetailPageContent } from "./dictionary-detail-page-content";

const apiMocks = vi.hoisted(() => ({
  getDictionary: vi.fn(),
  getWords: vi.fn(),
  getProjects: vi.fn(),
  attachProject: vi.fn(),
  detachProject: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/org/acme/dictionaries/11111111-1111-4111-8111-111111111111",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/spellcheck-dictionary/client", () => ({
  createDictionaryClient: () => ({
    get: apiMocks.getDictionary,
    words: apiMocks.getWords,
    projects: apiMocks.getProjects,
    attachProject: apiMocks.attachProject,
    detachProject: apiMocks.detachProject,
  }),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: { project: { list: apiMocks.listProjects } },
    loading: false,
  }),
}));

function renderDetailPage({
  canWriteDictionaries = false,
}: { canWriteDictionaries?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <DictionaryDetailPageContent
          organizationSlug="acme"
          dictionaryId="11111111-1111-4111-8111-111111111111"
          canWriteDictionaries={canWriteDictionaries}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("DictionaryDetailPageContent", () => {
  beforeEach(() => {
    apiMocks.getDictionary.mockReset();
    apiMocks.getWords.mockReset();
    apiMocks.getProjects.mockReset();
    apiMocks.attachProject.mockReset();
    apiMocks.detachProject.mockReset();
    apiMocks.listProjects.mockReset();

    apiMocks.getDictionary.mockResolvedValue({
      dictionary: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Brand names",
        description: "Accepted tokens",
        status: "active",
        wordsVersion: 1,
        wordCount: 201,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    apiMocks.getProjects.mockResolvedValue({
      projects: [{ projectId: "project-1", projectName: "Marketing site", priority: 0 }],
    });
    apiMocks.listProjects.mockResolvedValue({
      projects: [
        { id: "project-1", name: "Marketing site" },
        { id: "project-2", name: "Help center" },
      ],
    });
    apiMocks.attachProject.mockResolvedValue({ projects: [] });
  });

  it("loads later dictionary words when Load more is clicked", async () => {
    const user = userEvent.setup();
    apiMocks.getWords.mockImplementation(async (args: { query?: { offset?: string } }) => {
      const offset = Number(args.query?.offset ?? "0");
      if (offset === 0) {
        return {
          words: [{ id: "word-1", locale: "en-US", word: "AuthKit", createdAt: "2026-01-01" }],
          total: 2,
        };
      }
      return {
        words: [{ id: "word-2", locale: "en-US", word: "Hyperlocalise", createdAt: "2026-01-01" }],
        total: 2,
      };
    });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("AuthKit")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Dictionaries" })).toHaveAttribute(
      "href",
      "/org/acme/dictionaries",
    );
    expect(screen.getByText("Accepted tokens")).toBeInTheDocument();
    expect(screen.getByText("Used in")).toBeInTheDocument();
    expect(screen.getByText("Marketing site")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign project" })).not.toBeInTheDocument();
    expect(screen.queryByText("Hyperlocalise")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(screen.getByText("Hyperlocalise")).toBeInTheDocument();
    });
    expect(apiMocks.getWords).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ offset: "1" }),
      }),
    );
  });

  it("assigns a project from the header chips", async () => {
    const user = userEvent.setup();
    apiMocks.getWords.mockResolvedValue({ words: [], total: 0 });

    renderDetailPage({ canWriteDictionaries: true });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Assign project" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Assign project" }));
    await user.click(await screen.findByRole("menuitem", { name: "Help center" }));

    await waitFor(() => {
      expect(apiMocks.attachProject).toHaveBeenCalledWith(
        expect.objectContaining({
          json: { projectId: "project-2" },
        }),
      );
    });
  });
});
