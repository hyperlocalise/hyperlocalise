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

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorActivityLogButton } from "./content-editor-activity-log-dialog";

const activityLogsGetMock = vi.hoisted(() => vi.fn());

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
                      $get: (...args: unknown[]) => activityLogsGetMock(...args),
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

describe("ContentEditorActivityLogButton", () => {
  it("opens a dialog of file and string activity", async () => {
    const user = userEvent.setup();
    activityLogsGetMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        activityLogs: [
          {
            actor: { displayName: "Ada Lovelace", kind: "user", userId: "user-1" },
            createdAt: "2026-09-08T10:00:00.000Z",
            eventType: "string_segment_approved",
            id: "activity-1",
            payload: { fileName: "en.json", name: "en.json" },
            target: { displayName: "en.json", href: null, kind: "string_segment" },
          },
        ],
        nextCursor: null,
      }),
    });

    renderWithContentEditorProviders(
      <ContentEditorActivityLogButton
        organizationSlug="acme"
        projectId="project-1"
        sourcePath="locales/en.json"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show file activity" }));

    expect(await screen.findByRole("heading", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByText(/approved a string/)).toBeInTheDocument();
    expect(activityLogsGetMock).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: "project-1" },
      query: {
        sourcePath: "locales/en.json",
        cursor: undefined,
        limit: "50",
      },
    });
  });
});
