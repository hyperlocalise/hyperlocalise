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
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { GlossaryHistoryPageResponse } from "@/api/routes/glossary/glossary.schema";

import {
  GlossaryHistoryPage,
  GlossaryHistoryRequestError,
  isInvalidGlossaryHistoryCursorError,
  isUnavailableGlossaryHistoryError,
} from "./glossary-history-page";

const apiMocks = vi.hoisted(() => ({
  getHistory: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          glossaries: {
            ":glossaryId": {
              concepts: {
                history: {
                  $get: apiMocks.getHistory,
                },
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

function historyPage(
  events: GlossaryHistoryPageResponse["events"],
  nextCursor: string | null = null,
): GlossaryHistoryPageResponse {
  return {
    events,
    nextCursor,
    pagination: {
      limit: 50,
      returned: events.length,
      hasMore: Boolean(nextCursor),
    },
  };
}

function historyEvent(id: string, actorDisplayName = "Ada Lovelace") {
  return {
    id,
    conceptId: null,
    termId: null,
    eventType: "created",
    actorKind: "user",
    actorUserId: "11111111-1111-4111-8111-111111111111",
    actorCredentialId: null,
    actorDisplayName,
    version: 1,
    reason: null,
    changedFields: [],
    changes: [],
    attributes: {},
    occurredAt: "2026-09-10T00:00:00.000Z",
  } satisfies GlossaryHistoryPageResponse["events"][number];
}

function renderHistoryPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <GlossaryHistoryPage organizationSlug="acme" glossaryId="glossary-1" />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("glossary history error classification", () => {
  it("treats expired cursors as recoverable", () => {
    const error = new GlossaryHistoryRequestError(
      400,
      "invalid_glossary_history_cursor",
      "Glossary history cursor is invalid",
    );
    expect(isInvalidGlossaryHistoryCursorError(error)).toBe(true);
    expect(isUnavailableGlossaryHistoryError(error)).toBe(false);
  });

  it("treats unsupported provider glossaries as unavailable", () => {
    const error = new GlossaryHistoryRequestError(
      400,
      "external_glossary_history_unsupported",
      "Provider-backed glossaries do not expose local history",
    );
    expect(isInvalidGlossaryHistoryCursorError(error)).toBe(false);
    expect(isUnavailableGlossaryHistoryError(error)).toBe(true);
  });

  it("does not treat generic 400 errors as unavailable", () => {
    const error = new GlossaryHistoryRequestError(400, "invalid_glossary_payload", "Bad request");
    expect(isUnavailableGlossaryHistoryError(error)).toBe(false);
  });
});

describe("GlossaryHistoryPage", () => {
  beforeEach(() => {
    apiMocks.getHistory.mockReset();
  });

  it("restarts from the first page when a cursor expires", async () => {
    const user = userEvent.setup();
    apiMocks.getHistory.mockImplementation(async (args: { query?: { cursor?: string } }) => {
      if (args.query?.cursor) {
        return jsonResponse(
          {
            error: "invalid_glossary_history_cursor",
            message: "Glossary history cursor is invalid",
          },
          400,
        );
      }
      return jsonResponse(
        historyPage(
          [historyEvent("11111111-1111-4111-8111-111111111111")],
          args.query?.cursor ? null : "cursor-1",
        ),
      );
    });

    renderHistoryPage();

    await waitFor(() => {
      expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(
        screen.getByText("That page is no longer valid. Showing the first page."),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText("This glossary does not expose local history."),
    ).not.toBeInTheDocument();
    expect(apiMocks.getHistory.mock.calls.some((call) => !call[0]?.query?.cursor)).toBe(true);
  });

  it("keeps provider-backed glossaries unavailable without a retry", async () => {
    apiMocks.getHistory.mockResolvedValue(
      jsonResponse(
        {
          error: "external_glossary_history_unsupported",
          message: "Provider-backed glossaries do not expose local history",
        },
        400,
      ),
    );

    renderHistoryPage();

    await waitFor(() => {
      expect(screen.getByText("This glossary does not expose local history.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
