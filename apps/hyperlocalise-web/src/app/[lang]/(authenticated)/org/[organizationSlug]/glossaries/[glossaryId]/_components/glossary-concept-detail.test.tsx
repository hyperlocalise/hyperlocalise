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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { GlossaryConceptDetail } from "./glossary-concept-detail";

const mocks = vi.hoisted(() => ({
  createConcept: vi.fn(),
  getConcept: vi.fn(),
  getTermsPage: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
}));

// Only the React build that Next bundles has this; the one the tests run on does not.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  addTransitionType: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/glossaries/glo_1/concepts/new",
  useRouter: () => ({ push: mocks.routerPush, replace: mocks.routerReplace }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/app-shell/store/use-app-shell-breadcrumb", () => ({
  useAppShellBreadcrumbAppend: vi.fn(),
}));

vi.mock("./use-glossary", () => ({
  useGlossary: () => ({
    glossaryQuery: { isLoading: false },
    glossary: { id: "glo_1", source: "native", sourceLocale: "en-US" },
    canContribute: true,
    isConceptGlossary: true,
    sourceLanguage: { locale: "en-US", name: "English (United States)", isSource: true },
  }),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          glossaries: {
            ":glossaryId": {
              concepts: {
                $post: mocks.createConcept,
                ":conceptId": {
                  $get: mocks.getConcept,
                  terms: { page: { $get: mocks.getTermsPage } },
                },
              },
            },
          },
        },
      },
    },
  },
}));

const GLOSSARY_HREF = "/org/acme/glossaries/glo_1";

function renderConcept(conceptId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <a href="/org/acme/inbox">Inbox</a>
        <GlossaryConceptDetail
          organizationSlug="acme"
          glossaryId="glo_1"
          conceptId={conceptId}
          canManageGlossaries
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

function renderNewConcept() {
  return renderConcept("new");
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const savedTerm = {
  id: "term_1",
  glossaryId: "glo_1",
  conceptId: "con_1",
  locale: "en-US",
  term: "checkout",
  isPrimary: true,
  description: "",
  note: "",
  partOfSpeech: "",
  gender: null,
  termType: null,
  url: null,
  status: "preferred",
  caseSensitive: false,
  forbidden: false,
  provenance: "manual",
  reviewStatus: "approved",
  createdAt: "2026-07-20T10:15:00.000Z",
  updatedAt: "2026-07-20T10:15:00.000Z",
};

const savedConcept = {
  id: "con_1",
  glossaryId: "glo_1",
  primaryTerm: "checkout",
  subject: "",
  definition: "",
  translatable: true,
  note: "",
  url: null,
  createdAt: "2026-07-20T10:15:00.000Z",
  updatedAt: "2026-07-20T10:15:00.000Z",
  terms: [],
};

async function typeSourceTerm(term: string) {
  await userEvent.type(await screen.findByPlaceholderText("Term"), term);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/org/acme/glossaries/glo_1/concepts/new");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("GlossaryConceptDetail leave guard", () => {
  it("does not interrupt leaving while nothing is typed", async () => {
    renderNewConcept();
    await screen.findByPlaceholderText("Term");

    await userEvent.click(screen.getByRole("button", { name: "Cancel edit" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.routerPush).toHaveBeenCalledWith(GLOSSARY_HREF, { scroll: undefined });
  });

  it("asks before a link is followed with an unsaved term, and keeps the term when told to stay", async () => {
    renderNewConcept();
    await typeSourceTerm("checkout");

    expect(fireEvent.click(screen.getByRole("link", { name: "Inbox" }))).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.getByPlaceholderText("Term")).toHaveValue("checkout");
    expect(mocks.routerPush).not.toHaveBeenCalled();
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });

  it("asks before the page's own cancel button leaves, and leaves when told to", async () => {
    renderNewConcept();
    await typeSourceTerm("checkout");

    await userEvent.click(screen.getByRole("button", { name: "Cancel edit" }));

    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();
    expect(mocks.routerReplace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Leave without saving" }));

    expect(mocks.routerReplace).toHaveBeenCalledWith(GLOSSARY_HREF, { scroll: undefined });
  });

  it("moves to the new concept after saving without asking", async () => {
    mocks.createConcept.mockResolvedValue(
      new Response(
        JSON.stringify({
          concept: { id: "con_1", primaryTerm: "checkout", terms: [] },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    renderNewConcept();
    await typeSourceTerm("checkout");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith(`${GLOSSARY_HREF}/concepts/con_1`, {
        scroll: undefined,
      });
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks about a term being added to a saved concept once any of its fields is filled", async () => {
    mocks.getConcept.mockImplementation(async () => jsonResponse({ concept: savedConcept }));
    mocks.getTermsPage.mockImplementation(async () =>
      jsonResponse({
        terms: [savedTerm],
        nextCursor: null,
        total: 1,
        pagination: { limit: 50, returned: 1, hasMore: false },
      }),
    );
    window.history.replaceState(null, "", "/org/acme/glossaries/glo_1/concepts/con_1");
    renderConcept("con_1");

    // Once the saved term is listed, the button in its language's row opens an empty row for
    // the new term.
    await waitFor(() => {
      expect(screen.getAllByDisplayValue("checkout").length).toBeGreaterThan(1);
    });
    const addTermButtons = screen.getAllByRole("button", { name: "Add term" });
    await userEvent.click(addTermButtons[addTermButtons.length - 1]);
    await userEvent.type(
      await screen.findByPlaceholderText("Definition, context, or example sentence"),
      "Used on the payment page",
    );

    // The term itself is still empty.
    expect(fireEvent.click(screen.getByRole("link", { name: "Inbox" }))).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();
  });
});
