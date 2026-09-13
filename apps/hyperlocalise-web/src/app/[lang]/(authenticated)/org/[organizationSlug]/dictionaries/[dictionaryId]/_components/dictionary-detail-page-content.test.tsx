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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DictionaryDetailPageContent } from "./dictionary-detail-page-content";

const apiMocks = vi.hoisted(() => ({
  getDictionary: vi.fn(),
  getWords: vi.fn(),
  getProjects: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          dictionaries: {
            ":dictionaryId": {
              $get: apiMocks.getDictionary,
              words: {
                $get: apiMocks.getWords,
              },
              projects: {
                $get: apiMocks.getProjects,
              },
            },
          },
        },
      },
    },
  },
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <DictionaryDetailPageContent
          organizationSlug="acme"
          dictionaryId="11111111-1111-4111-8111-111111111111"
          canWriteDictionaries={false}
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

    apiMocks.getDictionary.mockResolvedValue(
      jsonResponse({
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
      }),
    );
    apiMocks.getProjects.mockResolvedValue(jsonResponse({ projects: [] }));
  });

  it("loads later dictionary words when Load more is clicked", async () => {
    const user = userEvent.setup();
    apiMocks.getWords.mockImplementation(async (args: { query?: { offset?: string } }) => {
      const offset = Number(args.query?.offset ?? "0");
      if (offset === 0) {
        return jsonResponse({
          words: [{ id: "word-1", locale: "en-US", word: "AuthKit", createdAt: "2026-01-01" }],
          total: 2,
        });
      }
      return jsonResponse({
        words: [
          { id: "word-2", locale: "en-US", word: "Hyperlocalise", createdAt: "2026-01-01" },
        ],
        total: 2,
      });
    });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("AuthKit")).toBeInTheDocument();
    });
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
});
