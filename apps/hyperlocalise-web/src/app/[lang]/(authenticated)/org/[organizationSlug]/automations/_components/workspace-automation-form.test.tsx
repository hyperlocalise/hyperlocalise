// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost:3000"}

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
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { IntlProvider } from "react-intl";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";

import { createManualAutomationFormFixture } from "./automation-editor.fixture";
import { automationEditorMswHandlers } from "./automation-msw-handlers";
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/org/acme/automations/new",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({ client: null, loading: true }),
}));

const server = setupServer(
  ...automationEditorMswHandlers,
  // Everything else the editor loads is not under test.
  http.all("*", () => HttpResponse.json({ error: "not_found" }, { status: 404 })),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function manualForm(
  overrides: Partial<WorkspaceAutomationFormState> = {},
): WorkspaceAutomationFormState {
  return {
    ...createDefaultWorkspaceAutomationFormState(),
    name: "Repository digest",
    instructions: "Summarize recent commits.",
    triggerMode: "manual",
    ...overrides,
  };
}

function EditorHarness({
  errors = {},
  initialForm,
  onFormChange,
}: {
  errors?: Record<string, string | undefined>;
  initialForm: WorkspaceAutomationFormState;
  onFormChange?: (form: WorkspaceAutomationFormState) => void;
}) {
  const [form, setForm] = useState(initialForm);
  return (
    <WorkspaceAutomationEditor
      errors={errors}
      form={form}
      mode="create"
      organizationSlug="acme"
      onChange={(next) => {
        setForm(next);
        onFormChange?.(next);
      }}
    />
  );
}

function renderEditor(props: Parameters<typeof EditorHarness>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en-US" messages={{}} onError={() => {}}>
        <EditorHarness {...props} />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("WorkspaceAutomationEditor Bitbucket repo tool", () => {
  it("adds the Bitbucket repo tool with the first repository", async () => {
    const user = userEvent.setup();
    const onFormChange = vi.fn();
    renderEditor({ initialForm: manualForm(), onFormChange });

    await user.click(await screen.findByRole("button", { name: /add tool/i }));
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: /use bitbucket repo/i })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    await user.click(screen.getByRole("menuitem", { name: /use bitbucket repo/i }));

    expect(onFormChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bitbucketEnabled: true,
        bitbucketRepositoryFullName: "acme/web",
        repositoryTargetKind: "bitbucket",
        gitlabEnabled: false,
        githubEnabled: false,
      }),
    );
    expect(await screen.findByText("acme/web")).toBeTruthy();
    expect(screen.getByRole("button", { name: /remove bitbucket repo tool/i })).toBeTruthy();
  });

  it("keeps the Bitbucket repo tool off while a GitHub tool is on", async () => {
    const user = userEvent.setup();
    renderEditor({ initialForm: createManualAutomationFormFixture() });

    await user.click(await screen.findByRole("button", { name: /add tool/i }));

    expect(await screen.findByRole("menuitem", { name: /use bitbucket repo/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("shows a saved repository and its field error", async () => {
    renderEditor({
      initialForm: manualForm({
        bitbucketEnabled: true,
        bitbucketRepositoryFullName: "acme/docs",
        repositoryTargetKind: "bitbucket",
      }),
      errors: { bitbucketRepository: "Connect Bitbucket in Integrations before using it." },
    });

    expect(await screen.findByText("acme/docs")).toBeTruthy();
    expect(screen.getByText("Connect Bitbucket in Integrations before using it.")).toBeTruthy();
  });

  it("removes the Bitbucket repo tool", async () => {
    const user = userEvent.setup();
    const onFormChange = vi.fn();
    renderEditor({
      initialForm: manualForm({
        bitbucketEnabled: true,
        bitbucketRepositoryFullName: "acme/docs",
        repositoryTargetKind: "bitbucket",
      }),
      onFormChange,
    });

    await user.click(await screen.findByRole("button", { name: /remove bitbucket repo tool/i }));

    expect(onFormChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bitbucketEnabled: false,
        bitbucketRepositoryFullName: "",
        repositoryTargetKind: "none",
      }),
    );
  });
});
