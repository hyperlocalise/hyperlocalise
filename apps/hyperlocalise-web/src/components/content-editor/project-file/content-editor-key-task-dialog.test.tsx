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

function renderDialog(onSaved = vi.fn(), onAiTranslationStarted = vi.fn()) {
  render(
    <ContentEditorTestProviders>
      <ContentEditorKeyTaskDialog
        open
        onOpenChange={vi.fn()}
        organizationSlug="acme"
        projectId="project-1"
        sourceLocale="en"
        targetLocales={["fr-FR", "de-DE"]}
        defaultLocale="de-DE"
        stringIds={["ticked-1", "ticked-2"]}
        onSaved={onSaved}
        onAiTranslationStarted={onAiTranslationStarted}
        onOpenTask={vi.fn()}
      />
    </ContentEditorTestProviders>,
  );
  return onSaved;
}

async function chooseAiTranslation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Task type" }));
  await user.click(await screen.findByRole("option", { name: "AI translation" }));
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

  it("starts AI translation in the editor's language, filling only missing translations", async () => {
    const user = userEvent.setup();
    createJob.mockResolvedValue({
      status: 201,
      json: async () => ({ job: { id: "job-1", keyCount: 2 } }),
    });
    const onAiTranslationStarted = vi.fn();
    const onSaved = renderDialog(vi.fn(), onAiTranslationStarted);

    await chooseAiTranslation(user);
    expect(screen.getByText(/The 2 ticked strings are translated with AI/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Due date/)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "de-DE" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "fr-FR" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Translate" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onAiTranslationStarted).toHaveBeenCalledWith("job-1");
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

  it("asks AI to replace unapproved translations when ticked, and needs a language", async () => {
    const user = userEvent.setup();
    createJob.mockResolvedValue({
      status: 201,
      json: async () => ({ job: { id: "job-1", keyCount: 2 } }),
    });
    renderDialog();

    await chooseAiTranslation(user);
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
