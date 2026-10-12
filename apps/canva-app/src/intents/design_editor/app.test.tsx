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

function renderInTestProvider(node: ReactNode) {
  return render(
    <TestAppI18nProvider>
      <TestAppUiProvider>{node}</TestAppUiProvider>
    </TestAppI18nProvider>,
  );
}

vi.mock("@canva/design", () => ({
  getDesignToken: vi.fn(),
  getDesignMetadata: vi.fn(async () => ({ title: "Marketing flyer" })),
}));

vi.mock("./design-content", () => ({
  listDesignPages: vi.fn(),
  extractDesignContent: vi.fn(),
  applyTranslationsToDesign: vi.fn(),
}));

vi.mock("./settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./settings")>();
  return {
    ...actual,
    loadSettings: vi.fn(() => actual.loadSettings()),
  };
});

vi.mock("./hyperlocalise-client", () => ({
  createCanvaClaim: vi.fn(),
  pollCanvaClaim: vi.fn(),
  fetchCanvaSession: vi.fn(),
  collectCanvaDesign: vi.fn(),
  generateCanvaLocaleJob: vi.fn(),
  fetchCanvaLocaleStatuses: vi.fn(async () => ({ locales: [], pages: [] })),
  pullCanvaLocalePages: vi.fn(),
  getHyperlocaliseAccessToken: vi.fn(async () => null),
  requestHyperlocaliseAuthorization: vi.fn(),
  deauthorizeHyperlocalise: vi.fn(),
  buildCanvaJobUrl: vi.fn(() => null),
  openExternalUrl: vi.fn(),
  CANVA_JOB_POLL_INTERVAL_MS: 1_500,
  HyperlocaliseClientError: class HyperlocaliseClientError extends Error {},
}));

describe("Hyperlocalise Canva app", () => {
  beforeEach(() => {
    vi.mocked(designContent.listDesignPages).mockResolvedValue([
      { index: 0, label: "Page 1", locked: false, editable: true },
      { index: 1, label: "Page 2", locked: false, editable: true },
    ]);
    vi.mocked(getDesignToken).mockResolvedValue({ token: "design-token" });
    vi.mocked(loadSettings).mockReturnValue({
      connectionToken: "",
      organizationSlug: "",
      organizationName: "",
      projectName: "",
      sourceLocale: "en",
      targetLocales: "es,fr,de",
      preserveFormatting: true,
      selectedPageIndices: [],
      lastJobId: "",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the disconnected connect flow", async () => {
    const result = renderInTestProvider(<App />);

    expect(result.getByText("Hyperlocalise for Canva")).toBeTruthy();
    expect(result.getByRole("button", { name: "Connect Hyperlocalise" })).toBeTruthy();
    expect(result.getByText("Connection token")).toBeTruthy();
    expect(result.getByRole("button", { name: "Connect with token" })).toBeTruthy();
    expect(result.queryByRole("button", { name: "Collect texts" })).toBeNull();
  });

  it("loads design pages after connecting with a stored token", async () => {
    vi.mocked(loadSettings).mockReturnValue({
      connectionToken: "hl_canva_test",
      organizationSlug: "acme",
      organizationName: "Acme",
      projectName: "Marketing",
      sourceLocale: "en",
      targetLocales: "es",
      preserveFormatting: true,
      selectedPageIndices: [0],
      lastJobId: "",
    });

    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue({
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      project: {
        id: "project_1",
        name: "Marketing",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR", "de-DE"],
      },
      connection: {
        id: "conn_1",
        displayName: "Canva",
        sourceLocale: "en",
        targetLocales: ["es"],
      },
    });
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({
      locales: [
        {
          locale: "fr-FR",
          status: "idle",
          translated: 0,
          total: 0,
          translatedWords: 0,
          wordCount: 42,
          percent: 0,
          canAdd: false,
          pages: [],
        },
        {
          locale: "de-DE",
          status: "idle",
          translated: 0,
          total: 0,
          translatedWords: 0,
          wordCount: 42,
          percent: 0,
          canAdd: false,
          pages: [],
        },
      ],
      pages: [],
    });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByRole("button", { name: "Collect texts" })).toBeTruthy();
      expect(result.getByText("Page 1")).toBeTruthy();
      expect(result.getByText("French (fr-FR)", { exact: false })).toBeTruthy();
    });

    expect(result.getAllByText("English (en-US)", { exact: false }).length).toBeGreaterThan(0);
    expect(result.getByText("German (de-DE)", { exact: false })).toBeTruthy();
    expect(result.getByText("0% · No collected words · Not collected")).toBeTruthy();
    expect(result.getAllByText("0% · 0 of 42 words · Not started").length).toBeGreaterThan(0);
    expect(result.getByRole("button", { name: "Add to design" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Collect texts" })).toBeTruthy();
    expect(result.getByText("Add translations to design")).toBeTruthy();
  });

  it("opens apply controls on the language row", async () => {
    vi.mocked(loadSettings).mockReturnValue({
      connectionToken: "hl_canva_test",
      organizationSlug: "acme",
      organizationName: "Acme",
      projectName: "Marketing",
      sourceLocale: "en-US",
      targetLocales: "fr-FR",
      preserveFormatting: true,
      selectedPageIndices: [0],
      lastJobId: "",
    });

    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue({
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      project: {
        id: "project_1",
        name: "Marketing",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      connection: {
        id: "conn_1",
        displayName: "Canva",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });
    vi.mocked(fetchCanvaLocaleStatuses).mockResolvedValue({
      locales: [
        {
          locale: "en-US",
          isSource: true,
          status: "succeeded",
          translated: 8,
          total: 8,
          translatedWords: 42,
          wordCount: 42,
          percent: 100,
          canAdd: true,
          pages: [
            {
              pageIndex: 0,
              sourcePath: "canva/designs/mic/page-1.json",
              jobId: null,
              status: "succeeded",
              translated: 8,
              total: 8,
              translatedWords: 42,
              wordCount: 42,
            },
          ],
        },
        {
          locale: "fr-FR",
          status: "succeeded",
          translated: 8,
          total: 8,
          translatedWords: 42,
          wordCount: 42,
          percent: 100,
          canAdd: true,
          pages: [
            {
              pageIndex: 0,
              sourcePath: "canva/designs/mic/page-1.json",
              jobId: "job_1",
              status: "succeeded",
              translated: 8,
              total: 8,
              translatedWords: 42,
              wordCount: 42,
            },
          ],
        },
      ],
      pages: [],
    });

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getAllByRole("button", { name: "Add to design" }).length).toBe(2);
    });

    const [sourceAddButton] = result.getAllByRole("button", { name: "Add to design" });
    if (!sourceAddButton) {
      throw new Error("Expected a source Add to design button.");
    }
    fireEvent.click(sourceAddButton);

    expect(result.getByText("Page")).toBeTruthy();
    expect(result.getByText("Choose which collected page to write back.")).toBeTruthy();
    expect(result.queryByText("Current page")).toBeNull();
    expect(result.getByRole("button", { name: "Apply to this page" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Apply all" })).toBeTruthy();
    expect(result.getAllByRole("button", { name: "Add to design" }).length).toBe(1);
  });

  it("shows locale row skeletons while statuses load", async () => {
    vi.mocked(loadSettings).mockReturnValue({
      connectionToken: "hl_canva_test",
      organizationSlug: "acme",
      organizationName: "Acme",
      projectName: "Marketing",
      sourceLocale: "en-US",
      targetLocales: "fr-FR",
      preserveFormatting: true,
      selectedPageIndices: [0],
      lastJobId: "",
    });

    const { fetchCanvaSession, fetchCanvaLocaleStatuses } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue({
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      project: {
        id: "project_1",
        name: "Marketing",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      connection: {
        id: "conn_1",
        displayName: "Canva",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    });
    let resolveStatuses: (
      value: Awaited<ReturnType<typeof fetchCanvaLocaleStatuses>>,
    ) => void = () => {};
    vi.mocked(fetchCanvaLocaleStatuses).mockReturnValue(
      new Promise((resolve) => {
        resolveStatuses = resolve;
      }),
    );

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByText("Add translations to design")).toBeTruthy();
    });
    expect(result.queryByText("Not started")).toBeNull();
    expect(result.queryByRole("button", { name: "Generate translation" })).toBeNull();

    resolveStatuses({
      locales: [
        {
          locale: "fr-FR",
          status: "idle",
          translated: 0,
          total: 0,
          translatedWords: 0,
          wordCount: 12,
          percent: 0,
          canAdd: false,
          pages: [],
        },
      ],
      pages: [],
    });

    await waitFor(() => {
      expect(result.getByText("0% · 0 of 12 words · Not started")).toBeTruthy();
      expect(result.getByRole("button", { name: "Generate translation" })).toBeTruthy();
    });
  });
});
