import { TestAppI18nProvider } from "@canva/app-i18n-kit";
import { TestAppUiProvider } from "@canva/app-ui-kit";
import { getDesignToken } from "@canva/design";
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { App } from "./app";
import * as designContent from "./design-content";
import { localizeDesign } from "./hyperlocalise-client";

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

vi.mock("./hyperlocalise-client", () => ({
  localizeDesign: vi.fn(),
  HyperlocaliseClientError: class HyperlocaliseClientError extends Error {},
}));

describe("Hyperlocalise Canva app", () => {
  beforeEach(() => {
    vi.mocked(designContent.listDesignPages).mockResolvedValue([
      { index: 0, label: "Page 1", locked: false, editable: true },
      { index: 1, label: "Page 2", locked: false, editable: true },
    ]);
    vi.mocked(getDesignToken).mockResolvedValue({ token: "design-token" });
    vi.mocked(localizeDesign).mockResolvedValue({
      jobId: "job_test",
      mode: "preview",
      translationsByLocale: {
        es: {
          "canva.segment.0.0.0": "Hola",
        },
      },
    });
  });

  it("renders localization workflow UI with page selection", async () => {
    const result = renderInTestProvider(<App />);

    expect(result.getByText("Hyperlocalise for Canva")).toBeTruthy();
    expect(result.getByText("Pages to localize")).toBeTruthy();

    await waitFor(() => {
      expect(result.getByText("Page 1")).toBeTruthy();
      expect(result.getByText("Page 2")).toBeTruthy();
    });

    expect(result.getByRole("button", { name: "Localize and sync design" })).toBeTruthy();
    expect(result.getByText("Project settings")).toBeTruthy();
    expect(result.getByText("Workflow")).toBeTruthy();
  });
});
