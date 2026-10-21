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

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { createProjectFileRecord } from "./project-files.fixture";
import { ProjectFileSelectionActions } from "./project-file-selection-actions";

const { jobsPostMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  jobsPostMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@/lib/billing/use-ai-features-access", () => ({
  useAiFeaturesAccess: () => ({ status: "allowed" }),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              jobs: {
                $post: (...args: unknown[]) => jobsPostMock(...args),
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
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

const sourceFile = createProjectFileRecord({
  sourcePath: "en-US.json",
  storedFileId: "file_en_us",
  filename: "en-US.json",
});

function renderActions({
  layout = "default",
  targetLocales = ["vi", "fr-FR"],
}: {
  layout?: "default" | "compact";
  targetLocales?: readonly string[];
} = {}) {
  return (
    <ProjectFileSelectionActions
      organizationSlug="acme"
      projectId="proj_1"
      file={sourceFile}
      highlightLocale={null}
      projectTargetLocales={targetLocales}
      sourceLocale="en-US"
      nativeSourcePaths={[sourceFile.sourcePath]}
      layout={layout}
    />
  );
}

function getTranslateDialog() {
  return screen.getByRole("dialog", { name: "Translate with agent" });
}

function getDialogSubmitButton() {
  return within(getTranslateDialog()).getByRole("button", {
    name: "Translate with agent",
  });
}

function expectSelectedLocale(locale: string) {
  expect(within(getTranslateDialog()).getByText(locale)).toBeInTheDocument();
}

function expectLocaleNotSelected(locale: string) {
  expect(within(getTranslateDialog()).queryByText(locale)).not.toBeInTheDocument();
}

async function removeSelectedLocale(user: ReturnType<typeof userEvent.setup>, locale: string) {
  await user.click(within(getTranslateDialog()).getByRole("button", { name: `Remove ${locale}` }));
}

describe("ProjectFileSelectionActions translation dialog", () => {
  beforeEach(() => {
    jobsPostMock.mockResolvedValue(
      new Response(JSON.stringify({ job: { id: "job_translate_en_us" } }), { status: 201 }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserves selected target locales across parent re-renders before creating the job", async () => {
    const user = userEvent.setup();
    const targetLocales = ["vi", "fr-FR"] as const;
    const view = render(renderActions({ targetLocales }), { wrapper: ContentEditorTestProviders });

    await user.click(screen.getByRole("button", { name: "Translate with agent" }));
    await removeSelectedLocale(user, "fr-FR");

    expectSelectedLocale("vi");
    expectLocaleNotSelected("fr-FR");

    view.rerender(renderActions({ layout: "compact", targetLocales }));

    expectSelectedLocale("vi");
    expectLocaleNotSelected("fr-FR");

    await user.click(getDialogSubmitButton());

    await waitFor(() => expect(jobsPostMock).toHaveBeenCalledTimes(1));
    expect(jobsPostMock.mock.calls[0]?.[0]).toMatchObject({
      param: { organizationSlug: "acme", projectId: "proj_1" },
      json: {
        type: "file",
        fileInput: {
          sourceFileId: "file_en_us",
          fileFormat: "json",
          sourceLocale: "en-US",
          targetLocales: ["vi"],
        },
      },
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Translation agent is running");
  });

  it("resets selections to updated project target locales when reopened", async () => {
    const user = userEvent.setup();
    const view = render(renderActions(), { wrapper: ContentEditorTestProviders });

    await user.click(screen.getByRole("button", { name: "Translate with agent" }));
    await removeSelectedLocale(user, "vi");
    await user.click(within(getTranslateDialog()).getByRole("button", { name: "Cancel" }));

    view.rerender(renderActions({ targetLocales: ["de-DE"] }));

    await user.click(screen.getByRole("button", { name: "Translate with agent" }));

    expectLocaleNotSelected("vi");
    expectSelectedLocale("de-DE");

    await user.click(getDialogSubmitButton());

    await waitFor(() => expect(jobsPostMock).toHaveBeenCalledTimes(1));
    expect(jobsPostMock.mock.calls[0]?.[0]).toMatchObject({
      json: {
        fileInput: {
          targetLocales: ["de-DE"],
        },
      },
    });
  });

  it("disables job creation when every target locale is unchecked", async () => {
    const user = userEvent.setup();
    render(renderActions(), { wrapper: ContentEditorTestProviders });

    await user.click(screen.getByRole("button", { name: "Translate with agent" }));
    await user.click(within(getTranslateDialog()).getByRole("button", { name: "Clear" }));

    expect(getDialogSubmitButton()).toBeDisabled();
    expect(jobsPostMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
