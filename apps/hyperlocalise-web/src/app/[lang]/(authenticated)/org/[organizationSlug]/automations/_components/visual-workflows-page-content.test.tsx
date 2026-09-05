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

import { createEmptyVisualWorkflowDefinition } from "@/lib/visual-workflows/schema/serializers";
import type { VisualWorkflowRecord } from "@/lib/visual-workflows/visual-workflow-types";

import { VisualWorkflowsPageContent } from "./visual-workflows-page-content";
import type { VisualWorkflowsApi } from "./visual-workflows-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function createWorkflow(name: string): VisualWorkflowRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "org_1",
    authorUserId: null,
    projectId: null,
    status: "draft",
    name,
    definition: createEmptyVisualWorkflowDefinition(name),
    definitionVersion: 1,
    triggerFingerprint: null,
    nextRunAt: null,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
}

function renderPage(api: VisualWorkflowsApi) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <VisualWorkflowsPageContent organizationSlug="acme" visualWorkflowsApi={api} />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("VisualWorkflowsPageContent", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renames the page to visual workflows and deletes a listed workflow", async () => {
    const user = userEvent.setup();
    const workflow = createWorkflow("Lead ping");
    const deleteVisualWorkflow = vi.fn().mockResolvedValue(undefined);
    const api: VisualWorkflowsApi = {
      listVisualWorkflows: vi.fn().mockResolvedValue([workflow]),
      getVisualWorkflow: vi.fn(),
      createVisualWorkflow: vi.fn(),
      updateVisualWorkflow: vi.fn(),
      deleteVisualWorkflow,
      createVisualWorkflowRun: vi.fn(),
      listVisualWorkflowRuns: vi.fn(),
      getVisualWorkflowRun: vi.fn(),
    };

    renderPage(api);

    expect(await screen.findByRole("heading", { name: "Visual workflows" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Lead ping/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete workflow?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(deleteVisualWorkflow).toHaveBeenCalledWith("acme", workflow.id);
  });
});
