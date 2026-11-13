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
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  hyperlabAbExperiment,
  hyperlabAbExperimentDetail,
  hyperlabAssignmentsFixture,
  hyperlabAudiencesFixture,
  hyperlabCheckoutFlag,
  hyperlabExperimentsFixture,
  hyperlabFlagsFixture,
  hyperlabJapanAudience,
} from "./hyperlab.fixture";
import { HyperlabAudienceDetail } from "./hyperlab-audience-detail";
import { HyperlabExperimentDetail } from "./hyperlab-experiment-detail";
import { HyperlabFlagDetail } from "./hyperlab-flag-detail";

const mocks = vi.hoisted(() => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  return {
    json,
    client: {} as Record<string, unknown>,
    deleteFlag: vi.fn(),
    routerPush: vi.fn(),
    routerReplace: vi.fn(),
  };
});

// Only the React build that Next bundles has this; the one the tests run on does not.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  addTransitionType: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/hyperlab",
  useRouter: () => ({ push: mocks.routerPush, replace: mocks.routerReplace }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("./hyperlab-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hyperlab-api")>()),
  useHyperlabClient: () => mocks.client,
}));

function renderPage(page: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <a href="/org/acme/inbox">Inbox</a>
        {page}
      </QueryClientProvider>
    </IntlProvider>,
  );
}

async function findField(id: string) {
  return waitFor(() => {
    const field = document.getElementById(id);
    if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) {
      throw new Error(`No field with id ${id}`);
    }
    return field;
  });
}

function clickInboxLink() {
  return fireEvent.click(screen.getByRole("link", { name: "Inbox" }));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/org/acme/hyperlab");
  mocks.deleteFlag.mockResolvedValue(mocks.json({}));
  Object.assign(mocks.client, {
    flags: {
      $get: async () => mocks.json({ flags: hyperlabFlagsFixture }),
      ":flagId": {
        $get: async () =>
          mocks.json({
            flag: hyperlabCheckoutFlag,
            config: { flagId: hyperlabCheckoutFlag.id, value: null },
          }),
        $delete: mocks.deleteFlag,
      },
    },
    assignments: { $get: async () => mocks.json({ assignments: hyperlabAssignmentsFixture }) },
    experiments: {
      $get: async () => mocks.json({ experiments: hyperlabExperimentsFixture }),
      ":experimentId": { $get: async () => mocks.json(hyperlabAbExperimentDetail) },
    },
    audiences: {
      $get: async () => mocks.json({ audiences: hyperlabAudiencesFixture }),
      ":audienceId": { $get: async () => mocks.json({ audience: hyperlabJapanAudience }) },
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("HyperlabFlagDetail leave guard", () => {
  function renderFlag() {
    return renderPage(
      <HyperlabFlagDetail organizationSlug="acme" flagId={hyperlabCheckoutFlag.id} canWrite />,
    );
  }

  it("does not interrupt leaving while nothing is changed", async () => {
    renderFlag();
    await findField("hyperlab-flag-description");

    expect(clickInboxLink()).toBe(true);
    expect(screen.queryByText("Leave without saving?")).toBeNull();
  });

  it("asks before leaving with an unsaved description, and keeps it when told to stay", async () => {
    const user = userEvent.setup();
    renderFlag();
    const description = await findField("hyperlab-flag-description");

    await user.type(description, " v2");

    expect(clickInboxLink()).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(description).toHaveValue(`${hyperlabCheckoutFlag.description} v2`);
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });

  it("goes to the flag list after deleting without asking", async () => {
    const user = userEvent.setup();
    renderFlag();

    await user.type(await findField("hyperlab-flag-description"), " v2");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith("/org/acme/hyperlab/flags", {
        scroll: undefined,
      });
    });
    expect(screen.queryByText("Leave without saving?")).toBeNull();
  });
});

describe("HyperlabExperimentDetail leave guard", () => {
  function renderExperiment() {
    return renderPage(
      <HyperlabExperimentDetail
        organizationSlug="acme"
        experimentId={hyperlabAbExperiment.id}
        canWrite
      />,
    );
  }

  it("does not interrupt leaving while nothing is changed", async () => {
    renderExperiment();
    await findField("hyperlab-experiment-name");

    expect(clickInboxLink()).toBe(true);
    expect(screen.queryByText("Leave without saving?")).toBeNull();
  });

  it("asks before leaving with unsaved details", async () => {
    const user = userEvent.setup();
    renderExperiment();

    await user.type(await findField("hyperlab-experiment-name"), " v2");

    expect(clickInboxLink()).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();
  });
});

describe("HyperlabAudienceDetail leave guard", () => {
  function renderAudience() {
    return renderPage(
      <HyperlabAudienceDetail
        organizationSlug="acme"
        audienceId={hyperlabJapanAudience.id}
        canWrite
      />,
    );
  }

  it("does not interrupt leaving while nothing is changed", async () => {
    renderAudience();
    await findField("hyperlab-audience-name");

    expect(clickInboxLink()).toBe(true);
    expect(screen.queryByText("Leave without saving?")).toBeNull();
  });

  it("asks before leaving with an unsaved name", async () => {
    const user = userEvent.setup();
    renderAudience();

    await user.type(await findField("hyperlab-audience-name"), " v2");

    expect(clickInboxLink()).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();
  });
});
