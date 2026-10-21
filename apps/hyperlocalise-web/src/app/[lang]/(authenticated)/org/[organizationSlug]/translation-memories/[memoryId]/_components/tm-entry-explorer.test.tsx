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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  MemoryEntriesResponse,
  MemoryEntryDetailResponse,
  MemoryEntryRecord,
} from "@/api/routes/memory/memory.schema";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

import { TmEntryExplorer } from "./tm-entry-explorer";

const navigation = vi.hoisted(() => ({
  pathname: "/en/org/acme/translation-memories/mem_1",
  search: "",
  replace: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  listEntries: vi.fn(),
  getEntry: vi.fn(),
  getReviewSummary: vi.fn(),
  bulkReview: vi.fn(),
  bulkDelete: vi.fn(),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    loading: false,
    client: {
      memory: {
        entries: {
          list: (...args: unknown[]) => apiMocks.listEntries(...args),
          get: (...args: unknown[]) => apiMocks.getEntry(...args),
        },
      },
    },
  }),
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
                "review-summary": {
                  $get: (...args: unknown[]) => apiMocks.getReviewSummary(...args),
                },
                "bulk-review": {
                  $post: (...args: unknown[]) => apiMocks.bulkReview(...args),
                },
                "bulk-delete": {
                  $post: (...args: unknown[]) => apiMocks.bulkDelete(...args),
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
  return body;
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

function renderExplorer(
  overrides?: Partial<Parameters<typeof TmEntryExplorer>[0]>,
): ReturnType<typeof render> {
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
          {...overrides}
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
    apiMocks.listEntries.mockReset();
    apiMocks.getEntry.mockReset();
    apiMocks.getReviewSummary.mockReset();
    apiMocks.bulkReview.mockReset();
    apiMocks.bulkDelete.mockReset();
    apiMocks.getReviewSummary.mockResolvedValue({
      ok: true,
      json: async () => ({ reviewSummary: { pending: 0, rejected: 0, sameAsSource: 0 } }),
    });
    apiMocks.getEntry.mockImplementation(async () => createDetail(createEntry()));
    sessionStorage.clear();
  });

  it("shows a loading state before entries arrive", async () => {
    let resolvePage: ((value: ReturnType<typeof jsonResponse>) => void) | undefined;
    apiMocks.listEntries.mockReturnValue(
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

  it("shows empty-state import actions when the memory has no entries", async () => {
    apiMocks.listEntries.mockResolvedValue(jsonResponse(createPage([])));

    renderExplorer({
      emptyActions: <button type="button">Import TMX or CSV</button>,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import TMX or CSV" })).toBeInTheDocument();
    });
  });

  it("shows an empty filtered state from the server result", async () => {
    navigation.search = "search=invoice";
    apiMocks.listEntries.mockResolvedValue(jsonResponse(createPage([])));

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText("No entries match this search.")).toBeInTheDocument();
    });
    expect(apiMocks.listEntries).toHaveBeenCalledWith(
      "acme",
      "mem_1",
      expect.objectContaining({ search: "invoice" }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("shows an error state and retries the same query", async () => {
    const user = userEvent.setup();
    apiMocks.listEntries
      .mockRejectedValueOnce(
        new GoSvcClientError({
          code: "memory_unavailable",
          message: "Unable to load entries.",
          status: 503,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(createPage([createEntry()])));

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getByText("Checkout")).toBeInTheDocument();
    });
    expect(apiMocks.listEntries).toHaveBeenCalledTimes(2);
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

    apiMocks.listEntries.mockImplementation(
      async (_org: string, _memoryId: string, query?: { cursor?: string }) => {
        if (query?.cursor === "cursor-2") {
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
      },
    );

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
    apiMocks.listEntries.mockResolvedValue(
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
    apiMocks.listEntries.mockResolvedValue(jsonResponse(createPage([createEntry()])));

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByDisplayValue("checkout")).toBeInTheDocument();
    });
    expect(screen.getByText(/Search: checkout/)).toBeInTheDocument();
    expect(screen.getByLabelText("Sort by")).toHaveTextContent("Modified");
    expect(screen.getByLabelText("Order")).toHaveTextContent("Oldest first");
    expect(apiMocks.listEntries).toHaveBeenCalledWith(
      "acme",
      "mem_1",
      {
        limit: 50,
        search: "checkout",
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        reviewStatus: "pending",
        origin: "import",
        provider: "crowdin",
        sort: "updated_at",
        sortDir: "asc",
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("does not display a stale page after a newer query resolves first", async () => {
    const user = userEvent.setup();
    let resolveStale: ((value: ReturnType<typeof jsonResponse>) => void) | undefined;
    apiMocks.listEntries
      .mockImplementationOnce(
        (_org: string, _memoryId: string, _query: unknown, options?: { signal?: AbortSignal }) => {
          return new Promise((resolve, reject) => {
            options?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
            resolveStale = resolve;
          });
        },
      )
      .mockImplementationOnce(async () =>
        jsonResponse(createPage([createEntry({ sourceText: "Invoice latest" })])),
      );

    renderExplorer();
    expect(screen.getByLabelText("Loading translation memory entries")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search source and target text"), "invoice");

    await waitFor(
      () => {
        expect(apiMocks.listEntries).toHaveBeenCalledTimes(2);
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
    apiMocks.listEntries.mockResolvedValue(jsonResponse(createPage([createEntry()])));

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

    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);

    await waitFor(() => {
      expect(screen.queryByText("Translation memory entry")).not.toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("checkout")).toBeInTheDocument();
    expect(screen.getByText("Checkout")).toBeInTheDocument();
  });

  it("resets an invalid cursor to the first page", async () => {
    navigation.search = "cursor=expired";
    apiMocks.listEntries.mockImplementation(
      async (_org: string, _memoryId: string, query?: { cursor?: string }) => {
        if (query?.cursor) {
          throw new GoSvcClientError({
            code: "invalid_cursor",
            message: "Cursor is invalid",
            status: 400,
          });
        }
        return jsonResponse(createPage([createEntry()]));
      },
    );

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

  it("shows a draft review queue and filters to drafts", async () => {
    const user = userEvent.setup();
    apiMocks.getReviewSummary.mockResolvedValue({
      ok: true,
      json: async () => ({ reviewSummary: { pending: 3, rejected: 1, sameAsSource: 2 } }),
    });
    apiMocks.listEntries.mockResolvedValue(jsonResponse(createPage([createEntry()])));

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText("3 draft entries need review")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Review drafts" }));

    expect(navigation.replace).toHaveBeenCalledWith(
      expect.stringContaining("reviewStatus=pending"),
      { scroll: false },
    );
  });

  it("approves selected draft entries in bulk", async () => {
    const user = userEvent.setup();
    const draft = createEntry({
      reviewStatus: "pending",
      provenance: "file_job",
      sourceText: "Save",
      targetText: "Guardar",
    });
    apiMocks.listEntries.mockResolvedValue(jsonResponse(createPage([draft])));
    apiMocks.bulkReview.mockResolvedValue({
      ok: true,
      json: async () => ({ bulkReview: { updated: 1 } }),
    });

    renderExplorer({ canReview: true, canBulkDelete: true });

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("checkbox", { name: "Select entry Save" }));
    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(apiMocks.bulkReview).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", memoryId: "mem_1" },
        json: {
          entries: [{ id: draft.id, version: draft.version }],
          reviewStatus: "approved",
        },
      });
    });
  });

  it("asks for confirmation before deleting selected entries", async () => {
    const user = userEvent.setup();
    const draft = createEntry({
      reviewStatus: "pending",
      provenance: "file_job",
      sourceText: "Save",
      targetText: "Guardar",
    });
    apiMocks.listEntries.mockResolvedValue(jsonResponse(createPage([draft])));
    apiMocks.bulkDelete.mockResolvedValue({
      ok: true,
      json: async () => ({ bulkDelete: { deleted: 1 } }),
    });

    renderExplorer({ canReview: true, canBulkDelete: true });

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("checkbox", { name: "Select entry Save" }));
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]!);

    expect(apiMocks.bulkDelete).not.toHaveBeenCalled();
    const confirmDialog = screen.getByRole("alertdialog");
    expect(within(confirmDialog).getByText("Delete selected entries?")).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(apiMocks.bulkDelete).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", memoryId: "mem_1" },
        json: {
          entryIds: [draft.id],
        },
      });
    });
  });
});
