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

import type { MemoryEntryDetailResponse } from "@/api/routes/memory/memory.schema";

import { TmEntryDetailSheet } from "./tm-entry-detail-sheet";

const apiMocks = vi.hoisted(() => ({
  getEntry: vi.fn(),
  patchEntry: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          "translation-memories": {
            ":memoryId": {
              entries: {
                ":entryId": {
                  $get: (...args: unknown[]) => apiMocks.getEntry(...args),
                  $patch: (...args: unknown[]) => apiMocks.patchEntry(...args),
                },
              },
            },
          },
        },
      },
    },
  },
}));

function createDetail(
  overrides?: Partial<MemoryEntryDetailResponse>,
): MemoryEntryDetailResponse {
  const emptyActor = {
    userId: null as string | null,
    displayName: null as string | null,
    at: null as string | null,
    source: "created" as const,
  };
  return {
    memoryEntry: {
      id: "33333333-3333-4333-8333-333333333333",
      memoryId: "mem_1",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Checkout",
      targetText: "Paiement",
      matchScore: 100,
      provenance: "manual",
      reviewStatus: "approved",
      version: 1,
      externalKey: null,
      createdByUserId: "11111111-1111-4111-8111-111111111111",
      modifiedByUserId: null,
      reviewedByUserId: null,
      importBatchId: null,
      metadata: { context: "cart header" },
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      reviewedAt: null,
    },
    provenance: {
      origin: "manual",
      provider: null,
      importBatchId: null,
      context: "cart header",
      created: {
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: "Ada Lovelace",
        at: "2026-08-01T00:00:00.000Z",
        source: "created",
      },
      modified: { ...emptyActor, at: "2026-08-01T00:00:00.000Z", source: "modified" },
      reviewed: { ...emptyActor, source: "reviewed" },
      imported: { ...emptyActor, source: "imported" },
      providerSupplied: { ...emptyActor, source: "provider" },
    },
    variants: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        sourceLocale: "en-US",
        targetLocale: "es-ES",
        sourceText: "Checkout",
        targetText: "Pago",
        context: "cart header",
        reviewStatus: "approved",
      },
    ],
    auditEvents: [
      {
        id: "evt-1",
        eventType: "created",
        actorKind: "user",
        actorUserId: "11111111-1111-4111-8111-111111111111",
        actorDisplayName: "Ada Lovelace",
        version: 1,
        changedFields: ["sourceText"],
        attributes: { provenance: "manual" },
        occurredAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    capabilities: { canEdit: true, readOnlyReason: null },
    ...overrides,
  };
}

function renderSheet(props?: { canManageMemories?: boolean; startInEditMode?: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const ui: ReactElement = (
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <TmEntryDetailSheet
          organizationSlug="acme"
          memoryId="mem_1"
          entryId="33333333-3333-4333-8333-333333333333"
          localeCoverage={["en-US", "fr-FR"]}
          canManageMemories={props?.canManageMemories ?? true}
          open
          onOpenChange={vi.fn()}
          onOpenVariant={vi.fn()}
          startInEditMode={props?.startInEditMode}
        />
      </QueryClientProvider>
    </IntlProvider>
  );
  return render(ui);
}

describe("TmEntryDetailSheet", () => {
  beforeEach(() => {
    apiMocks.getEntry.mockReset();
    apiMocks.patchEntry.mockReset();
  });

  it("shows provenance, variants, and ordered audit events", async () => {
    apiMocks.getEntry.mockResolvedValue({
      ok: true,
      json: async () => createDetail(),
    });

    renderSheet();

    await waitFor(() => {
      expect(screen.getByText("Checkout")).toBeInTheDocument();
    });
    expect(screen.getByText("cart header")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Pago")).toBeInTheDocument();
    expect(screen.getByText("Provenance")).toBeInTheDocument();
    expect(screen.getByText("Audit timeline")).toBeInTheDocument();
    expect(screen.getAllByText("Created")).toHaveLength(2);
  });

  it("hides the editor for a read-only provider entry", async () => {
    apiMocks.getEntry.mockResolvedValue({
      ok: true,
      json: async () =>
        createDetail({
          capabilities: { canEdit: false, readOnlyReason: "external_tms" },
        }),
    });

    renderSheet();

    await waitFor(() => {
      expect(screen.getByText("This entry is read-only.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("shows a recoverable conflict when a stale edit is rejected", async () => {
    const user = userEvent.setup();
    apiMocks.getEntry.mockResolvedValue({
      ok: true,
      json: async () => createDetail(),
    });
    apiMocks.patchEntry.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "stale_memory_entry",
        message: "This entry changed after it was loaded",
      }),
    });

    renderSheet({ startInEditMode: true });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "This entry changed while you were editing. Load the latest version to continue.",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Load latest" })).toBeInTheDocument();
  });
});
