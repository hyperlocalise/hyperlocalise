// @vitest-environment happy-dom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CatTestProviders } from "@/components/cat/shared/cat-test-utils";

import { createProjectFileRecord } from "./project-files.fixture";
import { ProjectFileSelectionActions } from "./project-file-selection-actions";

const { jobsPostMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  jobsPostMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
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

function getDialogSubmitButton() {
  return within(screen.getByRole("dialog", { name: "Translate with agent" })).getByRole("button", {
    name: "Translate with agent",
  });
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
    const view = render(renderActions({ targetLocales }), { wrapper: CatTestProviders });

    await user.click(screen.getByRole("button", { name: "Translate with agent" }));
    await user.click(screen.getByLabelText("fr-FR"));

    expect(screen.getByLabelText("vi")).toBeChecked();
    expect(screen.getByLabelText("fr-FR")).not.toBeChecked();

    view.rerender(renderActions({ layout: "compact", targetLocales }));

    expect(screen.getByLabelText("vi")).toBeChecked();
    expect(screen.getByLabelText("fr-FR")).not.toBeChecked();

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
    const view = render(renderActions(), { wrapper: CatTestProviders });

    await user.click(screen.getByRole("button", { name: "Translate with agent" }));
    await user.click(screen.getByLabelText("vi"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    view.rerender(renderActions({ targetLocales: ["de-DE"] }));

    await user.click(screen.getByRole("button", { name: "Translate with agent" }));

    expect(screen.queryByLabelText("vi")).not.toBeInTheDocument();
    expect(screen.getByLabelText("de-DE")).toBeChecked();

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
    render(renderActions(), { wrapper: CatTestProviders });

    await user.click(screen.getByRole("button", { name: "Translate with agent" }));
    await user.click(screen.getByLabelText("vi"));
    await user.click(screen.getByLabelText("fr-FR"));

    expect(getDialogSubmitButton()).toBeDisabled();
    expect(jobsPostMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
