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

import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  MemoryEntriesResponse,
  MemoryEntryDetailResponse,
  MemoryEntryRecord,
} from "@/api/routes/memory/memory.schema";
import { ApiResponseError } from "@/lib/api-error";

import { TmEntryExplorer } from "./tm-entry-explorer";

const navigation = vi.hoisted(() => ({
  pathname: "/en/org/acme/translation-memories/mem_1",
  search: "",
  replace: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  getEntries: vi.fn(),
  getEntry: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    replace: navigation.replace,
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          "translation-memories": {
            ":memoryId": {
              entries: {
                $get: (...args: unknown[]) => apiMocks.getEntries(...args),
                ":entryId": {
                  $get: (...args: unknown[]) => apiMocks.getEntry(...args),
                },
              },
            },
          },
        },
      },
    },
  },
}));

function createEntry(overrides?: Partial<MemoryEntryRecord>): MemoryEntryRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    memoryId: "mem_1",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    sourceText: "Checkout",
    targetText: "Paiement",
    matchScore: 100,
    provenance: "manual",
    reviewStatus: "approved",
    externalKey: null,
    version: 1,
    createdByUserId: "11111111-1111-4111-8111-111111111111",
    modifiedByUserId: null,
    reviewedByUserId: null,
    importBatchId: null,
    metadata: {},
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    reviewedAt: null,
    ...overrides,
  };
}

function createPage(
  entries: MemoryEntryRecord[],
  overrides?: Partial<MemoryEntriesResponse>,
): MemoryEntriesResponse {
  return {
    memoryEntries: entries,
    nextCursor: null,
    total: entries.length,
    pagination: {
      limit: 50,
      returned: entries.length,
      hasMore: false,
    },
    ...overrides,
  };
}

function jsonResponse(body: MemoryEntriesResponse) {
  return {
    ok: true,
    json: async () => body,
  };
}

function createDetail(entry: MemoryEntryRecord): MemoryEntryDetailResponse {
  const emptyActor = {
    userId: null,
    displayName: null,
    at: null,
    source: "created" as const,
  };
  return {
    memoryEntry: entry,
    provenance: {
      origin: entry.provenance,
      provider: null,
      importBatchId: entry.importBatchId,
      context: typeof entry.metadata.context === "string" ? entry.metadata.context : null,
      created: {
        ...emptyActor,
        userId: entry.createdByUserId,
        at: entry.createdAt,
        source: "created",
      },
      modified: { ...emptyActor, at: entry.updatedAt, source: "modified" },
      reviewed: { ...emptyActor, source: "reviewed" },
      imported: { ...emptyActor, source: "imported" },
      providerSupplied: { ...emptyActor, source: "provider" },
    },
    variants: [],
    auditEvents: [
      {
        id: `${entry.id}:created`,
        eventType: "created",
        actorKind: "user",
        actorUserId: entry.createdByUserId,
        actorDisplayName: null,
        version: 1,
        changedFields: [],
        attributes: {},
        occurredAt: entry.createdAt,
      },
    ],
    capabilities: { canEdit: true, readOnlyReason: null },
  };
}

function renderExplorer(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  const ui: ReactElement = (
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <TmEntryExplorer
          organizationSlug="acme"
          memoryId="mem_1"
          localeCoverage={["en-US", "fr-FR"]}
          canEdit
        />
      </QueryClientProvider>
    </IntlProvider>
  );
  return render(ui);
}

describe("TmEntryExplorer", () => {
  beforeEach(() => {
    navigation.search = "";
    navigation.replace.mockReset();
    apiMocks.getEntries.mockReset();
    apiMocks.getEntry.mockReset();
    apiMocks.getEntry.mockImplementation(async () => ({
      ok: true,
      json: async () => createDetail(createEntry()),
    }));
    sessionStorage.clear();
  });

  it("shows a loading state before entries arrive", async () => {
    let resolvePage: ((value: ReturnType<typeof jsonResponse>) => void) | undefined;
    apiMocks.getEntries.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );

    renderExplorer();

    expect(screen.getByLabelText("Loading translation memory entries")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading entries");

    resolvePage?.(jsonResponse(createPage([])));
    await waitFor(() => {
      expect(screen.getByText("No entries yet.")).toBeInTheDocument();
    });
  });

  it("shows an empty filtered state from the server result", async () => {
    navigation.search = "search=invoice";
    apiMocks.getEntries.mockResolvedValue(jsonResponse(createPage([])));

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText("No entries match this search.")).toBeInTheDocument();
    });
    expect(apiMocks.getEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ search: "invoice" }),
      }),
      expect.objectContaining({
        init: expect.objectContaining({ signal: expect.any(AbortSignal) }),
      }),
    );
  });

  it("shows an error state and retries the same query", async () => {
    const user = userEvent.setup();
    apiMocks.getEntries
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "memory_unavailable", message: "Unable to load entries." }),
      })
      .mockResolvedValueOnce(jsonResponse(createPage([createEntry()])));

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getByText("Checkout")).toBeInTheDocument();
    });
    expect(apiMocks.getEntries).toHaveBeenCalledTimes(2);
  });

  it("pages forward with the server cursor and can return to the first page", async () => {
    const user = userEvent.setup();
    const first = createEntry({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sourceText: "First page",
    });
    const second = createEntry({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      sourceText: "Second page",
    });

    apiMocks.getEntries.mockImplementation(async (args: { query?: { cursor?: string } }) => {
      if (args.query?.cursor === "cursor-2") {
        return jsonResponse(
          createPage([second], {
            total: 2,
            nextCursor: null,
            pagination: { limit: 50, returned: 1, hasMore: false },
          }),
        );
      }
      return jsonResponse(
        createPage([first], {
          total: 2,
          nextCursor: "cursor-2",
          pagination: { limit: 50, returned: 1, hasMore: true },
        }),
      );
    });

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText("First page")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByText("Second page")).toBeInTheDocument();
    });
    expect(navigation.replace).toHaveBeenCalledWith(expect.stringContaining("cursor=cursor-2"), {
      scroll: false,
    });
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Previous" }));

    await waitFor(() => {
      expect(screen.getByText("First page")).toBeInTheDocument();
    });
  });

  it("disables Previous on a deep-linked page when the cursor stack is missing", async () => {
    navigation.search = "cursor=cursor-3";
    apiMocks.getEntries.mockResolvedValue(
      jsonResponse(
        createPage([createEntry({ sourceText: "Deep page" })], {
          total: 150,
          nextCursor: "cursor-4",
          pagination: { limit: 50, returned: 1, hasMore: true },
        }),
      ),
    );

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText("Deep page")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("restores search, filters, and sort from the URL", async () => {
    navigation.search =
      "search=checkout&sourceLocale=en-US&targetLocale=fr-FR&reviewStatus=pending&origin=import&provider=crowdin&sort=updated_at&sortDir=asc";
    apiMocks.getEntries.mockResolvedValue(jsonResponse(createPage([createEntry()])));

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByDisplayValue("checkout")).toBeInTheDocument();
    });
    expect(screen.getByText(/Search: checkout/)).toBeInTheDocument();
    expect(screen.getByLabelText("Sort by")).toHaveTextContent("Modified");
    expect(screen.getByLabelText("Order")).toHaveTextContent("Oldest first");
    expect(apiMocks.getEntries).toHaveBeenCalledWith(
      {
        param: { organizationSlug: "acme", memoryId: "mem_1" },
        query: {
          limit: "50",
          search: "checkout",
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          reviewStatus: "pending",
          origin: "import",
          provider: "crowdin",
          sort: "updated_at",
          sortDir: "asc",
        },
      },
      expect.objectContaining({
        init: expect.objectContaining({ signal: expect.any(AbortSignal) }),
      }),
    );
  });

  it("does not display a stale page after a newer query resolves first", async () => {
    const user = userEvent.setup();
    let resolveStale: ((value: ReturnType<typeof jsonResponse>) => void) | undefined;
    apiMocks.getEntries
      .mockImplementationOnce((_args, options: { init?: { signal?: AbortSignal } }) => {
        return new Promise((resolve, reject) => {
          options.init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
          resolveStale = resolve;
        });
      })
      .mockImplementationOnce(async () =>
        jsonResponse(createPage([createEntry({ sourceText: "Invoice latest" })])),
      );

    renderExplorer();
    expect(screen.getByLabelText("Loading translation memory entries")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search source and target text"), "invoice");

    await waitFor(
      () => {
        expect(apiMocks.getEntries).toHaveBeenCalledTimes(2);
      },
      { timeout: 1500 },
    );

    await waitFor(() => {
      expect(screen.getByText("Invoice latest")).toBeInTheDocument();
    });

    resolveStale?.(jsonResponse(createPage([createEntry({ sourceText: "Stale checkout" })])));

    await waitFor(() => {
      expect(screen.getByText("Invoice latest")).toBeInTheDocument();
    });
    expect(screen.queryByText("Stale checkout")).not.toBeInTheDocument();
  });

  it("preserves query state when opening and returning from an entry", async () => {
    const user = userEvent.setup();
    navigation.search = "search=checkout";
    apiMocks.getEntries.mockResolvedValue(jsonResponse(createPage([createEntry()])));

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText("Checkout")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Open entry Checkout" }));

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith(
        expect.stringMatching(/search=checkout.*entry=33333333-3333-4333-8333-333333333333/),
        { scroll: false },
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Translation memory entry")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Back to results" }));

    await waitFor(() => {
      expect(screen.queryByText("Translation memory entry")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Back to results" })).not.toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("checkout")).toBeInTheDocument();
    expect(screen.getByText("Checkout")).toBeInTheDocument();
  });

  it("resets an invalid cursor to the first page", async () => {
    navigation.search = "cursor=expired";
    apiMocks.getEntries.mockImplementation(async (args: { query?: { cursor?: string } }) => {
      if (args.query?.cursor) {
        throw new ApiResponseError("Cursor is invalid", {
          code: "invalid_cursor",
          status: 400,
        });
      }
      return jsonResponse(createPage([createEntry()]));
    });

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText("Checkout")).toBeInTheDocument();
    });
    expect(
      screen.getAllByText("That page is no longer valid. Showing the first page.").length,
    ).toBeGreaterThan(0);
    expect(navigation.replace).toHaveBeenCalledWith("/en/org/acme/translation-memories/mem_1", {
      scroll: false,
    });
  });
});
