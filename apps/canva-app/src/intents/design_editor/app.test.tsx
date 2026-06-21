import { TestAppI18nProvider } from "@canva/app-i18n-kit";
import { TestAppUiProvider } from "@canva/app-ui-kit";
import { editContent, getDesignToken } from "@canva/design";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { App } from "./app";
import { localizeDesign } from "./hyperlocalise-client";

function renderInTestProvider(node: ReactNode) {
  return render(
    <TestAppI18nProvider>
      <TestAppUiProvider>{node}</TestAppUiProvider>
    </TestAppI18nProvider>,
  );
}

vi.mock("@canva/design", () => ({
  editContent: vi.fn(),
  getDesignToken: vi.fn(),
}));

vi.mock("./hyperlocalise-client", () => ({
  localizeDesign: vi.fn(),
  HyperlocaliseClientError: class HyperlocaliseClientError extends Error {},
}));

describe("Hyperlocalise Canva app", () => {
  beforeEach(() => {
    vi.mocked(editContent).mockImplementation(async (_options, callback) => {
      await callback({
        contents: [
          {
            readPlaintext: () => "Hello",
            readTextRegions: () => [{ text: "Hello" }],
            replaceText: vi.fn(),
          },
        ] as never,
        sync: vi.fn(),
      });
    });
    vi.mocked(getDesignToken).mockResolvedValue({ token: "design-token" });
    vi.mocked(localizeDesign).mockResolvedValue({
      jobId: "job_test",
      mode: "preview",
      translationsByLocale: {
        es: {
          "canva.segment.0.0": "Hola",
        },
      },
    });
  });

  it("renders localization workflow UI", () => {
    const result = renderInTestProvider(<App />);

    expect(result.getByText("Hyperlocalise for Canva")).toBeTruthy();
    expect(result.getByRole("button", { name: "Localize and sync design" })).toBeTruthy();
    expect(result.getByText("Project settings")).toBeTruthy();
    expect(result.getByText("Workflow")).toBeTruthy();
  });
});
