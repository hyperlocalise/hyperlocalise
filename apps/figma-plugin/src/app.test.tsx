import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { App } from "./app";

describe("Text translation template", () => {
  it("renders translation action buttons", () => {
    const result = render(<App />);

    expect(result.getByRole("button", { name: "Translate with formatting" })).toBeTruthy();
    expect(
      result.getByRole("button", {
        name: "Translate without formatting",
      }),
    ).toBeTruthy();
  });
});
