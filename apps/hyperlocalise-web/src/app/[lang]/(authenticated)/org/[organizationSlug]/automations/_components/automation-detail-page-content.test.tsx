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
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import {
  AUTOMATION_SOURCE_FILES_PAGE_SIZE,
  AutomationDetailPageContent,
} from "./automation-detail-page-content";
import { createAutomationSummary } from "./automations.fixture";

const toastMocks = vi.hoisted(() => ({ message: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));

const apiMocks = vi.hoisted(() => ({
  getAutomation: vi.fn(),
  patchAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
  listProjectFiles: vi.fn(),
  runSourceFiles: vi.fn(),
  runAutomation: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/org/acme/automations/automation-1",
  useSearchParams: () => new URLSearchParams(),
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
              "source-files": {
                $post: (...args: unknown[]) => apiMocks.runSourceFiles(...args),
              },
              runs: {
                $post: (...args: unknown[]) => apiMocks.runAutomation(...args),
              },
            },
          },
        },
      },
    },
  },
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      project: {
        files: (...args: unknown[]) => apiMocks.listProjectFiles(...args),
      },
    },
    loading: false,
  }),
}));

vi.mock("./workspace-automation-form", () => ({
  WorkspaceAutomationEditor: ({
    actions,
    form,
    onChange,
    onRefreshRunHistory,
    runHistoryRefreshing,
  }: {
    actions: ReactNode;
    form: WorkspaceAutomationFormState;
    onChange: (form: WorkspaceAutomationFormState) => void;
    onRefreshRunHistory?: () => void;
    runHistoryRefreshing?: boolean;
  }) => (
    <div>
      <output aria-label="Form name">{form.name}</output>
      <input
        aria-label="Name"
        value={form.name}
        onChange={(event) => onChange({ ...form, name: event.target.value })}
      />
      <button type="button" onClick={() => onChange({ ...form, name: "Renamed automation" })}>
        Dirty form
      </button>
      {onRefreshRunHistory ? (
        <button type="button" disabled={runHistoryRefreshing} onClick={onRefreshRunHistory}>
          Refresh
        </button>
      ) : null}
      {actions}
    </div>
  ),
}));

const automation = createAutomationSummary();

function renderPage(automationRecord = automation) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const view = render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <AppShellStoreProvider defaultNavigationGroups={[]}>
          <AutomationDetailPageContent organizationSlug="acme" automationId={automationRecord.id} />
        </AppShellStoreProvider>
      </QueryClientProvider>
    </IntlProvider>,
  );
  return { ...view, queryClient };
}

function pendingResponse() {
  return new Promise(() => undefined);
}

describe("AutomationDetailPageContent write locking", () => {
  afterEach(() => {
    apiMocks.getAutomation.mockReset();
    apiMocks.patchAutomation.mockReset();
    apiMocks.deleteAutomation.mockReset();
    apiMocks.listProjectFiles.mockReset();
    apiMocks.runSourceFiles.mockReset();
  });

  it("disables delete while a save request is in flight", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
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
      status: 200,
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
      status: 200,
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

  it("runs a source-upload automation for selected existing project files", async () => {
    const user = userEvent.setup();
    const sourceUploadAutomation = createAutomationSummary({
      triggerConfig: { mode: "source_upload" },
      repositoryTarget: { kind: "none" },
      toolConfig: {
        createNativeTmsJob: {
          enabled: true,
          useProjectTargetLocales: true,
          targetLocales: [],
        },
      },
    });
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation: sourceUploadAutomation, recentRuns: [] }),
    });
    apiMocks.listProjectFiles.mockResolvedValue({
      files: [{ sourcePath: "locales/en.json" }, { sourcePath: "messages.po" }],
    });
    apiMocks.runSourceFiles.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ selectedCount: 2, queuedCount: 2 }),
    });

    renderPage(sourceUploadAutomation);

    await user.click(await screen.findByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("dialog", { name: "Select source files" });
    await user.click(await within(dialog).findByRole("checkbox", { name: "locales/en.json" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "messages.po" }));
    await user.click(within(dialog).getByRole("button", { name: "Run 2 files" }));

    await vi.waitFor(() => expect(apiMocks.runSourceFiles).toHaveBeenCalledOnce());
    expect(apiMocks.listProjectFiles).toHaveBeenCalledWith(
      "acme",
      sourceUploadAutomation.projectId,
      {
        limit: AUTOMATION_SOURCE_FILES_PAGE_SIZE,
        offset: 0,
        origin: "repository",
      },
    );
    expect(apiMocks.runSourceFiles).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", automationId: sourceUploadAutomation.id },
      json: { sourcePaths: ["locales/en.json", "messages.po"] },
    });
  });

  it("searches source files on the server instead of the first loaded page", async () => {
    const user = userEvent.setup();
    const sourceUploadAutomation = createAutomationSummary({
      triggerConfig: { mode: "source_upload" },
      repositoryTarget: { kind: "none" },
      toolConfig: {
        createNativeTmsJob: {
          enabled: true,
          useProjectTargetLocales: true,
          targetLocales: [],
        },
      },
    });
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation: sourceUploadAutomation, recentRuns: [] }),
    });
    apiMocks.listProjectFiles.mockImplementation(
      (_organizationSlug: string, _projectId: string, query?: { search?: string }) => {
        const search = query?.search;
        return Promise.resolve({
          files: search
            ? [{ sourcePath: "locales/z-late-file.json" }]
            : [{ sourcePath: "locales/en.json" }],
        });
      },
    );

    renderPage(sourceUploadAutomation);

    await user.click(await screen.findByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("dialog", { name: "Select source files" });
    await within(dialog).findByRole("checkbox", { name: "locales/en.json" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Search source files" }),
      "z-late-file",
    );

    await vi.waitFor(() =>
      expect(apiMocks.listProjectFiles).toHaveBeenCalledWith(
        "acme",
        sourceUploadAutomation.projectId,
        {
          limit: AUTOMATION_SOURCE_FILES_PAGE_SIZE,
          offset: 0,
          origin: "repository",
          search: "z-late-file",
        },
      ),
    );
    expect(
      await within(dialog).findByRole("checkbox", { name: "locales/z-late-file.json" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("checkbox", { name: "locales/en.json" }),
    ).not.toBeInTheDocument();
  });

  it("loads later source-file pages with an offset instead of a one-time cap", async () => {
    const user = userEvent.setup();
    const sourceUploadAutomation = createAutomationSummary({
      triggerConfig: { mode: "source_upload" },
      repositoryTarget: { kind: "none" },
      toolConfig: {
        createNativeTmsJob: {
          enabled: true,
          useProjectTargetLocales: true,
          targetLocales: [],
        },
      },
    });
    const firstPage = Array.from({ length: AUTOMATION_SOURCE_FILES_PAGE_SIZE }, (_, index) => ({
      sourcePath: `locales/file-${String(index).padStart(3, "0")}.json`,
    }));
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation: sourceUploadAutomation, recentRuns: [] }),
    });
    apiMocks.listProjectFiles.mockImplementation(
      (_organizationSlug: string, _projectId: string, query?: { offset?: number }) => {
        const offset = Number(query?.offset ?? 0);
        return Promise.resolve({
          files: offset === 0 ? firstPage : [{ sourcePath: "locales/z-late-file.json" }],
        });
      },
    );

    renderPage(sourceUploadAutomation);

    await user.click(await screen.findByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("dialog", { name: "Select source files" });
    await user.click(await within(dialog).findByRole("button", { name: "Load more files" }));

    await vi.waitFor(() =>
      expect(apiMocks.listProjectFiles).toHaveBeenCalledWith(
        "acme",
        sourceUploadAutomation.projectId,
        {
          limit: AUTOMATION_SOURCE_FILES_PAGE_SIZE,
          offset: AUTOMATION_SOURCE_FILES_PAGE_SIZE,
          origin: "repository",
        },
      ),
    );
    expect(
      await within(dialog).findByRole("checkbox", { name: "locales/z-late-file.json" }),
    ).toBeInTheDocument();
  });
});

describe("AutomationDetailPageContent run history refresh", () => {
  afterEach(() => {
    apiMocks.getAutomation.mockReset();
  });

  it("reloads recent runs when refresh is clicked", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation, recentRuns: [] }),
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Refresh" }));

    await vi.waitFor(() => expect(apiMocks.getAutomation).toHaveBeenCalledTimes(2));
  });
});

describe("AutomationDetailPageContent discard changes", () => {
  afterEach(() => {
    apiMocks.getAutomation.mockReset();
    apiMocks.patchAutomation.mockReset();
  });

  it("puts the form back to the saved automation after confirming", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation, recentRuns: [] }),
    });

    renderPage();

    expect(await screen.findByRole("button", { name: "Discard changes" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Dirty form" }));
    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      "Renamed automation",
    );

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Discard changes" }));

    await vi.waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: "Discard changes?" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(automation.name);
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(apiMocks.patchAutomation).not.toHaveBeenCalled();
  });

  it("keeps the changes when the dialog is dismissed", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation, recentRuns: [] }),
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));

    await vi.waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: "Discard changes?" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      "Renamed automation",
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("cannot be started while a save is in flight", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation, recentRuns: [] }),
    });
    apiMocks.patchAutomation.mockImplementation(() => pendingResponse());

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();
  });
});

describe("AutomationDetailPageContent run with unsaved changes", () => {
  const scheduledAutomation = createAutomationSummary({
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "weekly", hourUtc: 9, dayOfWeek: 1, timezone: "UTC" },
    },
  });
  // A manual trigger cannot run GitHub sync workflows, so this one fails the form's own checks.
  const invalidAutomation = createAutomationSummary({ triggerConfig: { mode: "manual" } });
  const sourceUploadAutomation = createAutomationSummary({
    triggerConfig: { mode: "source_upload" },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      createNativeTmsJob: {
        enabled: true,
        useProjectTargetLocales: true,
        targetLocales: [],
      },
    },
  });

  function mockAutomation(record = scheduledAutomation) {
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation: record, recentRuns: [] }),
    });
  }

  function mockRunQueued() {
    apiMocks.runAutomation.mockResolvedValue({ ok: true, status: 202, json: async () => ({}) });
  }

  afterEach(() => {
    apiMocks.getAutomation.mockReset();
    apiMocks.patchAutomation.mockReset();
    apiMocks.listProjectFiles.mockReset();
    apiMocks.runSourceFiles.mockReset();
    apiMocks.runAutomation.mockReset();
  });

  it("runs at once when nothing is unsaved", async () => {
    const user = userEvent.setup();
    mockAutomation();
    mockRunQueued();

    renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Run now" }));

    await vi.waitFor(() => expect(apiMocks.runAutomation).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("alertdialog", { name: "You have unsaved changes" }),
    ).not.toBeInTheDocument();
  });

  it("asks before running and does nothing on cancel", async () => {
    const user = userEvent.setup();
    mockAutomation();
    mockRunQueued();

    renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("alertdialog", { name: "You have unsaved changes" });
    expect(apiMocks.runAutomation).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await vi.waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: "You have unsaved changes" }),
      ).not.toBeInTheDocument(),
    );
    expect(apiMocks.runAutomation).not.toHaveBeenCalled();
    expect(apiMocks.patchAutomation).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      "Renamed automation",
    );
  });

  it("saves first and queues the run once the save has gone through", async () => {
    const user = userEvent.setup();
    mockAutomation();
    mockRunQueued();
    let finishSave: (response: unknown) => void = () => undefined;
    apiMocks.patchAutomation.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );

    renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("alertdialog", { name: "You have unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Save and run" }));

    await vi.waitFor(() => expect(apiMocks.patchAutomation).toHaveBeenCalledOnce());
    expect(apiMocks.patchAutomation.mock.calls[0]?.[0]).toMatchObject({
      json: { name: "Renamed automation" },
    });
    expect(apiMocks.runAutomation).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Run now" })).toBeDisabled();

    finishSave({
      ok: true,
      status: 200,
      json: async () => ({ automation: { ...scheduledAutomation, name: "Renamed automation" } }),
    });

    await vi.waitFor(() => expect(apiMocks.runAutomation).toHaveBeenCalledOnce());
  });

  it("does not run when the save fails", async () => {
    const user = userEvent.setup();
    mockAutomation();
    mockRunQueued();
    apiMocks.patchAutomation.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal_error" }),
    });

    renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("alertdialog", { name: "You have unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Save and run" }));

    await vi.waitFor(() => expect(apiMocks.patchAutomation).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Run now" })).toBeEnabled());
    expect(apiMocks.runAutomation).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      "Renamed automation",
    );
  });

  it("does not save or run when the changes fail the form's checks", async () => {
    const user = userEvent.setup();
    mockAutomation(invalidAutomation);
    mockRunQueued();

    renderPage(invalidAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("alertdialog", { name: "You have unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Save and run" }));

    await vi.waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: "You have unsaved changes" }),
      ).not.toBeInTheDocument(),
    );
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Run now" })).toBeEnabled());
    expect(apiMocks.patchAutomation).not.toHaveBeenCalled();
    expect(apiMocks.runAutomation).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      "Renamed automation",
    );
  });

  it("discards the changes and runs the saved automation", async () => {
    const user = userEvent.setup();
    mockAutomation();
    mockRunQueued();

    renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("alertdialog", { name: "You have unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Discard changes and run" }));

    await vi.waitFor(() => expect(apiMocks.runAutomation).toHaveBeenCalledOnce());
    expect(apiMocks.patchAutomation).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      scheduledAutomation.name,
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("opens the source file picker only after the save for a source-upload automation", async () => {
    const user = userEvent.setup();
    mockAutomation(sourceUploadAutomation);
    apiMocks.listProjectFiles.mockResolvedValue({ files: [{ sourcePath: "locales/en.json" }] });
    apiMocks.patchAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation: sourceUploadAutomation }),
    });

    renderPage(sourceUploadAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Run now" }));
    expect(screen.queryByRole("dialog", { name: "Select source files" })).not.toBeInTheDocument();
    const dialog = await screen.findByRole("alertdialog", { name: "You have unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Save and run" }));

    expect(await screen.findByRole("dialog", { name: "Select source files" })).toBeInTheDocument();
    expect(apiMocks.patchAutomation).toHaveBeenCalledOnce();
    expect(apiMocks.runSourceFiles).not.toHaveBeenCalled();
  });
});

describe("AutomationDetailPageContent undo", () => {
  const scheduledAutomation = createAutomationSummary({
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "weekly", hourUtc: 9, dayOfWeek: 1, timezone: "UTC" },
    },
  });
  const sourceUploadAutomation = createAutomationSummary({
    triggerConfig: { mode: "source_upload" },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      createNativeTmsJob: { enabled: true, useProjectTargetLocales: true, targetLocales: [] },
    },
  });

  function record(overrides: Partial<typeof scheduledAutomation> = {}) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ automation: { ...scheduledAutomation, ...overrides }, recentRuns: [] }),
    };
  }

  async function refetch(queryClient: QueryClient) {
    const fetches = apiMocks.getAutomation.mock.calls.length;
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["workspace-automation", "acme", scheduledAutomation.id],
      });
    });
    await vi.waitFor(() => expect(apiMocks.getAutomation).toHaveBeenCalledTimes(fetches + 1));
    // The query library tells its observers on a timer, so the page renders a moment later.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }

  afterEach(() => {
    apiMocks.getAutomation.mockReset();
    apiMocks.patchAutomation.mockReset();
    apiMocks.listProjectFiles.mockReset();
    apiMocks.runAutomation.mockReset();
    toastMocks.message.mockReset();
  });

  it("has nothing to undo once the record has loaded", async () => {
    apiMocks.getAutomation.mockResolvedValue(record());

    renderPage(scheduledAutomation);

    expect(await screen.findByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("undoes a discard, bringing the edits back and re-enabling Save", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue(record());

    renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Discard changes" }));
    await vi.waitFor(() =>
      expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
        scheduledAutomation.name,
      ),
    );

    await user.keyboard("{Control>}z{/Control}");

    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      "Renamed automation",
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(toastMocks.message).toHaveBeenLastCalledWith(
      "Brought your discarded changes back",
      expect.objectContaining({ id: "automation-undo" }),
    );
  });

  it("undoes the discard made by Discard changes and run", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue(record());
    apiMocks.runAutomation.mockResolvedValue({ ok: true, status: 202, json: async () => ({}) });

    renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("alertdialog", { name: "You have unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Discard changes and run" }));
    await vi.waitFor(() => expect(apiMocks.runAutomation).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      "Renamed automation",
    );
  });

  it("keeps edits and the history when a refetch changes only the run details", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation
      .mockResolvedValueOnce(record())
      .mockResolvedValue(
        record({ lastRunAt: "2026-10-08T09:00:00.000Z", lastRunStatus: "succeeded" }),
      );

    const { queryClient } = renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await refetch(queryClient);

    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      "Renamed automation",
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      scheduledAutomation.name,
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("records a change saved elsewhere as a step, so undo brings the edits back", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation
      .mockResolvedValueOnce(record())
      .mockResolvedValue(record({ name: "Saved by a teammate" }));

    const { queryClient } = renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await refetch(queryClient);

    await vi.waitFor(() =>
      expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
        "Saved by a teammate",
      ),
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await user.keyboard("{Control>}z{/Control}");

    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      "Renamed automation",
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(toastMocks.message).toHaveBeenLastCalledWith(
      "Brought your changes back over the reloaded automation",
      expect.anything(),
    );
  });

  it("follows a change saved elsewhere without a step when nothing is unsaved", async () => {
    apiMocks.getAutomation
      .mockResolvedValueOnce(record())
      .mockResolvedValue(record({ name: "Saved by a teammate" }));

    const { queryClient } = renderPage(scheduledAutomation);

    await screen.findByRole("button", { name: "Undo" });
    await refetch(queryClient);

    await vi.waitFor(() =>
      expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
        "Saved by a teammate",
      ),
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("keeps the history across a save, so undo makes the form unsaved again", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation
      .mockResolvedValueOnce(record())
      .mockResolvedValue(record({ name: "Renamed automation" }));
    apiMocks.patchAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation: { ...scheduledAutomation, name: "Renamed automation" } }),
    });

    renderPage(scheduledAutomation);

    await user.click(await screen.findByRole("button", { name: "Dirty form" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    await user.keyboard("{Control>}z{/Control}");

    expect(screen.getByRole("status", { name: "Form name" })).toHaveTextContent(
      scheduledAutomation.name,
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("keeps edits typed during a save whose stored values the server trimmed", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation
      .mockResolvedValueOnce(record())
      .mockResolvedValue(record({ name: "Trimmed" }));
    let finishSave: (response: unknown) => void = () => undefined;
    apiMocks.patchAutomation.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );

    renderPage(scheduledAutomation);

    const name = await screen.findByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Trimmed  ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(apiMocks.patchAutomation).toHaveBeenCalledOnce());
    await user.type(name, "!");

    finishSave({
      ok: true,
      status: 200,
      json: async () => ({ automation: { ...scheduledAutomation, name: "Trimmed" } }),
    });
    await vi.waitFor(() => expect(apiMocks.getAutomation).toHaveBeenCalledTimes(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(name).toHaveValue("Trimmed  !");
    expect(toastMocks.message).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("leaves the shortcut to the browser inside a dialog's text field", async () => {
    const user = userEvent.setup();
    apiMocks.getAutomation.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ automation: sourceUploadAutomation, recentRuns: [] }),
    });
    apiMocks.listProjectFiles.mockResolvedValue({ files: [{ sourcePath: "locales/en.json" }] });

    renderPage(sourceUploadAutomation);

    const name = await screen.findByRole("textbox", { name: "Name" });
    await user.type(name, "!");
    expect(name).toHaveValue(`${sourceUploadAutomation.name}!`);
    await user.keyboard("{Control>}z{/Control}");
    expect(name).toHaveValue(sourceUploadAutomation.name);
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(name).toHaveValue(`${sourceUploadAutomation.name}!`);

    await user.click(screen.getByRole("button", { name: "Run now" }));
    const prompt = await screen.findByRole("alertdialog", { name: "You have unsaved changes" });
    await user.click(within(prompt).getByRole("button", { name: "Cancel" }));
    // The source-file picker opens only from a clean form; use its search box as the portal field.
    await user.keyboard("{Control>}z{/Control}");
    await user.click(screen.getByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("dialog", { name: "Select source files" });
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    await user.type(within(dialog).getByRole("textbox", { name: "Search source files" }), "x");
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");

    expect(name).toHaveValue(sourceUploadAutomation.name);
    expect(screen.getByRole("button", { name: "Redo", hidden: true })).toBeEnabled();
  });
});
