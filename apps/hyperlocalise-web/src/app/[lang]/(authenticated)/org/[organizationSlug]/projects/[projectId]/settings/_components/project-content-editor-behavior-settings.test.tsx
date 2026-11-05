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

import { ProjectContentEditorBehaviorSettings } from "./project-content-editor-behavior-settings";

const apiMocks = vi.hoisted(() => ({
  contentEditorBehavior: vi.fn(),
  previewContentEditorBehavior: vi.fn(),
  updateContentEditorBehavior: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      project: {
        contentEditorBehavior: apiMocks.contentEditorBehavior,
        previewContentEditorBehavior: apiMocks.previewContentEditorBehavior,
        updateContentEditorBehavior: apiMocks.updateContentEditorBehavior,
      },
    },
    loading: false,
  }),
}));

function renderSettings(canManage = true, sourceTextEditable = false) {
  apiMocks.contentEditorBehavior.mockResolvedValue({
    contentEditorBehavior: {
      automaticallyGroupIdenticalStrings: false,
      groupingRevision: 0,
      approvedTranslationsOnSourceChange: "stay_approved",
      sourceTextEditable,
      canManage,
    },
  });
  apiMocks.previewContentEditorBehavior.mockResolvedValue({
    preview: { affectedOccurrences: 7, groups: 3 },
  });
  apiMocks.updateContentEditorBehavior.mockResolvedValue({
    contentEditorBehavior: {
      automaticallyGroupIdenticalStrings: true,
      groupingRevision: 1,
      approvedTranslationsOnSourceChange: "stay_approved",
      canManage: true,
    },
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <IntlProvider locale="en" messages={{}}>
        <ProjectContentEditorBehaviorSettings
          organizationSlug="acme"
          projectId="project_1"
          canManage={canManage}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProjectContentEditorBehaviorSettings", () => {
  it("previews impact and promises translations remain unchanged before enabling", async () => {
    const user = userEvent.setup();
    renderSettings();
    const setting = await screen.findByRole("switch", {
      name: "Automatically merge identical strings",
    });

    await user.click(setting);

    expect(await screen.findByText(/7 occurrences into 3 strings/)).toBeInTheDocument();
    expect(screen.getByText(/Existing translations will not be changed/)).toBeInTheDocument();
    expect(apiMocks.previewContentEditorBehavior).toHaveBeenCalledWith("acme", "project_1");
  });

  it("saves what happens to approved translations when source text changes", async () => {
    const user = userEvent.setup();
    renderSettings();
    const setting = await screen.findByRole("combobox", { name: "When source text changes" });
    expect(setting).toHaveTextContent("Stays approved");

    await user.click(setting);
    await user.click(await screen.findByRole("option", { name: "Needs review" }));

    await waitFor(() =>
      expect(apiMocks.updateContentEditorBehavior).toHaveBeenCalledWith("acme", "project_1", {
        approvedTranslationsOnSourceChange: "needs_review",
      }),
    );
    expect(apiMocks.previewContentEditorBehavior).not.toHaveBeenCalled();
  });

  it("turns source text editing on at once and asks before turning it off", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(
      await screen.findByRole("switch", { name: "Edit source text in Hyperlocalise" }),
    );
    await waitFor(() =>
      expect(apiMocks.updateContentEditorBehavior).toHaveBeenCalledWith("acme", "project_1", {
        sourceTextEditable: true,
      }),
    );
  });

  it("warns that edits not yet in the files are replaced when editing is turned off", async () => {
    const user = userEvent.setup();
    renderSettings(true, true);
    await user.click(
      await screen.findByRole("switch", { name: "Edit source text in Hyperlocalise" }),
    );

    expect(await screen.findByText("Stop editing source text here?")).toBeInTheDocument();
    expect(apiMocks.updateContentEditorBehavior).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stop editing here" }));
    await waitFor(() =>
      expect(apiMocks.updateContentEditorBehavior).toHaveBeenCalledWith("acme", "project_1", {
        sourceTextEditable: false,
      }),
    );
  });

  it("keeps the setting read-only for non-managers", async () => {
    renderSettings(false);
    const setting = await screen.findByRole("switch", {
      name: "Automatically merge identical strings",
    });
    await waitFor(() => expect(setting).toHaveAttribute("aria-disabled", "true"));
    expect(
      screen.getByText("Only admins and localization managers can change these settings."),
    ).toBeInTheDocument();
  });
});
