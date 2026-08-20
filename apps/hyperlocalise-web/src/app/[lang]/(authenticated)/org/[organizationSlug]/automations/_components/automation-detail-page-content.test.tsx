// @vitest-environment happy-dom

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
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import { AutomationDetailPageContent } from "./automation-detail-page-content";
import { createAutomationSummary } from "./automations.fixture";

const apiMocks = vi.hoisted(() => ({
  getAutomation: vi.fn(),
  patchAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          automations: {
            ":automationId": {
              $get: (...args: unknown[]) => apiMocks.getAutomation(...args),
              $patch: (...args: unknown[]) => apiMocks.patchAutomation(...args),
              $delete: (...args: unknown[]) => apiMocks.deleteAutomation(...args),
            },
          },
        },
      },
    },
  },
}));

vi.mock("./workspace-automation-form", () => ({
  WorkspaceAutomationEditor: ({
    actions,
    form,
    onChange,
  }: {
    actions: ReactNode;
    form: WorkspaceAutomationFormState;
    onChange: (form: WorkspaceAutomationFormState) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange({ ...form, name: "Renamed automation" })}>
        Dirty form
      </button>
      {actions}
    </div>
  ),
}));

const automation = createAutomationSummary();

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <AutomationDetailPageContent organizationSlug="acme" automationId={automation.id} />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

function pendingResponse() {
  return new Promise(() => undefined);
}

describe("AutomationDetailPageContent write locking", () => {
  afterEach(() => {
    apiMocks.getAutomation.mockReset();
    apiMocks.patchAutomation.mockReset();
    apiMocks.deleteAutomation.mockReset();
  });

  it("disables delete while a save request is in flight", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      json: async () => ({ automation, recentRuns: [] }),
    });
    apiMocks.patchAutomation.mockImplementation(() => pendingResponse());

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(apiMocks.patchAutomation).toHaveBeenCalledOnce();
  });

  it("disables save once deletion has started", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      json: async () => ({ automation, recentRuns: [] }),
    });
    apiMocks.deleteAutomation.mockImplementation(() => pendingResponse());

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete automation?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(within(dialog).getByRole("button", { name: /Deleting/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes", hidden: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete", hidden: true })).toBeDisabled();
    expect(apiMocks.deleteAutomation).toHaveBeenCalledOnce();
  });

  it("does not start a delete while a save is pending", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      json: async () => ({ automation, recentRuns: [] }),
    });
    apiMocks.patchAutomation.mockImplementation(() => pendingResponse());
    apiMocks.deleteAutomation.mockResolvedValue({ ok: true });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.queryByRole("alertdialog", { name: "Delete automation?" }),
    ).not.toBeInTheDocument();
    expect(apiMocks.deleteAutomation).not.toHaveBeenCalled();
  });
});
