import { TestAppI18nProvider } from "@canva/app-i18n-kit";
import { TestAppUiProvider } from "@canva/app-ui-kit";
import { editContent } from "@canva/design";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { App } from "../app";

function renderInTestProvider(node: ReactNode): RenderResult {
    return render(
        <TestAppI18nProvider>
            <TestAppUiProvider>{node}</TestAppUiProvider>
        </TestAppI18nProvider>,
    );
}

jest.mock("@canva/design", () => ({
    editContent: jest.fn(),
}));

describe("Text translation template", () => {
    beforeEach(() => {
        jest.resetAllMocks();
        jest.mocked(editContent).mockResolvedValue(undefined);
    });

    it("renders translation action buttons", () => {
        const result = renderInTestProvider(<App />);

        expect(
            result.getByRole("button", { name: "Translate with formatting" }),
        ).toBeTruthy();
        expect(
            result.getByRole("button", {
                name: "Translate without formatting",
            }),
        ).toBeTruthy();
    });

    it("should have a consistent snapshot", () => {
        const result = renderInTestProvider(<App />);
        expect(result.container).toMatchSnapshot();
    });
});
