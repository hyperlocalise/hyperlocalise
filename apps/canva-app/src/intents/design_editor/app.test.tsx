import { TestAppI18nProvider } from "@canva/app-i18n-kit";
import { TestAppUiProvider } from "@canva/app-ui-kit";
import { getDesignToken } from "@canva/design";
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { App } from "./app";
import * as designContent from "./design-content";
import * as hyperlocaliseClient from "./hyperlocalise-client";
import * as oauth from "./oauth";

function renderInTestProvider(node: ReactNode) {
  return render(
    <TestAppI18nProvider>
      <TestAppUiProvider>{node}</TestAppUiProvider>
    </TestAppI18nProvider>,
  );
}

vi.mock("@canva/design", () => ({
  getDesignMetadata: vi.fn(async () => ({
    id: "design-id",
    title: "Test design",
    defaultTitle: "Test design",
  })),
  getDesignToken: vi.fn(),
}));

vi.mock("@canva/platform", () => ({
  requestOpenExternalUrl: vi.fn(),
}));

vi.mock("./design-content", () => ({
  listDesignPages: vi.fn(),
  extractDesignContent: vi.fn(),
}));

vi.mock("./oauth", () => ({
  connectHyperlocalise: vi.fn(),
  disconnectHyperlocalise: vi.fn(),
  getHyperlocaliseAccessToken: vi.fn(),
}));

vi.mock("./hyperlocalise-client", () => ({
  fetchCanvaMe: vi.fn(),
  fetchCanvaProjects: vi.fn(),
  startLocalizeDesign: vi.fn(),
  pollLocalizeDesign: vi.fn(),
}));

describe("Hyperlocalise Canva app", () => {
  beforeEach(() => {
    vi.mocked(designContent.listDesignPages).mockResolvedValue([
      { index: 0, label: "Page 1", locked: false, editable: true },
      { index: 1, label: "Page 2", locked: false, editable: true },
    ]);
    vi.mocked(getDesignToken).mockResolvedValue({ token: "design-token" });
    vi.mocked(oauth.getHyperlocaliseAccessToken).mockResolvedValue(null);
  });

  it("renders frictionless workflow UI with sign-in and page selection", async () => {
    const result = renderInTestProvider(<App />);

    expect(result.getByText("Hyperlocalise")).toBeTruthy();
    expect(result.getByText("Sign in to Hyperlocalise")).toBeTruthy();
    expect(result.getByText("Pages to localize")).toBeTruthy();

    await waitFor(() => {
      expect(designContent.listDesignPages).toHaveBeenCalled();
    });

    expect(result.getByRole("button", { name: "Localize design" })).toBeTruthy();
  });

  it("loads account context after OAuth sign-in", async () => {
    vi.mocked(oauth.getHyperlocaliseAccessToken).mockResolvedValue("hl_canva_test_token");
    vi.mocked(hyperlocaliseClient.fetchCanvaMe).mockResolvedValue({
      user: { id: "user_1", email: "user@example.com" },
      organizations: [{ id: "org_1", name: "Acme", slug: "acme", role: "admin" }],
      brandBinding: null,
    });
    vi.mocked(hyperlocaliseClient.fetchCanvaProjects).mockResolvedValue([
      {
        id: "project_1",
        name: "Website",
        sourceLocale: "en-US",
        targetLocales: ["es-ES"],
      },
    ]);

    const result = renderInTestProvider(<App />);

    await waitFor(() => {
      expect(result.getByText("Signed in as user@example.com")).toBeTruthy();
      expect(hyperlocaliseClient.fetchCanvaMe).toHaveBeenCalled();
      expect(hyperlocaliseClient.fetchCanvaProjects).toHaveBeenCalledWith("org_1");
    });
  });
});
