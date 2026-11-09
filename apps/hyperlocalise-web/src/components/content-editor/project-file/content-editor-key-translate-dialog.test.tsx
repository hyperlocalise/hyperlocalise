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

import { ContentEditorKeyTranslateDialog } from "./content-editor-key-translate-dialog";

const createJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": { projects: { ":projectId": { jobs: { $post: createJob } } } },
      },
    },
  },
}));

function renderDialog(onStarted = vi.fn()) {
  render(
    <ContentEditorTestProviders>
      <ContentEditorKeyTranslateDialog
        open
        onOpenChange={vi.fn()}
        organizationSlug="acme"
        projectId="project-1"
        sourceLocale="en"
        targetLocales={["fr-FR", "de-DE"]}
        defaultLocale="de-DE"
        stringIds={["ticked-1", "ticked-2"]}
        onStarted={onStarted}
        onOpenJob={vi.fn()}
      />
    </ContentEditorTestProviders>,
  );
  return onStarted;
}

describe("ContentEditorKeyTranslateDialog", () => {
  beforeEach(() => {
    createJob.mockReset();
  });

  it("starts with the editor's language and fills only missing translations by default", async () => {
    const user = userEvent.setup();
    createJob.mockResolvedValue({
      status: 201,
      json: async () => ({ job: { id: "job-1", keyCount: 2 } }),
    });
    const onStarted = renderDialog();

    expect(screen.getByText(/The 2 ticked strings are translated with AI/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "de-DE" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "fr-FR" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Translate" }));

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0][0].json).toEqual({
      type: "keys",
      kind: "translation",
      title: "AI translation of 2 strings",
      keysInput: {
        sourceLocale: "en",
        targetLocales: ["de-DE"],
        stringIds: ["ticked-1", "ticked-2"],
      },
    });
  });

  it("asks to replace unapproved translations when that option is ticked, and needs a language", async () => {
    const user = userEvent.setup();
    createJob.mockResolvedValue({
      status: 201,
      json: async () => ({ job: { id: "job-1", keyCount: 2 } }),
    });
    renderDialog();

    const translate = screen.getByRole("button", { name: "Translate" });
    await user.click(screen.getByRole("checkbox", { name: "de-DE" }));
    expect(translate).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "fr-FR" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Also replace translations that are not approved yet" }),
    );
    await user.click(translate);

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0][0].json.keysInput).toMatchObject({
      targetLocales: ["fr-FR"],
      overwriteUnapproved: true,
    });
  });
});
