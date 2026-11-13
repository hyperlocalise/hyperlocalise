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

import { UseTranslationAsSourceDialog } from "./use-translation-as-source-dialog";

const apiMocks = vi.hoisted(() => ({
  getDestinations: vi.fn(),
  getDestinationFile: vi.fn(),
  getSent: vi.fn(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 })),
  send: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              files: {
                "translation-source": {
                  $post: apiMocks.send,
                  destinations: { $get: apiMocks.getDestinations },
                  "destination-file": { $get: apiMocks.getDestinationFile },
                  sent: { $get: apiMocks.getSent },
                },
              },
            },
          },
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: apiMocks.toastSuccess, error: vi.fn() },
}));

const englishProject = {
  id: "project_en",
  name: "English stage",
  sourceLocale: "en",
  keepsApprovedOnSourceChange: false,
};

const frenchProject = {
  id: "project_fr",
  name: "French stage",
  sourceLocale: "fr",
  keepsApprovedOnSourceChange: true,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en" messages={{}}>
          <UseTranslationAsSourceDialog
            open
            onOpenChange={onOpenChange}
            organizationSlug="acme"
            projectId="project_zh"
            sourcePath="docs/brief.docx"
          />
        </IntlProvider>
      </QueryClientProvider>,
    ),
  };
}

describe("UseTranslationAsSourceDialog", () => {
  beforeEach(() => {
    apiMocks.getDestinationFile.mockImplementation(async () =>
      jsonResponse({ destinationFile: { state: "empty", path: "docs/brief.docx", addedAt: null } }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the projects that can take the translation and sends it to the chosen one", async () => {
    apiMocks.getDestinations.mockResolvedValue(
      jsonResponse({ destinations: [englishProject, frenchProject] }),
    );
    apiMocks.send.mockResolvedValue(
      jsonResponse(
        {
          file: {
            destinationProjectId: "project_en",
            sourcePath: "docs/brief.docx",
            sourceFileVersionId: "version_1",
            stringCount: 12,
          },
        },
        201,
      ),
    );

    const { onOpenChange } = renderDialog();

    const picker = await screen.findByRole("combobox", { name: "Project" });
    expect(picker).toHaveTextContent("English stage — English (en)");
    expect(apiMocks.getDestinations).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: "project_zh" },
    });

    await userEvent.click(picker);
    expect(await screen.findByRole("option", { name: "French stage — French (fr)" })).toBeTruthy();
    await userEvent.click(screen.getByRole("option", { name: "English stage — English (en)" }));

    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(apiMocks.send).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: "project_zh" },
      json: { sourcePath: "docs/brief.docx", destinationProjectId: "project_en" },
    });
    expect(apiMocks.toastSuccess).toHaveBeenCalledWith("File sent to English stage.");
  });

  it("shows which strings still need an approved translation and stays open", async () => {
    apiMocks.getDestinations.mockResolvedValue(jsonResponse({ destinations: [englishProject] }));
    apiMocks.send.mockResolvedValue(
      jsonResponse(
        {
          error: "translations_not_approved",
          message: "Some strings have no approved translation in this language yet.",
          details: {
            missingCount: 23,
            totalCount: 40,
            missingStrings: [
              { key: "word/document.xml#1", sourceText: "季度报告" },
              { key: "word/document.xml#7", sourceText: "联系我们" },
            ],
          },
        },
        409,
      ),
    );

    const { onOpenChange } = renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Send" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "23 of 40 strings have no approved translation in English yet.",
    );
    expect(alert).toHaveTextContent("季度报告");
    expect(alert).toHaveTextContent("联系我们");
    expect(alert).toHaveTextContent("and 21 more");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(apiMocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("shows the server's message for other refusals", async () => {
    apiMocks.getDestinations.mockResolvedValue(jsonResponse({ destinations: [englishProject] }));
    apiMocks.send.mockResolvedValue(
      jsonResponse(
        {
          error: "project_not_native",
          message: "Both projects must store their files in the workspace.",
        },
        400,
      ),
    );

    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Both projects must store their files in the workspace.",
    );
  });

  it("explains in its own words the refusals a person can reach", async () => {
    apiMocks.getDestinations.mockResolvedValue(jsonResponse({ destinations: [englishProject] }));
    apiMocks.send.mockResolvedValue(
      jsonResponse({ error: "file_reads_differently", message: "Server wording." }, 400),
    );

    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "the other project would not read it as the same strings",
    );
  });

  it("notes when the chosen project keeps approved translations after source changes", async () => {
    apiMocks.getDestinations.mockResolvedValue(
      jsonResponse({ destinations: [englishProject, frenchProject] }),
    );

    renderDialog();

    const picker = await screen.findByRole("combobox", { name: "Project" });
    expect(screen.queryByText(/stay approved/)).toBeNull();

    await userEvent.click(picker);
    await userEvent.click(
      await screen.findByRole("option", { name: "French stage — French (fr)" }),
    );

    expect(
      screen.getByText(
        "When this text changes later, approved translations in French stage stay approved. To change this, use “When source text changes” in that project's settings.",
      ),
    ).toBeTruthy();
  });

  it("says what a send would replace in the chosen project, and replaces that version", async () => {
    apiMocks.getDestinations.mockResolvedValue(jsonResponse({ destinations: [englishProject] }));
    apiMocks.getDestinationFile.mockImplementation(async () =>
      jsonResponse({
        destinationFile: {
          state: "other",
          path: "docs/brief.docx",
          addedAt: "2026-11-03T09:30:00.000Z",
          versionId: "7d1b4c1e-2f1a-4e55-9e33-0b8f8a2c1d10",
          addedBy: "Mei Chen",
          sentFrom: null,
        },
      }),
    );
    apiMocks.send.mockResolvedValue(jsonResponse({ file: {} }, 201));

    renderDialog();

    expect(
      await screen.findByText(
        /^English stage has docs\/brief\.docx, uploaded by Mei Chen on .+\. Sending replaces it\./,
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace in English stage" }));

    await waitFor(() =>
      expect(apiMocks.send).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", projectId: "project_zh" },
        json: {
          sourcePath: "docs/brief.docx",
          destinationProjectId: "project_en",
          replaceVersionId: "7d1b4c1e-2f1a-4e55-9e33-0b8f8a2c1d10",
        },
      }),
    );
  });

  it("says when a file the chosen project's repository sync added would be replaced", async () => {
    apiMocks.getDestinations.mockResolvedValue(jsonResponse({ destinations: [englishProject] }));
    apiMocks.getDestinationFile.mockImplementation(async () =>
      jsonResponse({
        destinationFile: {
          state: "from_sync",
          path: "docs/brief.docx",
          addedAt: "2026-11-03T09:30:00.000Z",
          versionId: "5c0b7f3e-8d1a-4c2b-9f6e-3a2d1c0b9e8f",
        },
      }),
    );
    apiMocks.send.mockResolvedValue(jsonResponse({ file: {} }, 201));

    renderDialog();

    expect(
      await screen.findByText(
        /^English stage has docs\/brief\.docx, added on .+ by its connection to a repository/,
      ),
    ).toBeInTheDocument();
    const replace = screen.getByRole("button", { name: "Replace in English stage" });
    expect(replace).toHaveAccessibleDescription(/may put its copy back/);
    await userEvent.click(replace);

    await waitFor(() =>
      expect(apiMocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({
            replaceVersionId: "5c0b7f3e-8d1a-4c2b-9f6e-3a2d1c0b9e8f",
          }),
        }),
      ),
    );
  });

  it("shows what the chosen project has now when its file changed after the dialog opened", async () => {
    apiMocks.getDestinations.mockResolvedValue(jsonResponse({ destinations: [englishProject] }));
    apiMocks.getDestinationFile
      .mockImplementationOnce(async () =>
        jsonResponse({
          destinationFile: { state: "empty", path: "docs/brief.docx", addedAt: null },
        }),
      )
      .mockImplementation(async () =>
        jsonResponse({
          destinationFile: {
            state: "other",
            path: "docs/brief.docx",
            addedAt: "2026-11-03T09:30:00.000Z",
            versionId: "7d1b4c1e-2f1a-4e55-9e33-0b8f8a2c1d10",
            addedBy: "Mei Chen",
            sentFrom: null,
          },
        }),
      );
    apiMocks.send.mockResolvedValue(
      jsonResponse({ error: "destination_file_replaced", message: "Server wording." }, 409),
    );

    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The file in that project changed since this dialog opened.",
    );
    expect(
      await screen.findByText(/^English stage has docs\/brief\.docx, uploaded by Mei Chen/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace in English stage" }));

    await waitFor(() =>
      expect(apiMocks.send).toHaveBeenLastCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({
            replaceVersionId: "7d1b4c1e-2f1a-4e55-9e33-0b8f8a2c1d10",
          }),
        }),
      ),
    );
  });

  it("does not send when it could not check what the chosen project has", async () => {
    apiMocks.getDestinations.mockResolvedValue(jsonResponse({ destinations: [englishProject] }));
    apiMocks.getDestinationFile.mockImplementation(async () =>
      jsonResponse({ error: "internal_error" }, 500),
    );

    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not check what English stage has at this path",
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("drops the earlier notice when reading the chosen project's file again fails", async () => {
    apiMocks.getDestinations.mockResolvedValue(jsonResponse({ destinations: [englishProject] }));
    apiMocks.getDestinationFile
      .mockImplementationOnce(async () =>
        jsonResponse({
          destinationFile: {
            state: "other",
            path: "docs/brief.docx",
            addedAt: "2026-11-03T09:30:00.000Z",
            versionId: "7d1b4c1e-2f1a-4e55-9e33-0b8f8a2c1d10",
            addedBy: "Mei Chen",
            sentFrom: null,
          },
        }),
      )
      .mockImplementation(async () => jsonResponse({ error: "internal_error" }, 500));
    apiMocks.send.mockResolvedValue(jsonResponse({ error: "internal_error" }, 500));

    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Replace in English stage" }));

    expect(
      await screen.findByText(/^Could not check what English stage has at this path/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/uploaded by Mei Chen/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("says when the file was last sent to the chosen project and that it changed since", async () => {
    apiMocks.getDestinations.mockResolvedValue(
      jsonResponse({ destinations: [englishProject, frenchProject] }),
    );
    apiMocks.getSent.mockResolvedValueOnce(
      jsonResponse({
        sends: [
          {
            sourcePath: "docs/brief.docx",
            destinationProjectId: "project_en",
            destinationProjectName: "English stage",
            locale: "en",
            sentAt: "2026-11-10T13:56:58.674Z",
            changedSinceSent: true,
          },
        ],
      }),
    );

    renderDialog();

    expect(
      await screen.findByText(
        /^Last sent to this project on .+\. The English translation has changed since, or the file was uploaded again\.$/,
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: /French stage/ }));
    expect(screen.queryByText(/^Last sent to this project/)).not.toBeInTheDocument();
  });

  it("says so when no project can take the translation", async () => {
    apiMocks.getDestinations.mockResolvedValue(jsonResponse({ destinations: [] }));

    renderDialog();

    expect(
      await screen.findByText(
        "No project has one of this project's languages as its source language.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
