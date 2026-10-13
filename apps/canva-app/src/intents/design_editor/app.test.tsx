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
import { TestAppI18nProvider } from "@canva/app-i18n-kit";
import { TestAppUiProvider } from "@canva/app-ui-kit";
import { getDesignToken } from "@canva/design";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { App } from "./app";
import * as designContent from "./design-content";
import { loadSettings } from "./settings";
import type { AppSettings, CanvaLocaleStatus, CanvaSession } from "./types";

function renderInTestProvider(node: ReactNode) {
  return render(
    <TestAppI18nProvider>
      <TestAppUiProvider>{node}</TestAppUiProvider>
    </TestAppI18nProvider>,
  );
}

function emptySettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    connectionToken: "",
    organizationSlug: "",
    organizationName: "",
    projectId: "",
    projectName: "",
    sourceLocale: "",
    targetLocales: "",
    preserveFormatting: true,
    selectedPageIndices: [],
    selectedLocale: "",
    lastJobId: "",
    ...overrides,
  };
}

function connectedSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return emptySettings({
    connectionToken: "hl_canva_test",
    organizationSlug: "acme",
    organizationName: "Acme",
    projectId: "project_1",
    projectName: "Marketing",
    sourceLocale: "en-US",
    targetLocales: "fr-FR",
    selectedPageIndices: [0],
    selectedLocale: "fr-FR",
    ...overrides,
  });
}

function session(overrides: Partial<CanvaSession> = {}): CanvaSession {
  return {
    organization: { id: "org_1", name: "Acme", slug: "acme" },
    project: {
      id: "project_1",
      name: "Marketing",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    },
    projects: [
      {
        id: "project_1",
        name: "Marketing",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      {
        id: "project_2",
        name: "Onboarding",
        sourceLocale: "en-US",
        targetLocales: ["de-DE"],
      },
    ],
    connection: {
      id: "conn_1",
      displayName: "Canva",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    },
    ...overrides,
  };
}

function readyFrenchStatus(): CanvaLocaleStatus {
  return {
    locale: "fr-FR",
    status: "succeeded",
    translated: 1,
    total: 1,
    translatedWords: 1,
    wordCount: 1,
    percent: 100,
    approved: 1,
    approvedPercent: 100,
    canAdd: true,
    pages: [
      {
        pageIndex: 0,
        sourcePath: "canva/designs/mic/page-1.json",
        jobId: "job_1",
        status: "succeeded",
        translated: 1,
        total: 1,
        translatedWords: 1,
        wordCount: 1,
        approved: 1,
      },
    ],
  };
}

vi.mock("@canva/platform", () => ({
  notification: {
    addToast: vi.fn(async () => ({ status: "completed" })),
  },
  requestOpenExternalUrl: vi.fn(),
}));

vi.mock("@canva/design", () => ({
  getDesignToken: vi.fn(),
  getDesignMetadata: vi.fn(async () => ({ title: "Marketing flyer" })),
}));

vi.mock("./design-content", () => ({
  listDesignPages: vi.fn(),
  extractDesignContent: vi.fn(),
  applyTranslationsToCurrentPage: vi.fn(),
  applyTranslationsToDesign: vi.fn(),
}));

vi.mock("./settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./settings")>();
  return {
    ...actual,
    loadSettings: vi.fn(() => actual.loadSettings()),
  };
});

vi.mock("./local-development", () => ({
  isLocalDevelopment: vi.fn(() => true),
}));

vi.mock("./hyperlocalise-client", () => ({
  createCanvaClaim: vi.fn(),
  pollCanvaClaim: vi.fn(),
  fetchCanvaSession: vi.fn(),
  bindCanvaProject: vi.fn(),
  collectCanvaDesign: vi.fn(),
  generateCanvaLocaleJob: vi.fn(),
  waitForCanvaJobs: vi.fn(),
  getCanvaJob: vi.fn(),
  fetchCanvaLocaleStatuses: vi.fn(async () => ({ locales: [], pages: [] })),
  pullCanvaLocalePages: vi.fn(),
  getHyperlocaliseAccessToken: vi.fn(async () => null),
  requestHyperlocaliseAuthorization: vi.fn(),
  deauthorizeHyperlocalise: vi.fn(),
  buildCanvaJobUrl: vi.fn(() => null),
  buildCanvaProjectUrl: vi.fn((input: { organizationSlug: string; projectId: string }) =>
    input.organizationSlug && input.projectId
      ? `https://app.example.test/org/${input.organizationSlug}/projects/${input.projectId}`
      : null,
  ),
  openExternalUrl: vi.fn(),
  CANVA_JOB_POLL_INTERVAL_MS: 1_500,
  HyperlocaliseClientError: class HyperlocaliseClientError extends Error {},
}));

describe("Hyperlocalise Canva app", () => {
  beforeEach(async () => {
    const { isLocalDevelopment } = await import("./local-development");
    vi.mocked(isLocalDevelopment).mockReturnValue(true);
    vi.mocked(designContent.listDesignPages).mockResolvedValue([
      { index: 0, label: "Page 1", locked: false, editable: true },
      { index: 1, label: "Page 2", locked: false, editable: true },
    ]);
    vi.mocked(getDesignToken).mockResolvedValue({ token: "design-token" });
    vi.mocked(loadSettings).mockReturnValue(emptySettings());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the disconnected connect flow", async () => {
    const result = renderInTestProvider(<App />);

    expect(
      result.getByText("Connect your Hyperlocalise account to translate your Canva designs."),
    ).toBeTruthy();
    expect(result.getByRole("button", { name: "Connect Hyperlocalise" })).toBeTruthy();
    expect(result.queryByText("Connection token")).toBeNull();
    expect(result.queryByRole("button", { name: "Upload" })).toBeNull();

    fireEvent.click(result.getByText("Use a connection token"));
    expect(result.getByText("Connection token")).toBeTruthy();
    expect(result.getByRole("button", { name: "Connect with token" })).toBeTruthy();
  });

  it("hides the connection token fallback outside local development", async () => {
    const { isLocalDevelopment } = await import("./local-development");
    vi.mocked(isLocalDevelopment).mockReturnValue(false);

    const result = renderInTestProvider(<App />);

    expect(
      result.getByText("Connect your Hyperlocalise account to translate your Canva designs."),
    ).toBeTruthy();
    expect(result.getByRole("button", { name: "Connect Hyperlocalise" })).toBeTruthy();
    expect(result.queryByText("Use a connection token")).toBeNull();
    expect(result.queryByText("Connection token")).toBeNull();
  });

  it("shows language, pages, and upload after a project is bound", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings());
    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({
      locales: [
        {
          locale: "fr-FR",
          status: "idle",
          translated: 0,
          total: 0,
          translatedWords: 0,
          wordCount: 0,
          percent: 0,
          approved: 0,
          approvedPercent: 0,
          canAdd: false,
          pages: [],
        },
      ],
      pages: [],
    });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByRole("button", { name: "Upload" })).toBeTruthy();
      expect(result.getByText("Pages to translate")).toBeTruthy();
    });

    expect(result.getByText("Translate to")).toBeTruthy();
    expect(result.getByText("Project: Marketing")).toBeTruthy();
    expect(result.getByText("Change")).toBeTruthy();
    expect(result.getByText("Switch Account")).toBeTruthy();
    expect(result.queryByText("Project", { exact: true })).toBeNull();
    expect(result.getByRole("button", { name: "Apply" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Apply" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(result.getByRole("button", { name: "Translate" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Reload languages" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Reload pages" })).toBeTruthy();
    expect(result.getByRole("combobox", { name: "Page 1" })).toBeTruthy();
    expect(result.getByText("Select all")).toBeTruthy();
    expect(result.getByText("Clear all")).toBeTruthy();
  });

  it("shows a multi-page selection in the page dropdown", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings({ selectedPageIndices: [0, 1] }));
    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({ locales: [], pages: [] });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByRole("combobox", { name: "Page 1, Page 2" })).toBeTruthy();
    });
  });

  it("selects and clears all pages from the page picker", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings({ selectedPageIndices: [0] }));
    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({ locales: [], pages: [] });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByRole("combobox", { name: "Page 1" })).toBeTruthy();
      expect(result.getByText("Select all")).toBeTruthy();
      expect(result.getByText("Clear all")).toBeTruthy();
    });
    fireEvent.click(result.getByText("Select all"));

    await waitFor(() => {
      expect(result.getByRole("combobox", { name: "Page 1, Page 2" })).toBeTruthy();
    });
    fireEvent.click(result.getByText("Clear all"));

    await waitFor(() => {
      expect(result.getByRole("combobox", { name: "No options selected" })).toBeTruthy();
    });
  });

  it("opens the project screen from Change", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings());
    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({ locales: [], pages: [] });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByText("Change")).toBeTruthy();
    });
    fireEvent.click(result.getByText("Change"));

    expect(result.getByText("Project", { exact: true })).toBeTruthy();
    expect(result.getByText("Switch Account")).toBeTruthy();
    expect(result.queryByRole("button", { name: "Upload" })).toBeNull();
    expect(result.queryByRole("button", { name: "Translate" })).toBeNull();
  });

  it("uploads selected pages after preview confirm", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings({ selectedLocale: "" }));
    const { fetchCanvaSession, fetchCanvaLocaleStatuses, collectCanvaDesign } =
      await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({ locales: [], pages: [] });
    vi.mocked(designContent.extractDesignContent).mockResolvedValue({
      segments: [
        {
          key: "canva.segment.0.0.0",
          pageIndex: 0,
          contentIndex: 0,
          regionIndex: 0,
          text: "Hello",
        },
      ],
      pageIndices: [0],
      preserveFormatting: true,
    });
    vi.mocked(collectCanvaDesign).mockResolvedValue({
      designSlug: "marketing-flyer",
      projectId: "project_1",
      pages: [
        {
          pageIndex: 0,
          sourcePath: "canva/designs/marketing-flyer/page-1.json",
          sourceFileId: "file_1",
          segmentCount: 1,
          wordCount: 1,
        },
      ],
    });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByRole("button", { name: "Upload" })).toBeTruthy();
    });
    fireEvent.click(result.getByRole("button", { name: "Upload" }));

    await waitFor(() => {
      expect(result.getByText("Upload to Hyperlocalise")).toBeTruthy();
      expect(result.getByText("1 page · 1 text to Marketing.")).toBeTruthy();
      expect(collectCanvaDesign).not.toHaveBeenCalled();
    });
    fireEvent.click(result.getByRole("button", { name: "Upload pages" }));

    await waitFor(() => {
      expect(collectCanvaDesign).toHaveBeenCalled();
      expect(result.getByText("Uploaded 1 page file.")).toBeTruthy();
    });
  });

  it("enables Apply for a ready page when locale canAdd is false", async () => {
    vi.mocked(designContent.listDesignPages).mockResolvedValue([
      { index: 0, label: "Page 1", locked: false, editable: true },
      { index: 1, label: "Page 2", locked: false, editable: true },
      { index: 2, label: "Page 3", locked: false, editable: true },
    ]);
    vi.mocked(loadSettings).mockReturnValue(
      connectedSettings({ selectedPageIndices: [2], selectedLocale: "fr-FR" }),
    );
    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({
      locales: [
        {
          ...readyFrenchStatus(),
          canAdd: false,
          pages: [
            {
              pageIndex: 0,
              sourcePath: "canva/designs/mic/page-1.json",
              jobId: null,
              status: "idle",
              translated: 0,
              total: 1,
              translatedWords: 0,
              wordCount: 1,
              approved: 0,
            },
            {
              pageIndex: 2,
              sourcePath: "canva/designs/mic/page-3.json",
              jobId: "job_3",
              status: "waiting_for_review",
              translated: 3,
              total: 3,
              translatedWords: 3,
              wordCount: 3,
              approved: 3,
            },
          ],
        },
      ],
      pages: [],
    });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByRole("button", { name: "Apply" }).getAttribute("aria-disabled")).not.toBe(
        "true",
      );
    });
  });

  it("applies existing translations to selected pages", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings());
    const { fetchCanvaSession, fetchCanvaLocaleStatuses, pullCanvaLocalePages } =
      await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({
      locales: [readyFrenchStatus()],
      pages: [],
    });
    vi.mocked(pullCanvaLocalePages).mockResolvedValue({
      locale: "fr-FR",
      projectId: "project_1",
      pages: [
        { pageIndex: 0, translations: { "canva.segment.0.0": "Bonjour" } },
        { pageIndex: 1, translations: { "canva.segment.1.0": "Ignore" } },
      ],
    });
    vi.mocked(designContent.applyTranslationsToDesign).mockResolvedValue(1);

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByRole("button", { name: "Apply" }).getAttribute("aria-disabled")).not.toBe(
        "true",
      );
    });
    fireEvent.click(result.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(designContent.applyTranslationsToDesign).toHaveBeenCalledWith(
        [{ pageIndex: 0, translations: { "canva.segment.0.0": "Bonjour" } }],
        true,
      );
      expect(
        result.getByText("Applied French (fr-FR) translations to 1 selected page."),
      ).toBeTruthy();
    });
  });

  it("shows progress while translating", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings());
    const {
      fetchCanvaSession,
      fetchCanvaLocaleStatuses,
      collectCanvaDesign,
      generateCanvaLocaleJob,
      waitForCanvaJobs,
      pullCanvaLocalePages,
    } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({ locales: [], pages: [] });
    vi.mocked(designContent.extractDesignContent).mockResolvedValue({
      segments: [
        {
          key: "canva.segment.0.0.0",
          pageIndex: 0,
          contentIndex: 0,
          regionIndex: 0,
          text: "Hello",
        },
      ],
      pageIndices: [0],
      preserveFormatting: true,
    });
    vi.mocked(collectCanvaDesign).mockResolvedValue({
      designSlug: "marketing-flyer",
      projectId: "project_1",
      pages: [],
    });
    vi.mocked(generateCanvaLocaleJob).mockResolvedValue({
      locale: "fr-FR",
      projectId: "project_1",
      jobIds: ["job_1"],
    });

    let finishJobs: (() => void) | undefined;
    vi.mocked(waitForCanvaJobs).mockImplementation(async (input) => {
      input.onProgress?.(0, 1);
      await new Promise<void>((resolve) => {
        finishJobs = resolve;
      });
    });
    vi.mocked(pullCanvaLocalePages).mockResolvedValue({
      locale: "fr-FR",
      projectId: "project_1",
      pages: [{ pageIndex: 0, translations: { "canva.segment.0.0": "Bonjour" } }],
    });
    vi.mocked(designContent.applyTranslationsToDesign).mockResolvedValue(1);

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(
        result.getByRole("button", { name: "Translate" }).getAttribute("aria-disabled"),
      ).not.toBe("true");
    });
    fireEvent.click(result.getByRole("button", { name: "Translate" }));

    await waitFor(() => {
      expect(result.getByText("Translating with AI...")).toBeTruthy();
      expect(result.getByRole("progressbar", { name: "Translating with AI..." })).toBeTruthy();
    });

    finishJobs?.();
    await waitFor(() => {
      expect(result.getByText("Translated French (fr-FR) and applied to 1 page.")).toBeTruthy();
    });
  });

  it("translates by uploading, generating, and applying", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings());
    const {
      fetchCanvaSession,
      fetchCanvaLocaleStatuses,
      collectCanvaDesign,
      generateCanvaLocaleJob,
      waitForCanvaJobs,
      pullCanvaLocalePages,
    } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({ locales: [], pages: [] });
    vi.mocked(designContent.extractDesignContent).mockResolvedValue({
      segments: [
        {
          key: "canva.segment.0.0.0",
          pageIndex: 0,
          contentIndex: 0,
          regionIndex: 0,
          text: "Hello",
        },
      ],
      pageIndices: [0],
      preserveFormatting: true,
    });
    vi.mocked(collectCanvaDesign).mockResolvedValue({
      designSlug: "marketing-flyer",
      projectId: "project_1",
      pages: [
        {
          pageIndex: 0,
          sourcePath: "canva/designs/marketing-flyer/page-1.json",
          sourceFileId: "file_1",
          segmentCount: 1,
          wordCount: 1,
        },
      ],
    });
    vi.mocked(generateCanvaLocaleJob).mockResolvedValue({
      locale: "fr-FR",
      projectId: "project_1",
      jobIds: ["job_1"],
    });
    vi.mocked(waitForCanvaJobs).mockResolvedValue();
    vi.mocked(pullCanvaLocalePages).mockResolvedValue({
      locale: "fr-FR",
      projectId: "project_1",
      pages: [{ pageIndex: 0, translations: { "canva.segment.0.0": "Bonjour" } }],
    });
    vi.mocked(designContent.applyTranslationsToDesign).mockResolvedValue(1);

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(
        result.getByRole("button", { name: "Translate" }).getAttribute("aria-disabled"),
      ).not.toBe("true");
    });
    fireEvent.click(result.getByRole("button", { name: "Translate" }));

    await waitFor(() => {
      expect(collectCanvaDesign).toHaveBeenCalled();
      expect(generateCanvaLocaleJob).toHaveBeenCalledWith(
        expect.objectContaining({
          locale: "fr-FR",
        }),
      );
      expect(waitForCanvaJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          jobIds: ["job_1"],
        }),
      );
      expect(designContent.applyTranslationsToDesign).toHaveBeenCalled();
      expect(result.getByText("Translated French (fr-FR) and applied to 1 page.")).toBeTruthy();
    });
  });

  it("binds a newly selected project", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings({ projectId: "" }));
    const { fetchCanvaSession, bindCanvaProject, fetchCanvaLocaleStatuses } =
      await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(
      session({
        project: null,
      }),
    );
    vi.mocked(bindCanvaProject).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({ locales: [], pages: [] });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByText("Project")).toBeTruthy();
      expect(result.getByText("Switch Account")).toBeTruthy();
      expect(result.getByRole("combobox", { name: "No options selected" })).toBeTruthy();
    });

    fireEvent.click(result.getByRole("combobox", { name: "No options selected" }));
    fireEvent.click(await result.findByRole("option", { name: "Marketing" }));

    await waitFor(() => {
      expect(bindCanvaProject).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project_1",
        }),
      );
    });
  });

  it("reloads project languages and locale statuses", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings());
    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({ locales: [], pages: [] });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(
        result.getByRole("button", { name: "Reload languages" }).getAttribute("aria-disabled"),
      ).not.toBe("true");
    });
    const sessionCallsAfterLoad = vi.mocked(fetchCanvaSession).mock.calls.length;
    const statusCallsAfterLoad = vi.mocked(fetchCanvaLocaleStatuses).mock.calls.length;

    fireEvent.click(result.getByRole("button", { name: "Reload languages" }));

    await waitFor(() => {
      expect(vi.mocked(fetchCanvaSession).mock.calls.length).toBeGreaterThan(sessionCallsAfterLoad);
      expect(vi.mocked(fetchCanvaLocaleStatuses).mock.calls.length).toBeGreaterThan(
        statusCallsAfterLoad,
      );
    });
  });

  it("refreshes translation status when selected pages change", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings({ selectedPageIndices: [0] }));
    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({
      locales: [readyFrenchStatus()],
      pages: [],
    });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByText("Select all")).toBeTruthy();
    });
    const statusCallsAfterLoad = vi.mocked(fetchCanvaLocaleStatuses).mock.calls.length;

    fireEvent.click(result.getByText("Select all"));

    await waitFor(() => {
      expect(vi.mocked(fetchCanvaLocaleStatuses).mock.calls.length).toBeGreaterThan(
        statusCallsAfterLoad,
      );
    });
  });

  it("reloads the design page list", async () => {
    vi.mocked(loadSettings).mockReturnValue(connectedSettings());
    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue(session());
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({ locales: [], pages: [] });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(
        result.getByRole("button", { name: "Reload pages" }).getAttribute("aria-disabled"),
      ).not.toBe("true");
    });
    const callsAfterLoad = vi.mocked(designContent.listDesignPages).mock.calls.length;

    fireEvent.click(result.getByRole("button", { name: "Reload pages" }));

    await waitFor(() => {
      expect(vi.mocked(designContent.listDesignPages).mock.calls.length).toBeGreaterThan(
        callsAfterLoad,
      );
    });
  });
});
