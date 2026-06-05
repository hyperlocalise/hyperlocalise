import { TestAppI18nProvider } from "@canva/app-i18n-kit";
import { TestAppUiProvider } from "@canva/app-ui-kit";
import { editContent } from "@canva/design";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { App } from "./app";

function renderInTestProvider(node: ReactNode) {
  return render(
    <TestAppI18nProvider>
      <TestAppUiProvider>{node}</TestAppUiProvider>
    </TestAppI18nProvider>,
  );
}

vi.mock("@canva/design", () => ({
  editContent: vi.fn(),
}));

describe("Text translation template", () => {
  beforeEach(() => {
    vi.mocked(editContent).mockResolvedValue(undefined);
  });

  it("renders translation action buttons", () => {
    const result = renderInTestProvider(<App />);

    expect(result.getByRole("button", { name: "Translate with formatting" })).toBeTruthy();
    expect(
      result.getByRole("button", {
        name: "Translate without formatting",
      }),
    ).toBeTruthy();
  });
});
