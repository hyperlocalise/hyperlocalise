import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vite-plus/test";

import { TooltipButton, TooltipWrap } from "./tooltip-wrap";

describe("TooltipWrap", () => {
  it("renders children only when label is absent", () => {
    const { container } = render(
      <TooltipWrap>
        <button type="button">Action</button>
      </TooltipWrap>,
    );
    expect(container.querySelector(".tooltipWrap")).toBeNull();
    expect(screen.getByRole("button", { name: "Action" })).toBeTruthy();
  });

  it("wraps with data-tooltip and title when label is set", () => {
    const { container } = render(
      <TooltipWrap label="Choose a language.">
        <button type="button" disabled>
          Apply
        </button>
      </TooltipWrap>,
    );
    const wrap = container.querySelector(".tooltipWrap");
    expect(wrap).not.toBeNull();
    expect(wrap?.getAttribute("data-tooltip")).toBe("Choose a language.");
    expect(wrap?.getAttribute("title")).toBe("Choose a language.");
    const button = screen.getByRole("button", { name: "Apply" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("uses fullWidth class when requested", () => {
    const { container } = render(
      <TooltipWrap label="Hint" fullWidth>
        <span>Child</span>
      </TooltipWrap>,
    );
    expect(container.querySelector(".tooltipWrapFullWidth")).not.toBeNull();
  });
});

describe("TooltipButton", () => {
  it("forwards tooltipLabel to the wrapper", () => {
    const { container } = render(
      <TooltipButton tooltipLabel="Wait for the current step to finish." disabled fullWidth>
        Upload
      </TooltipButton>,
    );
    const wrap = container.querySelector(".tooltipWrap");
    expect(wrap?.getAttribute("data-tooltip")).toBe("Wait for the current step to finish.");
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
