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

import {
  AUTOMATION_SOURCE_FILES_PAGE_SIZE,
  AutomationDetailPageContent,
} from "./automation-detail-page-content";
import { createAutomationSummary } from "./automations.fixture";

const apiMocks = vi.hoisted(() => ({
  getAutomation: vi.fn(),
  patchAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
  listProjectFiles: vi.fn(),
  runSourceFiles: vi.fn(),
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
              "source-files": {
                $post: (...args: unknown[]) => apiMocks.runSourceFiles(...args),
              },
            },
          },
          projects: {
            ":projectId": {
              files: {
                $get: (...args: unknown[]) => apiMocks.listProjectFiles(...args),
              },
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

function renderPage(automationRecord = automation) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <AutomationDetailPageContent organizationSlug="acme" automationId={automationRecord.id} />
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
      ok: true,
      status: 200,
      json: async () => ({
        files: [{ sourcePath: "locales/en.json" }, { sourcePath: "messages.po" }],
      }),
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
    expect(apiMocks.listProjectFiles).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: sourceUploadAutomation.projectId },
      query: {
        limit: String(AUTOMATION_SOURCE_FILES_PAGE_SIZE),
        offset: "0",
        origin: "repository",
      },
    });
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
    apiMocks.listProjectFiles.mockImplementation((input: { query?: { search?: string } }) => {
      const search = input.query?.search;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          files: search
            ? [{ sourcePath: "locales/z-late-file.json" }]
            : [{ sourcePath: "locales/en.json" }],
        }),
      });
    });

    renderPage(sourceUploadAutomation);

    await user.click(await screen.findByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("dialog", { name: "Select source files" });
    await within(dialog).findByRole("checkbox", { name: "locales/en.json" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Search source files" }),
      "z-late-file",
    );

    await vi.waitFor(() =>
      expect(apiMocks.listProjectFiles).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", projectId: sourceUploadAutomation.projectId },
        query: {
          limit: String(AUTOMATION_SOURCE_FILES_PAGE_SIZE),
          offset: "0",
          origin: "repository",
          search: "z-late-file",
        },
      }),
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
    apiMocks.listProjectFiles.mockImplementation((input: { query?: { offset?: string } }) => {
      const offset = Number(input.query?.offset ?? "0");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          files: offset === 0 ? firstPage : [{ sourcePath: "locales/z-late-file.json" }],
        }),
      });
    });

    renderPage(sourceUploadAutomation);

    await user.click(await screen.findByRole("button", { name: "Run now" }));
    const dialog = await screen.findByRole("dialog", { name: "Select source files" });
    await user.click(await within(dialog).findByRole("button", { name: "Load more files" }));

    await vi.waitFor(() =>
      expect(apiMocks.listProjectFiles).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", projectId: sourceUploadAutomation.projectId },
        query: {
          limit: String(AUTOMATION_SOURCE_FILES_PAGE_SIZE),
          offset: String(AUTOMATION_SOURCE_FILES_PAGE_SIZE),
          origin: "repository",
        },
      }),
    );
    expect(
      await within(dialog).findByRole("checkbox", { name: "locales/z-late-file.json" }),
    ).toBeInTheDocument();
  });
});
