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
import { cleanup, render, waitFor } from "@testing-library/react";
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
  createCanvaJob: vi.fn(),
  generateCanvaJob: vi.fn(),
  getCanvaJob: vi.fn(),
  fetchCurrentCanvaJob: vi.fn(),
  pullCanvaTranslations: vi.fn(),
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
    expect(result.queryByText("Pages to localize")).toBeNull();
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

    const { fetchCanvaSession, fetchCurrentCanvaJob } = await import("./hyperlocalise-client");
    vi.mocked(fetchCanvaSession).mockResolvedValue({
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      project: { id: "project_1", name: "Marketing", sourceLocale: "en", targetLocales: ["es"] },
      connection: {
        id: "conn_1",
        displayName: "Canva",
        sourceLocale: "en",
        targetLocales: ["es"],
      },
    });
    vi.mocked(fetchCurrentCanvaJob).mockResolvedValue(null);

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByText("Pages to localize")).toBeTruthy();
      expect(result.getByText("Page 1")).toBeTruthy();
    });

    expect(result.getByRole("button", { name: "Extract text" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Create job and generate" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Pull translations" })).toBeTruthy();
  });
});
