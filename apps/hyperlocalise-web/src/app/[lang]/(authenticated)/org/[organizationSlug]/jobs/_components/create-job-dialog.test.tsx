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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { CreateJobDialog } from "./create-job-dialog";

const apiMocks = vi.hoisted(() => ({
  nativeFilesGet: vi.fn(),
  nativeMembersGet: vi.fn(),
  nativeJobsPost: vi.fn(),
  providerFilesGet: vi.fn(),
  providerMembersGet: vi.fn(),
  providerJobsPost: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              files: { $get: apiMocks.nativeFilesGet },
              jobs: { $post: apiMocks.nativeJobsPost },
            },
          },
          members: { $get: apiMocks.nativeMembersGet },
          "tms-provider": {
            projects: {
              ":externalProjectId": {
                files: { $get: apiMocks.providerFilesGet },
                members: { $get: apiMocks.providerMembersGet },
                jobs: { $post: apiMocks.providerJobsPost },
              },
            },
          },
        },
      },
    },
  },
}));

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
  toast: {
    success: apiMocks.toastSuccess,
    error: apiMocks.toastError,
    warning: apiMocks.toastWarning,
  },
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const nativeFiles = [
  createProjectFileRecord(),
  createProjectFileRecord({
    sourcePath: "marketing/pricing.json",
    storedFileId: "file_pricing_json",
    filename: "pricing.json",
  }),
];

const nativeMembers = [
  {
    workosUserId: "user_mina",
    displayName: "Mina Chen",
    email: "mina@example.com",
    status: "active",
  },
];

const providerFiles = [
  {
    sourcePath: "locales/home.json",
    filename: "home.json",
    provider: { externalResourceId: "crowdin_file_home", resourceType: "file" },
  },
];

const providerMembers = [
  {
    externalUserId: "crowdin_mina",
    username: "mina",
    displayName: "Mina Chen",
    role: "translator",
  },
];

function renderDialog({
  projectId = "project_website",
  onOpenChange = vi.fn(),
  onCreated = vi.fn(),
}: {
  projectId?: string;
  onOpenChange?: (open: boolean) => void;
  onCreated?: () => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <CreateJobDialog
          open
          onOpenChange={onOpenChange}
          organizationSlug="acme"
          projectId={projectId}
          sourceLocale="en-US"
          targetLocales={["fr-FR", "de-DE"]}
          onCreated={onCreated}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("CreateJobDialog", () => {
  beforeEach(() => {
    apiMocks.nativeFilesGet.mockResolvedValue(jsonResponse({ files: nativeFiles }));
    apiMocks.nativeMembersGet.mockResolvedValue(jsonResponse({ members: nativeMembers }));
    apiMocks.nativeJobsPost.mockResolvedValue(jsonResponse({ job: { id: "job_native_1" } }, 201));
    apiMocks.providerFilesGet.mockResolvedValue(jsonResponse({ files: providerFiles }));
    apiMocks.providerMembersGet.mockResolvedValue(jsonResponse({ members: providerMembers }));
    apiMocks.providerJobsPost.mockResolvedValue(
      jsonResponse({ jobs: [{ id: "job_crowdin_fr" }, { id: "job_crowdin_de" }] }, 201),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the native composer with compact property chips", async () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "New job" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Source locale")).toHaveTextContent(/English/);
    expect(screen.getByLabelText("Target locales")).toHaveTextContent("All locales");
    expect(screen.getByLabelText("Files")).toBeInTheDocument();
    expect(screen.getByLabelText("Assignee")).toHaveTextContent("Unassigned");
    expect(screen.queryByLabelText("Task type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create job" })).toBeDisabled();

    await waitFor(() => expect(apiMocks.nativeFilesGet).toHaveBeenCalled());
  });

  it("creates a native job from the composer", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    renderDialog({ onOpenChange, onCreated });

    await user.type(screen.getByLabelText("Title"), "Release notes");
    await user.click(screen.getByLabelText("Files"));
    await user.click(await screen.findByRole("option", { name: /marketing\/home\.json/ }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() => expect(apiMocks.nativeJobsPost).toHaveBeenCalledTimes(1));
    expect(apiMocks.nativeJobsPost.mock.calls[0]?.[0]).toMatchObject({
      param: { organizationSlug: "acme", projectId: "project_website" },
      json: {
        type: "file",
        title: "Release notes",
        fileInput: {
          sourceFileId: "file_home_json",
          fileFormat: "json",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR", "de-DE"],
        },
      },
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(apiMocks.toastSuccess).toHaveBeenCalledWith("Job created");
  });

  it("renders Crowdin task type and description in the composer", async () => {
    const user = userEvent.setup();
    renderDialog({
      projectId: encodeProviderProjectId({
        providerKind: "crowdin",
        externalProjectId: "902807",
      }),
    });

    expect(screen.getByLabelText("Task type")).toHaveTextContent("Translation");
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Assignees")).toHaveTextContent("Unassigned");
    expect(screen.queryByLabelText("Source locale")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Task type"));
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: "Proofread" }));
    expect(screen.getByLabelText("Task type")).toHaveTextContent("Proofread");
  });

  it("creates Crowdin jobs with selected files, locales, and description", async () => {
    const user = userEvent.setup();
    renderDialog({
      projectId: encodeProviderProjectId({
        providerKind: "crowdin",
        externalProjectId: "902807",
      }),
    });

    await user.type(screen.getByLabelText("Title"), "Homepage");
    await user.type(screen.getByLabelText("Description"), "Ship the homepage first.");
    await user.click(screen.getByLabelText("Files"));
    await user.click(await screen.findByRole("option", { name: /locales\/home\.json/ }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() => expect(apiMocks.providerJobsPost).toHaveBeenCalledTimes(1));
    expect(apiMocks.providerJobsPost.mock.calls[0]?.[0]).toMatchObject({
      param: { organizationSlug: "acme", externalProjectId: "902807" },
      json: {
        title: "Homepage",
        targetLocales: ["fr-FR", "de-DE"],
        fileIds: ["crowdin_file_home"],
        kind: "translation",
        description: "Ship the homepage first.",
      },
    });
    await waitFor(() => expect(apiMocks.toastSuccess).toHaveBeenCalledWith("2 jobs created"));
  });
});
