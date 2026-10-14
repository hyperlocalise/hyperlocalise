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
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { useEffect, useState, type ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { visualWorkflowDefinitionsEqual } from "@/lib/visual-workflows/editor/visual-workflow-definition-equality";
import { parseVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/definition-migration";
import {
  createEmptyVisualWorkflowDefinition,
  toVisualWorkflowV3Definition,
} from "@/lib/visual-workflows/schema/serializers";
import type {
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
  VisualWorkflowV3Definition,
} from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowRecord } from "@/lib/visual-workflows/visual-workflow-types";

import { VisualWorkflowEditorPageContent } from "./visual-workflow-editor-page-content";
import type { VisualWorkflowsApi } from "./visual-workflows-api";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
}));

// Only the React build that Next bundles has this; the one the tests run on does not.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  addTransitionType: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/automations/visual-workflows/workflow-1",
  useRouter: () => ({ push: mocks.routerPush, replace: mocks.routerReplace, refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/app-shell/store/use-app-shell-breadcrumb", () => ({
  useAppShellBreadcrumbAppend: vi.fn(),
}));

vi.mock("@/components/app-shell/store/use-app-shell-sidebar", () => ({
  useAppShellSidebar: vi.fn(),
}));

// Stands in for the canvas, which needs a real browser: it holds the graph the page gave it,
// renames it on request and reports unsaved changes the way the editor does.
vi.mock("./visual-workflow-editor/visual-workflow-editor", () => ({
  VisualWorkflowEditor: ({
    initialName,
    initialNodes,
    initialEdges,
    savedDefinition,
    onUnsavedChangesChange,
    onSave,
    onDelete,
  }: {
    initialName: string;
    initialNodes: VisualWorkflowRfNode[];
    initialEdges: VisualWorkflowRfEdge[];
    savedDefinition: VisualWorkflowV3Definition;
    onUnsavedChangesChange: (hasUnsavedChanges: boolean) => void;
    onSave: (definition: VisualWorkflowV3Definition) => void;
    onDelete: () => void;
  }) => {
    const [name, setName] = useState(initialName);
    const definition = toVisualWorkflowV3Definition({
      name,
      nodes: initialNodes,
      edges: initialEdges,
    });
    const hasUnsavedChanges = !visualWorkflowDefinitionsEqual(savedDefinition, definition);
    useEffect(() => {
      onUnsavedChangesChange(hasUnsavedChanges);
    }, [hasUnsavedChanges, onUnsavedChangesChange]);

    return (
      <div>
        <button type="button" onClick={() => setName(`${name} v2`)}>
          Rename
        </button>
        <button type="button" onClick={() => onSave(definition)}>
          Save
        </button>
        <button type="button" onClick={onDelete}>
          Delete workflow
        </button>
      </div>
    );
  },
}));

function createWorkflow(): VisualWorkflowRecord {
  return {
    id: "workflow-1",
    organizationId: "org_1",
    authorUserId: null,
    projectId: null,
    status: "draft",
    name: "Lead ping",
    definition: parseVisualWorkflowV3Definition(createEmptyVisualWorkflowDefinition("Lead ping")),
    definitionVersion: 1,
    revision: 1,
    publishedVersion: null,
    publishedDefinition: null,
    triggerFingerprint: null,
    nextRunAt: null,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
}

function createApi() {
  const workflow = createWorkflow();
  const updateVisualWorkflow = vi.fn(
    async (_slug: string, _id: string, input: { name?: string }) => ({
      ...workflow,
      name: input.name ?? workflow.name,
      revision: 2,
    }),
  );
  const deleteVisualWorkflow = vi.fn(async () => undefined);
  return {
    api: { updateVisualWorkflow, deleteVisualWorkflow } as unknown as VisualWorkflowsApi,
    updateVisualWorkflow,
    deleteVisualWorkflow,
  };
}

function renderPage(api: VisualWorkflowsApi, extra?: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <a href="/org/acme/inbox">Inbox</a>
        {extra}
        <VisualWorkflowEditorPageContent
          organizationSlug="acme"
          workflow={createWorkflow()}
          visualWorkflowsApi={api}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

function clickInboxLink() {
  return fireEvent.click(screen.getByRole("link", { name: "Inbox" }));
}

/** Changes the workflow, and lets the page hear from the editor that it has unsaved changes. */
async function renameWorkflow(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Rename" }));
  await act(async () => {});
}

beforeEach(() => {
  window.history.replaceState(null, "", "/org/acme/automations/visual-workflows/workflow-1");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("VisualWorkflowEditorPageContent leave guard", () => {
  it("does not interrupt leaving while the workflow is as it was loaded", () => {
    renderPage(createApi().api);

    expect(clickInboxLink()).toBe(true);
    expect(screen.queryByText("Leave without saving?")).toBeNull();
  });

  it("asks before leaving with an unsaved change, and stays when told to", async () => {
    const user = userEvent.setup();
    renderPage(createApi().api);

    await renameWorkflow(user);

    expect(clickInboxLink()).toBe(false);
    expect(await screen.findByText("Leave without saving?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByText("Leave without saving?")).toBeNull();
    expect(mocks.routerPush).not.toHaveBeenCalled();
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });

  it("leaves when told to throw the change away", async () => {
    const user = userEvent.setup();
    renderPage(createApi().api);

    await renameWorkflow(user);
    clickInboxLink();
    await user.click(await screen.findByRole("button", { name: "Leave without saving" }));

    expect(mocks.routerReplace).toHaveBeenCalledWith("/org/acme/inbox", { scroll: undefined });
  });

  it("stops asking once the change is saved", async () => {
    const user = userEvent.setup();
    const { api, updateVisualWorkflow } = createApi();
    renderPage(api);

    await renameWorkflow(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateVisualWorkflow).toHaveBeenCalledOnce());
    await act(async () => {});

    expect(clickInboxLink()).toBe(true);
    expect(screen.queryByText("Leave without saving?")).toBeNull();
  });

  it("goes to the workflow list after deleting without asking", async () => {
    const user = userEvent.setup();
    const { api, deleteVisualWorkflow } = createApi();
    renderPage(api);

    await renameWorkflow(user);
    await user.click(screen.getByRole("button", { name: "Delete workflow" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /delete/i }),
    );

    await waitFor(() => expect(deleteVisualWorkflow).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith("/org/acme/automations/visual-workflows", {
        scroll: undefined,
      });
    });
    expect(screen.queryByText("Leave without saving?")).toBeNull();
  });
});
