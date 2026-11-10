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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { UseTranslationAsSourceDialog } from "./use-translation-as-source-dialog";

const apiMocks = vi.hoisted(() => ({
  getDestinations: vi.fn(),
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
