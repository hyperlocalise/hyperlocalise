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
import type { ComponentProps, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import { stashAutomationAssistantHandoff } from "@/lib/automation-assistant/handoff";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";

import { AutomationsNewPageContent } from "./automations-new-page-content";

const toastMocks = vi.hoisted(() => ({ message: vi.fn(), success: vi.fn(), error: vi.fn() }));
const apiMocks = vi.hoisted(() => ({ createAutomation: vi.fn(), bindAssistantSession: vi.fn() }));

vi.mock("./automation-assistant-api", () => ({
  bindAssistantSession: apiMocks.bindAssistantSession,
}));

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
  apiClient: {
    api: { orgs: { ":organizationSlug": { automations: { $post: apiMocks.createAutomation } } } },
  },
}));

vi.mock("./workspace-automation-form", () => ({
  WorkspaceAutomationEditor: ({
    actions,
    assistantEnabled,
    assistantInitialPrompt,
    form,
    onAssistantChange,
    onAssistantSessionChange,
    onChange,
  }: {
    actions: ReactNode;
    assistantEnabled?: boolean;
    assistantInitialPrompt?: string | null;
    form: WorkspaceAutomationFormState;
    onAssistantChange?: (form: WorkspaceAutomationFormState) => void;
    onAssistantSessionChange?: (sessionId: string | null) => void;
    onChange: (form: WorkspaceAutomationFormState) => void;
  }) => (
    <div>
      <p>{assistantEnabled ? `assistant:${assistantInitialPrompt ?? "none"}` : "no assistant"}</p>
      <button type="button" onClick={() => onAssistantSessionChange?.("sess-1")}>
        Pretend session
      </button>
      <button
        type="button"
        onClick={() => onAssistantChange?.({ ...form, name: "By the assistant" })}
      >
        Assistant change
      </button>
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

function renderPage(props: Partial<ComponentProps<typeof AutomationsNewPageContent>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppShellStoreProvider defaultNavigationGroups={[]}>
            <AutomationsNewPageContent
              organizationSlug="acme"
              initialForm={{ ...createDefaultWorkspaceAutomationFormState(), name: "Start" }}
              {...props}
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
      "Undid changes to the name",
      expect.objectContaining({ id: "automation-undo" }),
    );

    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(name).toHaveValue("Startabc");
    expect(toastMocks.message).toHaveBeenLastCalledWith(
      "Redid changes to the name",
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

describe("AutomationsNewPageContent assistant", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts the assistant with the request handed over from the automations page, once", () => {
    stashAutomationAssistantHandoff("Post a weekly summary");

    const first = renderPage({ assistantEnabled: true });
    expect(screen.getByText("assistant:Post a weekly summary")).toBeTruthy();
    first.unmount();

    renderPage({ assistantEnabled: true });
    expect(screen.getByText("assistant:none")).toBeTruthy();
  });

  it("drops the handed-over request when a template was opened instead", () => {
    stashAutomationAssistantHandoff("Post a weekly summary");

    const template = renderPage({ assistantEnabled: true, startsFromTemplate: true });
    expect(screen.getByText("assistant:none")).toBeTruthy();
    template.unmount();

    // Dropped for good: a page opened from scratch afterwards does not send it either.
    renderPage({ assistantEnabled: true });
    expect(screen.getByText("assistant:none")).toBeTruthy();
  });

  it("keeps the assistant's conversation with the automation once it is created", async () => {
    const user = userEvent.setup();
    apiMocks.createAutomation.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ automation: { id: "auto-1" } }),
    });
    apiMocks.bindAssistantSession.mockResolvedValue(undefined);
    renderPage({
      assistantEnabled: true,
      initialForm: {
        ...createDefaultWorkspaceAutomationFormState(),
        name: "Start",
        instructions: "Post a note.",
      },
    });

    await user.click(screen.getByRole("button", { name: "Pretend session" }));
    await user.click(screen.getByRole("button", { name: "Create automation" }));

    await waitFor(() => {
      expect(apiMocks.bindAssistantSession).toHaveBeenCalledWith("acme", "sess-1", "auto-1");
    });
  });

  it("asks before undoing a change of the assistant's", async () => {
    const user = userEvent.setup();
    renderPage({ assistantEnabled: true });

    await user.click(screen.getByRole("button", { name: "Assistant change" }));
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value).toBe(
      "By the assistant",
    );

    await user.click(screen.getByRole("button", { name: "Undo" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Undo the assistant's changes?")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value).toBe("Start");
    });
  });
});
