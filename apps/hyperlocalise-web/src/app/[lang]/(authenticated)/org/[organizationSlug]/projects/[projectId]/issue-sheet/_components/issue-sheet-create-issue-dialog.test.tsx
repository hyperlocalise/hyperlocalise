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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  IssueSheetCreateIssueDialog,
  type IssueSheetCreateStringLink,
} from "./issue-sheet-create-issue-dialog";
import {
  issueSheetAssignableMembersFixture,
  issueSheetColumnsFixture,
  issueSheetOrganizationSlug,
  issueSheetProjectId,
} from "./issue-sheet.fixture";

vi.mock("@/components/markdown-editor/markdown-editor", () => ({
  MarkdownEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (next: string) => void;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../_components/project-page-shell", () => ({
  useProjectPageQuery: () => ({
    data: {
      targetLocales: ["fr-FR", "de-DE", "es-ES"],
    },
    isLoading: false,
    isError: false,
  }),
}));

function stringLinkFor(segmentId: string): IssueSheetCreateStringLink {
  return {
    translationKeyId: segmentId,
    segmentId,
    sourcePath: "marketing/home.json",
    targetLocale: "fr-FR",
    defaultTitle: `Context needed: ${segmentId}`,
    defaultDescription: "Source text",
  };
}

function mockFetch(columns = issueSheetColumnsFixture) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/assignable-members")) {
      return new Response(JSON.stringify({ members: issueSheetAssignableMembersFixture }), {
        status: 200,
      });
    }
    if (url.includes("/columns")) {
      return new Response(JSON.stringify({ columns }), { status: 200 });
    }
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ issue: { id: "issue_new" } }), { status: 201 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

type DialogOptions = {
  segmentId?: string;
  projectId?: string;
  projects?: { id: string; name: string; targetLocales?: string[] }[];
  onOpenChange?: (open: boolean) => void;
  onCreated?: () => Promise<void>;
  createMore?: boolean;
};

function dialogTree(queryClient: QueryClient, options: DialogOptions = {}) {
  const {
    segmentId,
    projects,
    onOpenChange = () => undefined,
    onCreated = async () => undefined,
    createMore = false,
  } = options;
  const projectId = "projectId" in options ? options.projectId : issueSheetProjectId;

  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <IssueSheetCreateIssueDialog
          open
          onOpenChange={onOpenChange}
          organizationSlug={issueSheetOrganizationSlug}
          projectId={projectId}
          projects={projects}
          stringLink={segmentId ? stringLinkFor(segmentId) : undefined}
          onCreated={onCreated}
          defaultCreateMore={createMore}
        />
      </IntlProvider>
    </QueryClientProvider>
  );
}

function renderDialog(options: DialogOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(dialogTree(queryClient, options));

  return {
    ...view,
    rerenderWith: (next: DialogOptions) =>
      view.rerender(dialogTree(queryClient, { ...options, ...next })),
  };
}

async function openMoreProperties(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More properties" }));
}

async function openSubmenuItem(
  user: ReturnType<typeof userEvent.setup>,
  menuItemName: string | RegExp,
) {
  const item = await screen.findByRole("menuitem", { name: menuItemName });
  await user.hover(item);
  item.focus();
  await user.keyboard("{ArrowRight}");
}

describe("IssueSheetCreateIssueDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prefills the form from the string link", async () => {
    const user = userEvent.setup();
    renderDialog({ segmentId: "segment-1" });

    expect(screen.getByLabelText("Title")).toHaveValue("Context needed: segment-1");
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority")).toBeInTheDocument();

    await openMoreProperties(user);
    await openSubmenuItem(user, "Set locale");
    expect(await screen.findByLabelText("Locale")).toHaveTextContent("French (France)");
    await openSubmenuItem(user, "Set source path");
    expect(await screen.findByLabelText("Source path")).toHaveValue("marketing/home.json");
  });

  it("keeps in-progress edits when the caller rerenders with a new string link object", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderDialog({ segmentId: "segment-1" });

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Needs plural context");
    rerenderWith({ segmentId: "segment-1" });

    expect(screen.getByLabelText("Title")).toHaveValue("Needs plural context");
  });

  it("reinitializes the form when the linked segment changes", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderDialog({ segmentId: "segment-1" });

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Needs plural context");
    rerenderWith({ segmentId: "segment-2" });

    expect(screen.getByLabelText("Title")).toHaveValue("Context needed: segment-2");
  });

  it("shows compact custom columns in the more menu", async () => {
    const user = userEvent.setup();
    renderDialog();

    await openMoreProperties(user);
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Set type" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Set Sprint" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Set Component" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Set Reviewer" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("menuitem", { name: /Owner note/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Acceptance criteria/i }),
    ).not.toBeInTheDocument();
  });

  it("hides priority when the priority column is hidden", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch(
        issueSheetColumnsFixture.map((column) =>
          column.key === "priority" ? { ...column, hidden: true } : column,
        ),
      ),
    );

    renderDialog();

    await openMoreProperties(user);
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Set Sprint" })).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Priority")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });

  it("creates an issue with status and priority, then closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCreated = vi.fn(async () => undefined);
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    renderDialog({ onOpenChange, onCreated });

    await user.type(screen.getByLabelText("Title"), "Broken CTA");
    await user.click(screen.getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);

    const createCall = fetchMock.mock.calls.find(
      ([, init]) => init && typeof init === "object" && init.method === "POST",
    );
    expect(createCall).toBeTruthy();
    const requestBody = createCall?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    const body = JSON.parse(requestBody as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      title: "Broken CTA",
      status: "open",
      priority: "P2",
    });
  });

  it("keeps the dialog open and clears the title when create more is enabled", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCreated = vi.fn(async () => undefined);

    renderDialog({ onOpenChange, onCreated, createMore: true });

    await user.type(screen.getByLabelText("Title"), "First issue");
    await user.click(screen.getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Create more")).toBeChecked();
  });

  it("shows a project chip when organization scoped", () => {
    renderDialog({
      projectId: undefined,
      projects: [
        { id: issueSheetProjectId, name: "Web app" },
        { id: "project_mobile", name: "Mobile app" },
      ],
    });

    expect(screen.getByLabelText("Project")).toBeInTheDocument();
    expect(screen.getByText("Select a project")).toBeInTheDocument();
  });

  it("enables the locale picker for organization-scoped create before a project is chosen", async () => {
    const user = userEvent.setup();
    renderDialog({
      projectId: undefined,
      projects: [
        {
          id: issueSheetProjectId,
          name: "Web app",
          targetLocales: ["fr-FR", "de-DE"],
        },
        {
          id: "project_mobile",
          name: "Mobile app",
          targetLocales: ["ja-JP", "de-DE"],
        },
      ],
    });

    await openMoreProperties(user);
    await openSubmenuItem(user, "Set locale");
    expect(await screen.findByLabelText("Locale")).toBeEnabled();
  });
});
