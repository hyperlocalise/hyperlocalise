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

function renderSettings(canManage = true) {
  apiMocks.contentEditorBehavior.mockResolvedValue({
    contentEditorBehavior: {
      automaticallyGroupIdenticalStrings: false,
      groupingRevision: 0,
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
      name: "Automatically group identical strings",
    });

    await user.click(setting);

    expect(await screen.findByText(/7 occurrences into 3 groups/)).toBeInTheDocument();
    expect(screen.getByText(/Existing translations will not be changed/)).toBeInTheDocument();
    expect(apiMocks.previewContentEditorBehavior).toHaveBeenCalledWith("acme", "project_1");
  });

  it("keeps the setting read-only for non-managers", async () => {
    renderSettings(false);
    const setting = await screen.findByRole("switch", {
      name: "Automatically group identical strings",
    });
    await waitFor(() => expect(setting).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByText("Only project managers can change this setting.")).toBeInTheDocument();
  });
});
