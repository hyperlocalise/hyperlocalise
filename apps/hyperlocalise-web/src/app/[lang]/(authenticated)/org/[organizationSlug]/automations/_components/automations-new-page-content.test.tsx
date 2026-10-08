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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";

import { AutomationsNewPageContent } from "./automations-new-page-content";

const toastMocks = vi.hoisted(() => ({ message: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/org/acme/automations/new",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: { api: { orgs: { ":organizationSlug": { automations: { $post: vi.fn() } } } } },
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
      <input
        aria-label="Name"
        value={form.name}
        onChange={(event) => onChange({ ...form, name: event.target.value })}
      />
      <button
        type="button"
        onClick={() =>
          onChange({ ...form, status: form.status === "active" ? "paused" : "active" })
        }
      >
        Toggle status
      </button>
      <output aria-label="Status">{form.status}</output>
      {actions}
    </div>
  ),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppShellStoreProvider defaultNavigationGroups={[]}>
            <AutomationsNewPageContent
              organizationSlug="acme"
              initialForm={{ ...createDefaultWorkspaceAutomationFormState(), name: "Start" }}
            />
          </AppShellStoreProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("AutomationsNewPageContent undo", () => {
  afterEach(() => {
    toastMocks.message.mockReset();
  });

  it("starts with nothing to undo or redo", () => {
    renderPage();

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("undoes a burst of typing as one step and redoes it", async () => {
    const user = userEvent.setup();
    renderPage();
    const name = screen.getByRole("textbox", { name: "Name" });

    await user.type(name, "abc");
    expect(name).toHaveValue("Startabc");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    await user.keyboard("{Control>}z{/Control}");
    expect(name).toHaveValue("Start");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
    expect(toastMocks.message).toHaveBeenLastCalledWith(
      "Undid the name",
      expect.objectContaining({ id: "automation-undo" }),
    );

    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(name).toHaveValue("Startabc");
    expect(toastMocks.message).toHaveBeenLastCalledWith(
      "Redid the name",
      expect.objectContaining({ id: "automation-undo" }),
    );
  });

  it("undoes from the button and forgets the redo once something new changes", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Toggle status" }));
    expect(screen.getByRole("status", { name: "Status" })).toHaveTextContent("paused");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("status", { name: "Status" })).toHaveTextContent("active");
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "!");
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("puts the change back from the notice's action", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Toggle status" }));
    await user.keyboard("{Control>}z{/Control}");
    const options = toastMocks.message.mock.calls.at(-1)?.[1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();

    expect(await screen.findByRole("status", { name: "Status" })).toHaveTextContent("paused");
  });
});
