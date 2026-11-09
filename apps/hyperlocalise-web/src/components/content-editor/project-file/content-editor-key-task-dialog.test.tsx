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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorKeyTaskDialog } from "./content-editor-key-task-dialog";

const createJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": { jobs: { $post: createJob, ":jobId": { keys: { $post: vi.fn() } } } },
          },
        },
      },
    },
  },
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({ client: null }),
}));

function renderDialog() {
  return render(
    <ContentEditorTestProviders>
      <ContentEditorKeyTaskDialog
        open
        onOpenChange={vi.fn()}
        organizationSlug="acme"
        projectId="project-1"
        sourceLocale="en"
        targetLocales={["fr-FR", "de-DE"]}
        stringIds={["ticked-1", "ticked-2"]}
        onOpenTask={vi.fn()}
      />
    </ContentEditorTestProviders>,
  );
}

describe("ContentEditorKeyTaskDialog", () => {
  beforeEach(() => {
    createJob.mockReset();
  });

  it("puts the ticked strings into a new task in the chosen languages", async () => {
    const user = userEvent.setup();
    createJob.mockResolvedValue({
      status: 201,
      json: async () => ({ job: { id: "job-1", keyCount: 2 } }),
    });
    renderDialog();

    expect(screen.getByText(/The 2 ticked strings go into a task/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Release 7");
    await user.click(screen.getByRole("checkbox", { name: "de-DE" }));
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0][0].json.keysInput).toEqual({
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      stringIds: ["ticked-1", "ticked-2"],
    });
  });

  it("needs a title and a language before creating a task", async () => {
    const user = userEvent.setup();
    renderDialog();

    const create = screen.getByRole("button", { name: "Create task" });
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText("Title"), "Release 7");
    expect(create).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: "fr-FR" }));
    await user.click(screen.getByRole("checkbox", { name: "de-DE" }));
    expect(create).toBeDisabled();
  });
});
