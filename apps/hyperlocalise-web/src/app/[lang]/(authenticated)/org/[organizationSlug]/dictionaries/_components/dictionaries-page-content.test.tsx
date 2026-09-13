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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DictionariesPageContent } from "./dictionaries-page-content";

const apiMocks = vi.hoisted(() => ({
  listDictionaries: vi.fn(),
  createDictionary: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/org/acme/dictionaries",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/navigation/use-org-router", () => ({
  useOrgRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => apiMocks.toastError(...args),
  },
}));

vi.mock("@/lib/spellcheck-dictionary/client", () => ({
  dictionaryClient: { list: apiMocks.listDictionaries, create: apiMocks.createDictionary },
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function dictionaryRecord(input: { id: string; name: string }) {
  return {
    id: input.id,
    name: input.name,
    description: "",
    status: "active" as const,
    wordsVersion: 1,
    wordCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderDictionariesPage({
  canWriteDictionaries = false,
}: {
  canWriteDictionaries?: boolean;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <DictionariesPageContent
          organizationSlug="acme"
          canWriteDictionaries={canWriteDictionaries}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("DictionariesPageContent", () => {
  beforeEach(() => {
    apiMocks.listDictionaries.mockReset();
    apiMocks.createDictionary.mockReset();
    apiMocks.toastError.mockReset();
    apiMocks.listDictionaries.mockResolvedValue(jsonResponse({ dictionaries: [], total: 0 }));
  });

  it("loads later dictionaries when Load more is clicked", async () => {
    const user = userEvent.setup();
    apiMocks.listDictionaries.mockImplementation(async (args: { query?: { offset?: string } }) => {
      const offset = Number(args.query?.offset ?? "0");
      if (offset === 0) {
        return jsonResponse({
          dictionaries: [dictionaryRecord({ id: "dict-1", name: "Brand names" })],
          total: 2,
        });
      }
      return jsonResponse({
        dictionaries: [dictionaryRecord({ id: "dict-2", name: "Product terms" })],
        total: 2,
      });
    });

    renderDictionariesPage();

    await waitFor(() => {
      expect(screen.getByText("Brand names")).toBeInTheDocument();
    });
    expect(screen.queryByText("Product terms")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(screen.getByText("Product terms")).toBeInTheDocument();
    });
    expect(apiMocks.listDictionaries).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ offset: "1" }),
      }),
    );
  });

  it("shows a toast and dialog error when creating a dictionary fails", async () => {
    const user = userEvent.setup();
    apiMocks.createDictionary.mockResolvedValue(
      jsonResponse({ error: "forbidden", message: "Insufficient permissions" }, 403),
    );

    renderDictionariesPage({ canWriteDictionaries: true });

    await user.click(screen.getByRole("button", { name: "Create dictionary" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("Brand names"), "Product terms");
    await user.click(within(dialog).getByRole("button", { name: "Create dictionary" }));

    await waitFor(() => {
      expect(apiMocks.toastError).toHaveBeenCalledWith("Insufficient permissions");
    });
    expect(within(dialog).getByText("Insufficient permissions")).toBeInTheDocument();
  });
});
