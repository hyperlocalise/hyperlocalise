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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createProjectFileRecord } from "./project-files.fixture";
import { CreateTranslationJobDialog } from "./create-translation-job-dialog";

const apiMocks = vi.hoisted(() => ({
  jobsPost: vi.fn(),
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
              jobs: { $post: apiMocks.jobsPost },
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

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <CreateTranslationJobDialog
          open
          onOpenChange={() => undefined}
          organizationSlug="acme"
          projectId="project_1"
          file={createProjectFileRecord()}
          sourceLocale="en-US"
          targetLocales={["fr-FR", "de-DE"]}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("CreateTranslationJobDialog", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends ignoreTranslationMemory by default so untranslated strings are forced", async () => {
    apiMocks.jobsPost.mockResolvedValue(
      new Response(JSON.stringify({ job: { id: "job_1" } }), { status: 200 }),
    );

    renderDialog();

    expect(
      screen.getByRole("checkbox", { name: /Force translate untranslated strings/i }),
    ).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Translate with agent" }));

    expect(apiMocks.jobsPost).toHaveBeenCalledWith(
      expect.objectContaining({
        json: {
          type: "file",
          fileInput: expect.objectContaining({
            ignoreTranslationMemory: true,
            targetLocales: ["fr-FR", "de-DE"],
          }),
        },
      }),
    );
  });

  it("can keep translation memory reuse when the force option is turned off", async () => {
    apiMocks.jobsPost.mockResolvedValue(
      new Response(JSON.stringify({ job: { id: "job_1" } }), { status: 200 }),
    );

    renderDialog();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Force translate untranslated strings/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Translate with agent" }));

    expect(apiMocks.jobsPost).toHaveBeenCalledWith(
      expect.objectContaining({
        json: {
          type: "file",
          fileInput: expect.objectContaining({
            ignoreTranslationMemory: false,
          }),
        },
      }),
    );
  });
});
