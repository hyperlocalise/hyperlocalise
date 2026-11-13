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

import { ProjectFileMessageFormatDialog } from "./project-file-message-format-dialog";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              files: {
                "message-format": {
                  $get: apiMocks.get,
                  $patch: apiMocks.patch,
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
  toast: {
    success: apiMocks.toastSuccess,
    error: apiMocks.toastError,
  },
}));

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
          <ProjectFileMessageFormatDialog
            open
            onOpenChange={onOpenChange}
            organizationSlug="acme"
            projectId="project_1"
            sourcePath="locales/en.json"
          />
        </IntlProvider>
      </QueryClientProvider>,
    ),
  };
}

describe("ProjectFileMessageFormatDialog", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads and saves placeholder format through the typed client", async () => {
    apiMocks.get.mockResolvedValue(jsonResponse({ messageFormat: "icu" }));
    apiMocks.patch.mockResolvedValue(jsonResponse({ messageFormat: "icu" }));

    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveTextContent("ICU MessageFormat");
    });

    expect(apiMocks.get).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: "project_1" },
      query: { sourcePath: "locales/en.json" },
    });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", projectId: "project_1" },
        json: { sourcePath: "locales/en.json", messageFormat: "icu", placeholderPatterns: [] },
      });
    });
  });

  it("loads, previews, and saves custom placeholder patterns", async () => {
    apiMocks.get.mockResolvedValue(
      jsonResponse({ messageFormat: "auto", placeholderPatterns: ["\\[\\[\\w+\\]\\]"] }),
    );
    apiMocks.patch.mockResolvedValue(jsonResponse({ messageFormat: "auto" }));

    renderDialog();

    const field = await screen.findByLabelText("Custom placeholder patterns");
    expect(field).toHaveValue("\\[\\[\\w+\\]\\]");

    await userEvent.type(field, "\n:\\w+");
    await userEvent.click(screen.getByLabelText("Test your patterns"));
    await userEvent.paste("Hi [[name]], see :link");
    expect(screen.getByText("2 placeholders: [[name]], :link")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", projectId: "project_1" },
        json: {
          sourcePath: "locales/en.json",
          messageFormat: "auto",
          placeholderPatterns: ["\\[\\[\\w+\\]\\]", ":\\w+"],
        },
      });
    });
  });

  it("blocks saving invalid placeholder patterns", async () => {
    apiMocks.get.mockResolvedValue(
      jsonResponse({ messageFormat: "auto", placeholderPatterns: [] }),
    );

    renderDialog();

    const field = await screen.findByLabelText("Custom placeholder patterns");
    await userEvent.type(field, ":\\w+\n(?<=x)y");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Line 2 uses lookaround or a backreference, which is not supported.",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(apiMocks.patch).not.toHaveBeenCalled();
  });

  it("shows a load error with retry and close instead of a spinner", async () => {
    apiMocks.get.mockResolvedValue(
      jsonResponse({ error: "source_file_not_found", message: "Source file not found." }, 404),
    );

    const { onOpenChange } = renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("Source file not found.");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledTimes(2);
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses the localized fallback when the load request fails on the network", async () => {
    apiMocks.get.mockRejectedValue(new TypeError("Failed to fetch"));

    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load placeholder format.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
