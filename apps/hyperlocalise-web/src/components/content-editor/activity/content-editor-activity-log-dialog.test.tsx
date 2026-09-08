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

import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

const apiMocks = vi.hoisted(() => ({
  listActivityLogs: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              files: {
                detail: {
                  cat: {
                    "activity-logs": {
                      $get: apiMocks.listActivityLogs,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}));

import { ContentEditorActivityLogDialog } from "./content-editor-activity-log-dialog";

function renderDialog() {
  return renderWithContentEditorProviders(
    <ContentEditorActivityLogDialog
      open
      onOpenChange={vi.fn()}
      organizationSlug="acme"
      projectId="project_1"
      sourcePath="locales/en.json"
    />,
  );
}

describe("ContentEditorActivityLogDialog", () => {
  it("shows the empty state when the file has no activity", async () => {
    apiMocks.listActivityLogs.mockResolvedValue({
      ok: true,
      json: async () => ({ activityLogs: [], nextCursor: null }),
    });

    renderDialog();

    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
    expect(apiMocks.listActivityLogs).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: "project_1" },
      query: {
        cursor: undefined,
        limit: "50",
        sourcePath: "locales/en.json",
      },
    });
  });

  it("lists file and segment events for the current file", async () => {
    apiMocks.listActivityLogs.mockResolvedValue({
      ok: true,
      json: async () => ({
        activityLogs: [
          {
            actor: { displayName: "Ada", kind: "user", userId: "user_1" },
            createdAt: "2026-09-08T10:00:00.000Z",
            eventType: "segment_approved",
            id: "event_1",
            payload: { name: "home.title" },
            target: {
              displayName: "home.title",
              href: "/org/acme/projects/project_1/files/content-editor?sourcePath=locales/en.json",
              kind: "segment",
            },
          },
          {
            actor: { displayName: "Ada", kind: "user", userId: "user_1" },
            createdAt: "2026-09-08T09:00:00.000Z",
            eventType: "file_uploaded",
            id: "event_2",
            payload: { name: "en.json" },
            target: {
              displayName: "en.json",
              href: "/org/acme/projects/project_1/files/content-editor?sourcePath=locales/en.json",
              kind: "file",
            },
          },
        ],
        nextCursor: null,
      }),
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/approved a string/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/uploaded a file/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "home.title" })).toBeInTheDocument();
  });

  it("shows an error and retry when the request fails", async () => {
    apiMocks.listActivityLogs.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    renderDialog();

    expect(await screen.findByText("Activity could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
