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

import { ProjectIssueTemplatesPanel } from "./project-issue-templates-panel";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const organizationSlug = "acme";
const projectId = "project_1";

const members = [
  {
    userId: "user_mina",
    workosUserId: "workos_mina",
    email: "mina@example.com",
    firstName: "Mina",
    lastName: "Chen",
    displayName: "Mina Chen",
    avatarUrl: null,
    isCurrentUser: true,
  },
];

function templateConfigResponse(
  overrides: {
    defaultTemplateKey?: string | null;
    assigneeByTemplate?: { templateKey: string; userId: string; assignable: boolean }[];
  } = {},
) {
  return {
    templateConfig: {
      defaultTemplateKey: overrides.defaultTemplateKey ?? null,
      assigneeByTemplate: overrides.assigneeByTemplate ?? [],
    },
  };
}

function mockFetch(getBody: ReturnType<typeof templateConfigResponse> = templateConfigResponse()) {
  const putCalls: RequestInit[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/assignable-members")) {
      return new Response(JSON.stringify({ members }), { status: 200 });
    }
    if (url.includes("/template-config")) {
      if (init?.method === "PUT") {
        putCalls.push(init);
        return new Response(JSON.stringify(getBody), { status: 200 });
      }
      return new Response(JSON.stringify(getBody), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  return { fetchMock, putCalls };
}

function renderPanel(getBody?: ReturnType<typeof templateConfigResponse>) {
  const { fetchMock, putCalls } = mockFetch(getBody);
  vi.stubGlobal("fetch", fetchMock);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <ProjectIssueTemplatesPanel organizationSlug={organizationSlug} projectId={projectId} />
      </IntlProvider>
    </QueryClientProvider>,
  );

  return { fetchMock, putCalls };
}

describe("ProjectIssueTemplatesPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows no default template when the config is empty", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText("Default template")).toHaveTextContent("No template");
    });
  });

  it("shows the loaded default template", async () => {
    renderPanel(templateConfigResponse({ defaultTemplateKey: "tpl_qa_failure" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Default template")).toHaveTextContent("QA failure");
    });
  });

  it("flags a bound assignee who is no longer assignable, without dropping the binding silently", async () => {
    renderPanel(
      templateConfigResponse({
        assigneeByTemplate: [
          { templateKey: "tpl_qa_failure", userId: "user_departed", assignable: false },
        ],
      }),
    );
    await waitFor(() => {
      expect(screen.getByText("No longer has access")).toBeInTheDocument();
    });
  });

  it("does not flag a bound assignee who is still assignable", async () => {
    renderPanel(
      templateConfigResponse({
        assigneeByTemplate: [
          { templateKey: "tpl_qa_failure", userId: "user_mina", assignable: true },
        ],
      }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Default template")).toBeInTheDocument();
    });
    expect(screen.queryByText("No longer has access")).not.toBeInTheDocument();
  });

  it("sends the full config object on save, not just the changed field", async () => {
    const user = userEvent.setup();
    const { putCalls } = renderPanel(
      templateConfigResponse({
        assigneeByTemplate: [
          { templateKey: "tpl_qa_failure", userId: "user_mina", assignable: true },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Default template")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Save template settings" }));

    await waitFor(() => expect(putCalls).toHaveLength(1));
    const body = JSON.parse(putCalls[0]?.body as string) as {
      defaultTemplateKey: string | null;
      assigneeByTemplate: Record<string, string>;
    };
    // The assignee binding must survive a save that never touched it — PUT is a full-object
    // replace, so re-sending only the field the admin actually changed would silently wipe it.
    expect(body).toEqual({
      defaultTemplateKey: null,
      assigneeByTemplate: { tpl_qa_failure: "user_mina" },
    });
  });

  it("drops a still-stale binding from the save payload instead of re-sending the rejected user", async () => {
    // The picker displays a stale binding as unassigned but the draft keeps the userId around so
    // isStale can detect it (see the panel's mutationFn comment). A save that never touched this
    // field must match what's displayed, or the server rejects the same departed user again and
    // blocks an otherwise-unrelated edit.
    const user = userEvent.setup();
    const { putCalls } = renderPanel(
      templateConfigResponse({
        assigneeByTemplate: [
          { templateKey: "tpl_qa_failure", userId: "user_departed", assignable: false },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("No longer has access")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Save template settings" }));

    await waitFor(() => expect(putCalls).toHaveLength(1));
    const body = JSON.parse(putCalls[0]?.body as string) as {
      defaultTemplateKey: string | null;
      assigneeByTemplate: Record<string, string>;
    };
    expect(body).toEqual({ defaultTemplateKey: null, assigneeByTemplate: {} });
  });
});
